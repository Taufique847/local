import { Types } from 'mongoose';
import { CommunicationLog } from '../models/communication-log.model';
import { Business } from '../models/business.model';
import { Customer } from '../models/customer.model';
import { Appointment } from '../models/appointment.model';
import { Service } from '../models/service.model';
import { CommunicationService } from './communication.service';
import { EmailService } from './email.service';
import { renderNotification, DEFAULT_CHANNELS } from './notification-templates';
import {
  MessageType,
  MessageChannel,
  NotificationVars,
  NotificationRecipient,
  NotificationResult,
  NotificationChannelResult,
  SendNotificationOptions,
  CHANNEL_BODY_LIMIT,
} from '../types/communication.types';
import { config } from '../config/env';
import { AppError } from '../types';
import { logger } from '../utils/logger';
import {
  formatDateTimeInZone,
  formatDateInZone,
  formatAddress,
  formatMoney,
} from '../utils/format';

const log = logger.child({ module: 'notification' });

/**
 * The single entry point for every customer-facing notification.
 *
 * Before this existed there were two unrelated senders — `CommunicationService`
 * for SMS and `EmailService` for three auth emails — and nothing that could send
 * the same message on both channels or record that it had. Copy lived as inline
 * literals at thirteen call sites, so the confirmation text a customer got from
 * the voice agent and the one they got from the booking modal were different
 * strings maintained in different files.
 *
 * Three properties callers can rely on:
 *
 *  1. **It does not throw.** A booking must not fail because a confirmation could
 *     not be delivered. Every outcome comes back in `NotificationResult`, per
 *     channel, distinguishing `sent` from a deliberate `skipped` and a `failed`.
 *     Callers that genuinely need delivery can inspect `sentAny`.
 *  2. **Every attempt is logged**, on both channels, in the same collection with
 *     the same shape — including attempts that failed because a provider was not
 *     configured. Silence in the log means nothing was attempted.
 *  3. **Channel guards are not bypassable by accident.** The SMS path always goes
 *     through `CommunicationService.sendMessage`, so opt-out, quiet hours and
 *     From-number resolution are enforced by the same code as before.
 */
export class NotificationService {
  /**
   * Resolves the channel list for this send.
   *
   * An explicit `channels` option wins; otherwise the per-type default applies.
   * `'both'` is expanded rather than treated as a third channel so that
   * everything downstream only ever deals in real channels.
   */
  private static resolveChannels(
    type: MessageType,
    preference: SendNotificationOptions['channels']
  ): MessageChannel[] {
    if (preference === 'both') return ['sms', 'email'];
    if (preference === 'sms' || preference === 'email') return [preference];
    return DEFAULT_CHANNELS[type] ?? ['sms'];
  }

  /**
   * Sends an appointment notification, deriving every variable from the record.
   *
   * A single place that knows how to turn an appointment into customer-facing
   * copy. The alternative — each call site assembling its own vars — is what
   * produced a confirmation SMS formatted in the server's timezone from the voice
   * agent and nothing at all from every other booking path.
   *
   * Safe to call with an appointment id or a document. Never throws.
   */
  public static async notifyAppointment(
    businessId: Types.ObjectId | string,
    appointmentId: Types.ObjectId | string,
    type: MessageType,
    options: SendNotificationOptions = {}
  ): Promise<NotificationResult> {
    const empty = (reason: string): NotificationResult => ({
      type,
      results: [{ channel: 'sms', status: 'skipped', reason }],
      sentAny: false,
    });

    try {
      const appointment = await Appointment.findOne({ _id: appointmentId, businessId })
        .select('customerId serviceId startAt timezone address technicianName status')
        .lean();

      if (!appointment) return empty('appointment_not_found');

      const service = appointment.serviceId
        ? await Service.findById(appointment.serviceId).select('name').lean()
        : null;

      const customer = await Customer.findOne({
        _id: appointment.customerId,
        businessId,
      })
        .select('address')
        .lean();

      return await this.send(
        businessId,
        type,
        {
          customerId: String(appointment.customerId),
          appointmentId: String(appointment._id),
        },
        {
          dateTime: formatDateTimeInZone(appointment.startAt, appointment.timezone),
          address: formatAddress(appointment.address) ?? formatAddress(customer?.address),
          serviceName: service?.name,
          technicianName: appointment.technicianName,
        },
        options
      );
    } catch (err: any) {
      log.error('notify_appointment_failed', {
        businessId: String(businessId),
        appointmentId: String(appointmentId),
        type,
        reason: err?.message,
      });
      return empty('unexpected_error');
    }
  }

  /**
   * Sends an invoice notification — either the invoice itself or a payment
   * receipt.
   *
   * Takes the document rather than an id because every caller already has it in
   * hand, and re-reading it would open a window where the amount in the email
   * disagrees with the amount that was just written.
   *
   * `amount` is chosen per type on purpose: an invoice email must show what is
   * still owed, and a receipt must show what was actually taken. Showing the
   * total on a receipt for a partial payment would tell a customer they had paid
   * more than they did.
   */
  public static async notifyInvoice(
    invoice: {
      _id: Types.ObjectId;
      businessId: Types.ObjectId;
      customerId: Types.ObjectId;
      appointmentId?: Types.ObjectId | null;
      invoiceNumber: string;
      totalAmount: number;
      balanceDue: number;
      dueDate?: Date;
      shareToken: string;
      paymentMethod?: string;
    },
    type: 'invoice_issued' | 'payment_receipt',
    amountReceived?: number
  ): Promise<NotificationResult> {
    try {
      const business = await Business.findById(invoice.businessId).select('timezone').lean();
      const timezone = business?.timezone;

      const amount =
        type === 'payment_receipt'
          ? formatMoney(amountReceived ?? invoice.totalAmount - invoice.balanceDue)
          : formatMoney(invoice.balanceDue > 0 ? invoice.balanceDue : invoice.totalAmount);

      return await this.send(
        invoice.businessId,
        type,
        {
          customerId: String(invoice.customerId),
          appointmentId: invoice.appointmentId ? String(invoice.appointmentId) : undefined,
        },
        {
          documentNumber: invoice.invoiceNumber,
          amount,
          dueDate:
            type === 'invoice_issued' && invoice.dueDate
              ? formatDateInZone(invoice.dueDate, timezone)
              : undefined,
          paymentMethod:
            type === 'payment_receipt' ? this.paymentMethodLabel(invoice.paymentMethod) : undefined,
          link: `${config.frontendUrl}/portal/invoice/${invoice.shareToken}`,
        },
        // A receipt and an invoice are both transactional records of money that
        // has already moved or is already owed, so neither waits for the morning.
        { bypassQuietHours: true }
      );
    } catch (err: any) {
      log.error('notify_invoice_failed', {
        invoiceId: String(invoice._id),
        type,
        reason: err?.message,
      });
      return { type, results: [{ channel: 'email', status: 'failed', reason: 'unexpected_error' }], sentAny: false };
    }
  }

  private static paymentMethodLabel(method?: string): string | undefined {
    if (!method) return undefined;
    const labels: Record<string, string> = {
      cash: 'Cash',
      check: 'Check',
      card: 'Card',
      bank_transfer: 'Bank transfer',
      other: 'Other',
    };
    return labels[method] ?? method;
  }

  /**
   * Sends a quote to the customer with its portal link.
   *
   * This is the notification whose absence made the e-signature feature
   * unreachable: quotes were created with `status: 'sent'` and a share token, and
   * the only place that token ever appeared was the owner's own dashboard.
   */
  public static async notifyEstimate(estimate: {
    _id: Types.ObjectId;
    businessId: Types.ObjectId;
    customerId: Types.ObjectId;
    appointmentId?: Types.ObjectId | null;
    estimateNumber: string;
    title?: string;
    totalAmount: number;
    shareToken: string;
  }): Promise<NotificationResult> {
    try {
      return await this.send(
        estimate.businessId,
        'estimate_sent',
        {
          customerId: String(estimate.customerId),
          appointmentId: estimate.appointmentId ? String(estimate.appointmentId) : undefined,
        },
        {
          documentNumber: estimate.estimateNumber,
          amount: formatMoney(estimate.totalAmount),
          serviceName: estimate.title,
          link: `${config.frontendUrl}/portal/quote/${estimate.shareToken}`,
        },
        { bypassQuietHours: true }
      );
    } catch (err: any) {
      log.error('notify_estimate_failed', {
        estimateId: String(estimate._id),
        reason: err?.message,
      });
      return {
        type: 'estimate_sent',
        results: [{ channel: 'email', status: 'failed', reason: 'unexpected_error' }],
        sentAny: false,
      };
    }
  }

  public static async send(
    businessId: Types.ObjectId | string,
    type: MessageType,
    recipient: NotificationRecipient,
    vars: NotificationVars = {},
    options: SendNotificationOptions = {}
  ): Promise<NotificationResult> {
    const results: NotificationChannelResult[] = [];

    const finish = (): NotificationResult => ({
      type,
      results,
      sentAny: results.some((r) => r.status === 'sent'),
    });

    const business = await Business.findById(businessId)
      .select('name phone email timezone')
      .lean();

    if (!business) {
      // Not a throw: the caller is mid-transaction on something that already
      // succeeded. But this is a programming error, so it is logged loudly.
      log.error('notification_business_missing', { businessId: String(businessId), type });
      results.push({ channel: 'sms', status: 'failed', reason: 'business_not_found' });
      return finish();
    }

    /**
     * Recipient addresses come from the customer record when there is one, and
     * only fall back to what the caller passed. A caller-supplied address is
     * trusted for leads (which have no Customer row) but must not override the
     * customer's own contact details, or a stale value at one call site would
     * quietly redirect a customer's invoice.
     */
    let phone = recipient.phone ?? null;
    let email = recipient.email ?? null;
    let customerName = recipient.name;
    let customerId = recipient.customerId;

    if (recipient.customerId) {
      const customer = await Customer.findOne({
        _id: recipient.customerId,
        businessId,
      })
        // `isOptedOut` is deliberately not read here — the SMS path enforces it
        // inside `CommunicationService.sendMessage`, and it does not apply to
        // email. See the note in `sendEmail`.
        .select('firstName lastName phone email')
        .lean();

      if (!customer) {
        log.error('notification_customer_not_in_tenant', {
          businessId: String(businessId),
          customerId: String(recipient.customerId),
          type,
        });
        results.push({ channel: 'sms', status: 'failed', reason: 'customer_not_found' });
        return finish();
      }

      phone = customer.phone || phone;
      email = customer.email || email;
      customerName =
        customerName || [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
      customerId = String(customer._id);
    }

    const mergedVars: NotificationVars = {
      businessName: business.name,
      businessPhone: business.phone,
      businessEmail: business.email,
      customerName,
      ...vars,
    };

    const channels = this.resolveChannels(type, options.channels);

    for (const channel of channels) {
      try {
        const result =
          channel === 'sms'
            ? await this.sendSms(
                businessId,
                type,
                { ...recipient, customerId, phone },
                mergedVars,
                options
              )
            : await this.sendEmail(
                businessId,
                type,
                { ...recipient, customerId, email },
                mergedVars,
                options,
                business.name
              );
        results.push(result);
      } catch (err: any) {
        // Belt and braces. The per-channel methods are written not to throw, so
        // reaching here means an unforeseen fault, and swallowing it silently is
        // exactly the failure mode this service exists to remove.
        log.error('notification_channel_threw', {
          businessId: String(businessId),
          type,
          channel,
          reason: err?.message,
        });
        results.push({ channel, status: 'failed', reason: 'unexpected_error' });
      }
    }

    return finish();
  }

  private static async sendSms(
    businessId: Types.ObjectId | string,
    type: MessageType,
    recipient: NotificationRecipient,
    vars: NotificationVars,
    options: SendNotificationOptions
  ): Promise<NotificationChannelResult> {
    if (!recipient.phone) {
      return { channel: 'sms', status: 'skipped', reason: 'no_phone_number' };
    }

    const body = options.bodyOverride ?? renderNotification(type, 'sms', vars)?.body;

    // An empty body is a missing template, not a blank message to send.
    if (!body || !body.trim()) {
      log.warn('notification_no_sms_template', { type });
      return { channel: 'sms', status: 'skipped', reason: 'no_template_for_channel' };
    }

    try {
      const sent = await CommunicationService.sendMessage(businessId, {
        customerId: recipient.customerId,
        leadId: recipient.leadId,
        appointmentId: recipient.appointmentId,
        to: recipient.phone,
        body: body.slice(0, CHANNEL_BODY_LIMIT.sms),
        type,
        bypassQuietHours: options.bypassQuietHours,
      });
      return { channel: 'sms', status: 'sent', logId: String(sent._id) };
    } catch (err: any) {
      /**
       * 409 means the platform decided not to send — the customer opted out, it
       * is outside texting hours, or no line is connected. Those are policy
       * outcomes, and reporting them as failures would have an operator chasing
       * an outage that is not happening. Anything else is a fault.
       */
      const isRefusal = err instanceof AppError && err.statusCode === 409;
      if (!isRefusal) {
        log.error('notification_sms_failed', {
          businessId: String(businessId),
          type,
          reason: err?.message,
        });
      }
      return {
        channel: 'sms',
        status: isRefusal ? 'skipped' : 'failed',
        reason: err instanceof AppError ? this.refusalCode(err.message) : 'send_error',
      };
    }
  }

  /**
   * Turns the operator-facing refusal sentence into a stable machine code.
   *
   * The messages themselves are user-facing copy and will be reworded; callers
   * and tests need something that will not change underneath them.
   */
  private static refusalCode(message: string): string {
    const m = (message || '').toLowerCase();
    if (m.includes('opted out')) return 'customer_opted_out';
    if (m.includes('texting hours')) return 'quiet_hours';
    if (m.includes('no active phone line')) return 'no_sending_number';
    if (m.includes('telephony is not configured')) return 'telephony_not_configured';
    return 'send_error';
  }

  private static async sendEmail(
    businessId: Types.ObjectId | string,
    type: MessageType,
    recipient: NotificationRecipient,
    vars: NotificationVars,
    options: SendNotificationOptions,
    businessName: string
  ): Promise<NotificationChannelResult> {
    if (!recipient.email) {
      return { channel: 'email', status: 'skipped', reason: 'no_email_address' };
    }

    const rendered = renderNotification(type, 'email', vars);

    if (!rendered) {
      return { channel: 'email', status: 'skipped', reason: 'no_template_for_channel' };
    }

    const subject = options.subjectOverride ?? rendered.subject ?? `A message from ${businessName}`;
    const text = options.bodyOverride ?? rendered.body;
    // A body override is plain text by definition, so the HTML twin is dropped
    // rather than left describing different content.
    const html = options.bodyOverride ? undefined : rendered.html;

    if (!text.trim()) {
      log.warn('notification_empty_email_body', { type });
      return { channel: 'email', status: 'skipped', reason: 'no_template_for_channel' };
    }

    const fromAddress = config.emailFromAddress || 'not-configured@localhost';

    /**
     * Logged before the attempt, in the same `queued` state as SMS, so a crash
     * between here and the provider call leaves a record that something was
     * attempted rather than no trace at all.
     */
    const entry = await CommunicationLog.create({
      businessId,
      customerId: recipient.customerId || null,
      leadId: recipient.leadId || null,
      appointmentId: recipient.appointmentId || null,
      direction: 'outbound',
      channel: 'email',
      type,
      from: fromAddress,
      to: recipient.email,
      subject: subject.slice(0, 200),
      body: text.slice(0, CHANNEL_BODY_LIMIT.email),
      status: 'queued',
    });

    /**
     * Quiet hours and the SMS opt-out flag are deliberately NOT applied here.
     *
     * Both are text/voice rules. TCPA's 8am–9pm window covers calls and texts,
     * not email, and `Customer.isOptedOut` is set only by an SMS STOP keyword —
     * its own refusal message says the customer "cannot be contacted by SMS".
     * Treating it as an email suppression would mean a customer who stopped
     * texts never receives their own invoice or receipt, which are transactional
     * and exempt from CAN-SPAM opt-out in the first place.
     *
     * A separate email-consent flag is the right way to suppress email, and it
     * belongs with the marketing campaigns on Day 13 — not smuggled in here off
     * the back of a differently-meaning field.
     */

    try {
      const res = await EmailService.send({ to: recipient.email, subject, text, html });
      entry.status = 'sent';
      if (res.id) entry.providerMessageId = res.id;
      await entry.save();
      return { channel: 'email', status: 'sent', logId: String(entry._id) };
    } catch (err: any) {
      const notConfigured = err instanceof AppError && err.statusCode === 503;

      entry.status = 'failed';
      entry.errorCode = notConfigured ? 'email_not_configured' : 'email_send_failed';
      entry.errorMessage = (err?.message || 'Email send error').slice(0, 500);
      await entry.save();

      log.error('notification_email_failed', {
        businessId: String(businessId),
        type,
        to: recipient.email,
        reason: err?.message,
      });

      /**
       * An unconfigured provider is still reported as `failed`, not `skipped`.
       *
       * The SMS path made the same call for the same reason: an operator looking
       * at a customer who never got their invoice needs to see a failure with a
       * cause, not an absence. `skipped` would read as "we chose not to".
       */
      return {
        channel: 'email',
        status: 'failed',
        reason: notConfigured ? 'email_not_configured' : 'email_send_failed',
        logId: String(entry._id),
      };
    }
  }
}

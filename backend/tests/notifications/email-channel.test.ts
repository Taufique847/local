import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import {
  createWorkspace,
  createCustomerRecord,
  createServiceRecord,
  type Workspace,
} from '../helpers/factories';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { Customer } from '../../src/models/customer.model';
import { Business } from '../../src/models/business.model';
import { NotificationService } from '../../src/services/notification.service';
import { CommunicationService } from '../../src/services/communication.service';
import { EmailService } from '../../src/services/email.service';
import { AppointmentService } from '../../src/services/appointment.service';
import { EstimateService } from '../../src/services/estimate.service';
import { InvoiceService } from '../../src/services/invoice.service';
import { renderNotification, renderEmailLayout } from '../../src/services/notification-templates';
import { CHANNEL_BODY_LIMIT } from '../../src/types/communication.types';

/**
 * Email as a real channel.
 *
 * Two distinct things are under test and they fail in different ways:
 *
 *  - The log can physically hold an email. The `channel` enum was `['sms']` and
 *    the body cap was the Twilio segment ceiling, so before this change an email
 *    row could not be inserted at all — a schema-validation failure, not a
 *    delivery failure.
 *  - The triggers that had no sender now have one. An invoice used to be created
 *    with a payment link the customer never received.
 */

const setupSendableWorkspace = async (): Promise<Workspace> => {
  const ws = await createWorkspace();

  // Without an active primary line, sendMessage refuses before attempting, so
  // every SMS assertion below would pass for the wrong reason.
  await BusinessPhoneNumber.create({
    businessId: ws.businessId,
    phoneNumber: '+15557770000',
    status: 'active',
    isPrimary: true,
  });

  await Business.findByIdAndUpdate(ws.businessId, { email: 'shop@example.com' });

  return ws;
};

/** Makes the SMS leg succeed without touching the network. */
const stubSmsTransport = () => {
  const create = vi.fn().mockResolvedValue({ sid: 'SM_stub_1' });
  vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
    messages: { create },
  });
  return create;
};

describe('CommunicationLog can carry an email', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupSendableWorkspace();
  });

  it('accepts channel "email" with a subject', async () => {
    const row = await CommunicationLog.create({
      businessId: ws.businessId,
      direction: 'outbound',
      channel: 'email',
      type: 'invoice_issued',
      from: 'shop@example.com',
      to: 'homeowner@example.com',
      subject: 'Invoice 1001',
      body: 'Your invoice is ready.',
      status: 'queued',
    });

    expect(row.channel).toBe('email');
    expect(row.subject).toBe('Invoice 1001');
  });

  it('rejects a channel that is not sms or email', async () => {
    await expect(
      CommunicationLog.create({
        businessId: ws.businessId,
        direction: 'outbound',
        channel: 'carrier_pigeon',
        type: 'custom',
        from: 'a@example.com',
        to: 'b@example.com',
        body: 'hello',
      })
    ).rejects.toThrow();
  });

  /**
   * The body cap is per channel. A flat 1600 would make the email channel
   * unusable for anything longer than a text message, which is every real email.
   */
  it('allows an email body far longer than the SMS ceiling', async () => {
    const longBody = 'x'.repeat(CHANNEL_BODY_LIMIT.sms + 500);

    const row = await CommunicationLog.create({
      businessId: ws.businessId,
      direction: 'outbound',
      channel: 'email',
      type: 'invoice_issued',
      from: 'shop@example.com',
      to: 'homeowner@example.com',
      subject: 'Long one',
      body: longBody,
      status: 'queued',
    });

    expect(row.body.length).toBe(CHANNEL_BODY_LIMIT.sms + 500);
  });

  it('still enforces the SMS ceiling on the SMS channel', async () => {
    await expect(
      CommunicationLog.create({
        businessId: ws.businessId,
        direction: 'outbound',
        channel: 'sms',
        type: 'custom',
        from: '+15557770000',
        to: '+15552223333',
        body: 'x'.repeat(CHANNEL_BODY_LIMIT.sms + 1),
      })
    ).rejects.toThrow();
  });

  it('rejects an email body past the email ceiling too', async () => {
    await expect(
      CommunicationLog.create({
        businessId: ws.businessId,
        direction: 'outbound',
        channel: 'email',
        type: 'custom',
        from: 'shop@example.com',
        to: 'homeowner@example.com',
        body: 'x'.repeat(CHANNEL_BODY_LIMIT.email + 1),
      })
    ).rejects.toThrow();
  });
});

describe('NotificationService email leg', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupSendableWorkspace();
  });

  it('logs an email row with channel "email" and the provider id', async () => {
    const send = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    const customer = await createCustomerRecord(ws.businessId);

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1001', amount: '$420.00', link: 'https://portal.test/inv' },
      { channels: 'email' }
    );

    expect(result.sentAny).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);

    const rows = await CommunicationLog.find({ businessId: ws.businessId, channel: 'email' });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('sent');
    expect(rows[0].type).toBe('invoice_issued');
    expect(rows[0].to).toBe('homeowner@example.com');
    expect(rows[0].subject).toContain('INV-1001');
    expect(rows[0].providerMessageId).toBe('resend_abc');
    // The Resend id must not land in twilioSid, which the Twilio delivery-status
        // webhook keys on.
    expect(rows[0].twilioSid).toBeUndefined();
  });

  it('sends the plain-text twin alongside the HTML', async () => {
    const send = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    const customer = await createCustomerRecord(ws.businessId);

    await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1001', amount: '$420.00', link: 'https://portal.test/inv' },
      { channels: 'email' }
    );

    const message = send.mock.calls[0][0];
    expect(message.text.length).toBeGreaterThan(0);
    expect(message.html).toContain('<html>');
    // The link has to survive into both, or the customer cannot pay.
    expect(message.text).toContain('https://portal.test/inv');
    expect(message.html).toContain('https://portal.test/inv');
  });

  /**
   * A failure is recorded, not swallowed. An operator looking at a customer who
   * never received their invoice needs a row with a cause.
   */
  it('records a failed row when the provider is not configured', async () => {
    // No stub: EMAIL_API_KEY is unset in the test env, so the real service refuses.
    const customer = await createCustomerRecord(ws.businessId);

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1001' },
      { channels: 'email' }
    );

    expect(result.sentAny).toBe(false);
    expect(result.results[0]).toMatchObject({
      channel: 'email',
      status: 'failed',
      reason: 'email_not_configured',
    });

    const rows = await CommunicationLog.find({ businessId: ws.businessId, channel: 'email' });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].errorCode).toBe('email_not_configured');
  });

  it('skips the email leg when the customer has no email address', async () => {
    vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    const customer = await createCustomerRecord(ws.businessId);
    await Customer.findByIdAndUpdate(customer._id, { $unset: { email: 1 } });

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      {},
      { channels: 'email' }
    );

    expect(result.results[0]).toMatchObject({
      channel: 'email',
      status: 'skipped',
      reason: 'no_email_address',
    });
    // Nothing attempted means nothing logged.
    expect(await CommunicationLog.countDocuments({ channel: 'email' })).toBe(0);
  });

  it('refuses to send a type that has no email copy', async () => {
    const send = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    const customer = await createCustomerRecord(ws.businessId);

    const result = await NotificationService.send(
      ws.businessId,
      'missed_call_followup',
      { customerId: customer._id.toString() },
      {},
      { channels: 'email' }
    );

    expect(result.results[0]).toMatchObject({
      status: 'skipped',
      reason: 'no_template_for_channel',
    });
    expect(send).not.toHaveBeenCalled();
  });

  /**
   * `isOptedOut` is set only by an SMS STOP keyword and its own refusal message
   * says the customer cannot be contacted *by SMS*. Suppressing transactional
   * email off the back of it would mean a customer who stopped texts never
   * receives their own invoice.
   */
  it('blocks the SMS leg for an opted-out customer but still sends the email', async () => {
    const send = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    const smsCreate = stubSmsTransport();

    const customer = await createCustomerRecord(ws.businessId);
    await Customer.findByIdAndUpdate(customer._id, { isOptedOut: true, optedOutAt: new Date() });

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1001', link: 'https://portal.test/inv' },
      { channels: 'both' }
    );

    const sms = result.results.find((r) => r.channel === 'sms');
    const email = result.results.find((r) => r.channel === 'email');

    expect(sms).toMatchObject({ status: 'skipped', reason: 'customer_opted_out' });
    expect(email).toMatchObject({ status: 'sent' });
    expect(smsCreate).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports the SMS leg as skipped, not failed, during quiet hours', async () => {
    vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    stubSmsTransport();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(true);

    const customer = await createCustomerRecord(ws.businessId);

    const result = await NotificationService.send(
      ws.businessId,
      'appointment_reminder',
      { customerId: customer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' },
      { channels: 'both' }
    );

    expect(result.results.find((r) => r.channel === 'sms')).toMatchObject({
      status: 'skipped',
      reason: 'quiet_hours',
    });
    // Email is not covered by the TCPA texting window, so it goes.
    expect(result.results.find((r) => r.channel === 'email')).toMatchObject({ status: 'sent' });
  });

  it('will not send to a customer belonging to another business', async () => {
    const send = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    const other = await setupSendableWorkspace();
    const theirCustomer = await createCustomerRecord(other.businessId);

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: theirCustomer._id.toString() },
      {},
      { channels: 'email' }
    );

    expect(result.sentAny).toBe(false);
    expect(result.results[0].reason).toBe('customer_not_found');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('templates', () => {
  it('escapes HTML in interpolated values', () => {
    const { html, text } = renderEmailLayout({
      businessName: 'Bob & Sons <Heating>',
      heading: 'Hi',
      paragraphs: ['A "quoted" line'],
    });

    expect(html).toContain('Bob &amp; Sons &lt;Heating&gt;');
    expect(html).not.toContain('<Heating>');
    // The plain-text twin is not markup and must stay literal.
    expect(text).toContain('Bob & Sons <Heating>');
  });

  it('returns null rather than an empty email for a type with no copy', () => {
    expect(renderNotification('lead_followup', 'email', {})).toBeNull();
    expect(renderNotification('lead_followup', 'sms', {})).not.toBeNull();
  });

  it('states the real appointment time instead of a hardcoded day', () => {
    const rendered = renderNotification('appointment_reminder', 'sms', {
      businessName: 'Acme Air',
      businessPhone: '+15551110000',
      dateTime: 'Fri, Mar 6 at 9:00 AM CST',
      serviceName: 'AC Tune-Up',
    });

    expect(rendered!.body).toContain('Fri, Mar 6 at 9:00 AM CST');
    // The old copy said "scheduled for tomorrow" regardless of the lead time, so a
    // two-hour reminder named the wrong day.
    expect(rendered!.body).not.toContain('tomorrow');
    expect(rendered!.body).toContain('+15551110000');
  });

  /**
   * Guards against re-introducing an instruction the inbound handler cannot
   * honour. `handleInboundSms` has no branch for C or R — a reply is logged but
   * never acknowledged — so telling the customer to send one would leave them
   * believing they had rescheduled. This assertion should be deleted in the same
   * change that adds the keyword branch, not before.
   */
  it('does not instruct a reply the inbound handler cannot parse yet', () => {
    const rendered = renderNotification('appointment_reminder', 'sms', {
      businessName: 'Acme Air',
      dateTime: 'Fri, Mar 6 at 9:00 AM CST',
    });

    expect(rendered!.body).not.toMatch(/reply\s+c\b/i);
    expect(rendered!.body).not.toMatch(/reply\s+r\b/i);
  });
});

describe('triggers that previously had no sender', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupSendableWorkspace();
    vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_abc' });
    // Quiet hours are wall-clock dependent; pinned so these assertions do not
    // pass or fail based on what time the suite happens to run.
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
    stubSmsTransport();
  });

  it('booking an appointment sends one confirmation per channel', async () => {
    const [customer, service] = await Promise.all([
      createCustomerRecord(ws.businessId),
      createServiceRecord(ws.businessId),
    ]);

    await AppointmentService.createAppointment(ws.businessId, {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    const rows = await CommunicationLog.find({
      businessId: ws.businessId,
      type: 'appointment_confirmation',
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'sms']);
    expect(rows.every((r) => r.status === 'sent')).toBe(true);
  });

  it('the confirmation renders the time in the business timezone, not the server one', async () => {
    await Business.findByIdAndUpdate(ws.businessId, { timezone: 'America/Phoenix' });

    const [customer, service] = await Promise.all([
      createCustomerRecord(ws.businessId),
      createServiceRecord(ws.businessId),
    ]);

    // 20:00 UTC is 1:00 PM in Phoenix (UTC-7, no DST).
    const startAt = new Date('2026-07-15T20:00:00.000Z');

    await AppointmentService.createAppointment(ws.businessId, {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      startAt: startAt.toISOString(),
    });

    const sms = await CommunicationLog.findOne({
      businessId: ws.businessId,
      type: 'appointment_confirmation',
      channel: 'sms',
    });

    expect(sms!.body).toContain('1:00 PM');
  });

  it('creating an estimate sends the quote with its portal link', async () => {
    const customer = await createCustomerRecord(ws.businessId);

    const estimate = await EstimateService.createEstimate(ws.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Compressor', quantity: 1, unitPrice: 900, total: 900 }] as any,
    });

    const rows = await CommunicationLog.find({
      businessId: ws.businessId,
      type: 'estimate_sent',
    });

    expect(rows.length).toBeGreaterThan(0);
    // The share token is the only thing that makes the e-signature page reachable.
    expect(rows.every((r) => r.body.includes(estimate.shareToken))).toBe(true);
  });

  it('creating an invoice sends it with the payment link', async () => {
    const customer = await createCustomerRecord(ws.businessId);

    const invoice = await InvoiceService.createInvoice(ws.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Repair', quantity: 1, unitPrice: 200, total: 200 }] as any,
    });

    const rows = await CommunicationLog.find({
      businessId: ws.businessId,
      type: 'invoice_issued',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.body.includes(invoice.shareToken))).toBe(true);
  });

  it('recording a payment sends a receipt for the amount actually taken', async () => {
    const customer = await createCustomerRecord(ws.businessId);

    const invoice = await InvoiceService.createInvoice(ws.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Repair', quantity: 1, unitPrice: 200, total: 200 }] as any,
      taxRate: 0,
    });

    await CommunicationLog.deleteMany({});

    await InvoiceService.recordPaymentForBusiness(ws.businessId, invoice._id.toString(), {
      amount: 50,
      paymentMethod: 'check',
    });

    const receipts = await CommunicationLog.find({
      businessId: ws.businessId,
      type: 'payment_receipt',
    });

    expect(receipts.length).toBeGreaterThan(0);
    // $50, not the $200 total. A receipt for a partial payment that shows the
    // full amount tells the customer they are square when they are not.
    expect(receipts.every((r) => r.body.includes('$50.00'))).toBe(true);
    expect(receipts.some((r) => r.body.includes('$200.00'))).toBe(false);
  });

  /**
   * The outer catch in `send` is the last line of defence, and it is reachable
   * only by a fault the per-channel methods do not already handle — a failure
   * writing the log row itself, for instance, which happens outside their own
   * try blocks. Without this test that catch is unverified: stubbing the email
   * provider to reject exercises the inner handler instead, and a mutation
   * turning the outer catch into a rethrow survives unnoticed.
   */
  it('returns a result instead of throwing when logging itself fails', async () => {
    const customer = await createCustomerRecord(ws.businessId);

    vi.spyOn(CommunicationLog, 'create').mockRejectedValue(new Error('log write failed') as never);

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1001' },
      { channels: 'both' }
    );

    expect(result.sentAny).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.status === 'failed')).toBe(true);
    expect(result.results.some((r) => r.reason === 'unexpected_error')).toBe(true);
  });

  it('a failed notification does not fail the booking', async () => {
    vi.spyOn(EmailService, 'send').mockRejectedValue(new Error('provider exploded'));
    vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue(null);

    const [customer, service] = await Promise.all([
      createCustomerRecord(ws.businessId),
      createServiceRecord(ws.businessId),
    ]);

    const appointment = await AppointmentService.createAppointment(ws.businessId, {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(appointment._id).toBeInstanceOf(Types.ObjectId);

    // Both legs recorded as failed, so the silence is visible.
    const rows = await CommunicationLog.find({ businessId: ws.businessId });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.status === 'failed')).toBe(true);
  });
});

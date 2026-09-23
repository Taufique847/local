import { MessageType, MessageChannel, NotificationVars } from '../types/communication.types';

/**
 * Notification copy, in one place, for every channel.
 *
 * Previously the SMS bodies lived in a switch inside `CommunicationService` and
 * the four or five messages that mattered most were inline string literals at
 * thirteen separate call sites. There was no email copy at all, because email
 * was not a channel.
 *
 * Two rules hold this together:
 *
 *  - A type either has copy for a channel or it does not. `renderNotification`
 *    returns `null` rather than an empty string, so a missing template is a
 *    refusal to send and not a blank message delivered to a customer.
 *  - The email body is generated from the same variables as the SMS body, and
 *    every HTML email carries a plain-text twin. Sending HTML alone is what gets
 *    transactional mail scored as spam.
 *
 * Per-business overrides are Day 8 (`MessageTemplate`). This module is the
 * fallback those overrides fall back *to*, so its shape is deliberately a pure
 * function of `(type, channel, vars)` with no database access.
 */

/** Minimal HTML entity escaping. Every interpolated value passes through this. */
const esc = (value: string | undefined): string => {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export interface EmailLayoutInput {
  businessName: string;
  /** The h1. Also used as the first line of the plain-text twin. */
  heading: string;
  /** One paragraph each, plain text. Escaped for the HTML version. */
  paragraphs: string[];
  /** Label/value rows rendered as a small definition table. */
  details?: Array<{ label: string; value: string }>;
  cta?: { label: string; url: string };
  /** Small print under the rule. Contact details, opt-out wording. */
  footerLines?: string[];
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/**
 * The shared email shell: business name header, body, optional detail table,
 * optional single call to action, footer.
 *
 * Inline styles and a table-free layout on purpose — this has to survive Gmail,
 * Outlook and Apple Mail, none of which agree on much beyond that. No template
 * engine and no MJML: one function producing two strings is auditable, and the
 * plain-text twin cannot fall out of sync because it is built from the same
 * input.
 */
export const renderEmailLayout = (input: EmailLayoutInput): RenderedEmail => {
  const { businessName, heading, paragraphs, details, cta, footerLines } = input;

  const textParts: string[] = [businessName, '', heading, ''];
  for (const p of paragraphs) textParts.push(p, '');
  if (details?.length) {
    for (const d of details) textParts.push(`${d.label}: ${d.value}`);
    textParts.push('');
  }
  if (cta) textParts.push(`${cta.label}: ${cta.url}`, '');
  if (footerLines?.length) {
    textParts.push('---');
    for (const line of footerLines) textParts.push(line);
  }

  const htmlParagraphs = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${esc(p)}</p>`
    )
    .join('');

  const htmlDetails = details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse;">` +
      details
        .map(
          (d) =>
            `<tr>` +
            `<td style="padding:6px 12px 6px 0;font-size:14px;color:#6b7280;vertical-align:top;white-space:nowrap;">${esc(d.label)}</td>` +
            `<td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${esc(d.value)}</td>` +
            `</tr>`
        )
        .join('') +
      `</table>`
    : '';

  // The URL is placed in an attribute, so it is escaped as an attribute value.
  const htmlCta = cta
    ? `<p style="margin:0 0 24px;"><a href="${esc(cta.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:15px;font-weight:600;">${esc(cta.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b7280;">If the button does not work, copy this link into your browser:<br />${esc(cta.url)}</p>`
    : '';

  const htmlFooter = footerLines?.length
    ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />` +
      footerLines
        .map(
          (line) =>
            `<p style="margin:0 0 6px;font-size:12px;line-height:18px;color:#6b7280;">${esc(line)}</p>`
        )
        .join('')
    : '';

  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<title>${esc(heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6;">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `<div style="background:#ffffff;border-radius:10px;padding:28px 24px;">` +
    `<p style="margin:0 0 20px;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#2563eb;">${esc(businessName)}</p>` +
    `<h1 style="margin:0 0 18px;font-size:22px;line-height:30px;color:#111827;">${esc(heading)}</h1>` +
    htmlParagraphs +
    htmlDetails +
    htmlCta +
    htmlFooter +
    `</div></div></body></html>`;

  return { text: textParts.join('\n').trimEnd(), html };
};

/** Fills in the neutral wording used when a variable was not supplied. */
const resolve = (vars: NotificationVars) => ({
  customer: vars.customerName || 'there',
  customerFormal: vars.customerName || 'valued customer',
  business: vars.businessName || 'our team',
  phone: vars.businessPhone || '',
  email: vars.businessEmail || '',
  dateTime: vars.dateTime || 'your scheduled time',
  address: vars.address || '',
  service: vars.serviceName || '',
  technician: vars.technicianName || '',
  amount: vars.amount || '',
  docNumber: vars.documentNumber || '',
  link: vars.link || '',
  dueDate: vars.dueDate || '',
  paymentMethod: vars.paymentMethod || '',
});

/** Standard footer for customer-facing email. */
const emailFooter = (v: ReturnType<typeof resolve>): string[] => {
  const lines: string[] = [];
  const contact = [v.phone, v.email].filter(Boolean).join(' · ');
  if (contact) lines.push(`Questions? ${contact}`);
  lines.push(`Sent by ${v.business}.`);
  return lines;
};

/** The detail rows shared by the appointment emails. */
const appointmentDetails = (v: ReturnType<typeof resolve>) => {
  const rows: Array<{ label: string; value: string }> = [];
  if (v.service) rows.push({ label: 'Service', value: v.service });
  rows.push({ label: 'When', value: v.dateTime });
  if (v.address) rows.push({ label: 'Where', value: v.address });
  if (v.technician) rows.push({ label: 'Technician', value: v.technician });
  return rows;
};

export interface RenderedNotification {
  /** Email only; `undefined` on the SMS channel. */
  subject?: string;
  /** The text body. For email this is the plain-text twin of `html`. */
  body: string;
  html?: string;
}

/**
 * Renders one notification for one channel.
 *
 * Returns `null` when this type has no copy for this channel — the caller must
 * treat that as "do not send", never as an empty body.
 */
export const renderNotification = (
  type: MessageType,
  channel: MessageChannel,
  vars: NotificationVars
): RenderedNotification | null => {
  const v = resolve(vars);

  if (channel === 'sms') {
    const body = renderSmsBody(type, v);
    return body ? { body } : null;
  }

  return renderEmailBody(type, v);
};

const renderSmsBody = (type: MessageType, v: ReturnType<typeof resolve>): string => {
  const addr = v.address ? ` at ${v.address}` : '';
  const srv = v.service ? ` for ${v.service}` : '';

  switch (type) {
    case 'appointment_confirmation':
      return `Hi ${v.customerFormal}, your appointment with ${v.business}${srv} is confirmed for ${v.dateTime}${addr}. Reply STOP to cancel notifications.`;
    case 'appointment_reminder':
      /**
       * Names the actual appointment time, and only promises what exists.
       *
       * The old copy hardcoded "scheduled for tomorrow" even though the lead time
       * is configurable per business, so a two-hour reminder told the customer the
       * wrong day. That is fixed by interpolating `dateTime`.
       *
       * It deliberately does NOT say "Reply C to confirm or R to reschedule" yet.
       * Nothing in `handleInboundSms` parses those keywords — a reply is logged as
       * an inbound row the owner can see, but the customer gets no acknowledgement
       * back. Printing an instruction the system silently drops is worse than
       * vague copy, because the customer believes they have rescheduled. The
       * keyword branch and this wording land together.
       */
      return `Reminder from ${v.business}: your appointment${srv} is ${v.dateTime}${addr}.${v.phone ? ` Need to change it? Call ${v.phone}.` : ''}`;
    case 'appointment_rescheduled':
      return `Hi ${v.customerFormal}, your appointment with ${v.business} has been rescheduled to ${v.dateTime}${addr}. Thank you!`;
    case 'appointment_cancelled':
      return `Hi ${v.customerFormal}, your appointment with ${v.business} has been cancelled. Call us at ${v.phone} to rebook whenever you're ready.`;
    case 'missed_call_followup':
      return `Hi! Sorry we missed your call at ${v.business}. How can we help you with your heating or AC today?`;
    case 'lead_followup':
      return `Hi ${v.customerFormal}, thank you for contacting ${v.business}. Our team is reviewing your service request and will follow up shortly!`;
    case 'estimate_sent':
      return `Hi ${v.customerFormal}, your quote${v.docNumber ? ` ${v.docNumber}` : ''} from ${v.business}${v.amount ? ` for ${v.amount}` : ''} is ready. View and approve it here: ${v.link}`;
    case 'invoice_issued':
      return `Hi ${v.customerFormal}, invoice${v.docNumber ? ` ${v.docNumber}` : ''} from ${v.business}${v.amount ? ` for ${v.amount}` : ''} is ready${v.dueDate ? `, due ${v.dueDate}` : ''}. Pay or view it here: ${v.link}`;
    case 'payment_receipt':
      return `Thanks ${v.customerFormal}! ${v.business} received your payment${v.amount ? ` of ${v.amount}` : ''}${v.docNumber ? ` for invoice ${v.docNumber}` : ''}. Receipt: ${v.link}`;
    case 'custom':
    default:
      return '';
  }
};

const renderEmailBody = (
  type: MessageType,
  v: ReturnType<typeof resolve>
): RenderedNotification | null => {
  const footerLines = emailFooter(v);

  switch (type) {
    case 'appointment_confirmation': {
      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading: 'Your appointment is confirmed',
        paragraphs: [
          `Hi ${v.customer},`,
          `We have you booked in. Here are the details:`,
        ],
        details: appointmentDetails(v),
        footerLines: [
          'Need to change something? Reply to this email or call us.',
          ...footerLines,
        ],
      });
      return { subject: `Appointment confirmed — ${v.dateTime}`, body: text, html };
    }

    case 'appointment_reminder': {
      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading: 'Reminder: your appointment is coming up',
        paragraphs: [
          `Hi ${v.customer},`,
          `This is a reminder about your upcoming appointment with ${v.business}.`,
        ],
        details: appointmentDetails(v),
        footerLines: [
          'If this time no longer works, reply to this email and we will find another.',
          ...footerLines,
        ],
      });
      return { subject: `Reminder: appointment ${v.dateTime}`, body: text, html };
    }

    case 'appointment_rescheduled': {
      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading: 'Your appointment has been rescheduled',
        paragraphs: [`Hi ${v.customer},`, `Your appointment has been moved. The new details are below.`],
        details: appointmentDetails(v),
        footerLines,
      });
      return { subject: `Appointment rescheduled — ${v.dateTime}`, body: text, html };
    }

    case 'appointment_cancelled': {
      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading: 'Your appointment has been cancelled',
        paragraphs: [
          `Hi ${v.customer},`,
          `Your appointment with ${v.business} has been cancelled. Nothing further is needed from you.`,
          v.phone
            ? `Whenever you are ready to rebook, call us at ${v.phone}.`
            : `Whenever you are ready to rebook, just reply to this email.`,
        ],
        footerLines,
      });
      return { subject: 'Appointment cancelled', body: text, html };
    }

    case 'estimate_sent': {
      const heading = v.docNumber ? `Your quote ${v.docNumber}` : 'Your quote is ready';
      const details: Array<{ label: string; value: string }> = [];
      if (v.docNumber) details.push({ label: 'Quote', value: v.docNumber });
      if (v.amount) details.push({ label: 'Total', value: v.amount });
      if (v.service) details.push({ label: 'Service', value: v.service });

      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading,
        paragraphs: [
          `Hi ${v.customer},`,
          `Your quote from ${v.business} is ready to review. You can approve and sign it online — no printing or scanning.`,
        ],
        details,
        cta: v.link ? { label: 'View and approve quote', url: v.link } : undefined,
        footerLines,
      });
      return {
        subject: v.docNumber ? `Quote ${v.docNumber} from ${v.business}` : `Your quote from ${v.business}`,
        body: text,
        html,
      };
    }

    case 'invoice_issued': {
      const details: Array<{ label: string; value: string }> = [];
      if (v.docNumber) details.push({ label: 'Invoice', value: v.docNumber });
      if (v.amount) details.push({ label: 'Amount due', value: v.amount });
      if (v.dueDate) details.push({ label: 'Due', value: v.dueDate });

      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading: v.docNumber ? `Invoice ${v.docNumber}` : 'Your invoice',
        paragraphs: [
          `Hi ${v.customer},`,
          `Thanks for your business. Your invoice from ${v.business} is below and can be paid online.`,
        ],
        details,
        cta: v.link ? { label: 'View and pay invoice', url: v.link } : undefined,
        footerLines,
      });
      return {
        subject: v.docNumber
          ? `Invoice ${v.docNumber} from ${v.business}`
          : `Your invoice from ${v.business}`,
        body: text,
        html,
      };
    }

    case 'payment_receipt': {
      const details: Array<{ label: string; value: string }> = [];
      if (v.docNumber) details.push({ label: 'Invoice', value: v.docNumber });
      if (v.amount) details.push({ label: 'Amount received', value: v.amount });
      if (v.paymentMethod) details.push({ label: 'Method', value: v.paymentMethod });

      const { text, html } = renderEmailLayout({
        businessName: v.business,
        heading: 'Payment received — thank you',
        paragraphs: [
          `Hi ${v.customer},`,
          `We have received your payment. This email is your receipt.`,
        ],
        details,
        cta: v.link ? { label: 'View invoice', url: v.link } : undefined,
        footerLines,
      });
      return {
        subject: v.docNumber ? `Receipt for invoice ${v.docNumber}` : 'Payment receipt',
        body: text,
        html,
      };
    }

    /**
     * No email copy. A missed call and a first-touch lead follow-up are
     * deliberately SMS-only: they are speed-to-lead messages measured in seconds,
     * and email is the wrong channel for both.
     */
    case 'missed_call_followup':
    case 'lead_followup':
    case 'custom':
    default:
      return null;
  }
};

/**
 * Which channels a type is sent on when the business has expressed no preference.
 *
 * Email-capable types default to both so the customer gets the durable copy they
 * can find later plus the immediate nudge. The two speed-to-lead types stay
 * SMS-only, matching `renderEmailBody` returning `null` for them.
 */
export const DEFAULT_CHANNELS: Record<MessageType, MessageChannel[]> = {
  appointment_confirmation: ['sms', 'email'],
  appointment_reminder: ['sms', 'email'],
  appointment_rescheduled: ['sms', 'email'],
  appointment_cancelled: ['sms', 'email'],
  missed_call_followup: ['sms'],
  lead_followup: ['sms'],
  estimate_sent: ['sms', 'email'],
  invoice_issued: ['sms', 'email'],
  payment_receipt: ['email'],
  custom: ['sms'],
};

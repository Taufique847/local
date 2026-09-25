import { config } from '../config/env';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'email' });

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body. Required — some clients and most spam filters want it. */
  text: string;
  html?: string;
  /**
   * Extra headers. Used for `List-Unsubscribe` and `List-Unsubscribe-Post` on
   * campaign mail.
   *
   * Those two are not decoration: Gmail and Outlook render a native "Unsubscribe"
   * button from them, and bulk senders without one get filtered. An unsubscribe link
   * buried in the footer satisfies the law; the header is what makes it usable, and a
   * recipient who cannot find the link marks the message as spam instead — which
   * costs the sender's domain reputation far more than the lost contact.
   */
  headers?: Record<string, string>;
}

/**
 * Transactional email.
 *
 * Provider-agnostic on purpose: the only integration shipped is Resend, chosen
 * because it needs a single API key and no SDK, but `EMAIL_PROVIDER` leaves room
 * for SES or SMTP later without touching callers.
 *
 * Follows the same rule as SMS: when the provider is not configured, sending
 * FAILS. It does not log the message and report success. A verification email
 * that silently went nowhere is worse than an error, because the user sits
 * waiting for a link that was never sent.
 */
export class EmailService {
  public static isConfigured(): boolean {
    return Boolean(config.emailApiKey && config.emailFromAddress);
  }

  public static async send(message: EmailMessage): Promise<{ id?: string }> {
    if (!this.isConfigured()) {
      log.error('email_send_skipped_not_configured', {
        to: message.to,
        subject: message.subject,
      });
      throw new AppError(
        'Email is not configured on this server, so no message was sent.',
        503
      );
    }

    if (config.emailProvider !== 'resend') {
      throw new AppError(
        `EMAIL_PROVIDER "${config.emailProvider}" is not implemented. Set it to "resend".`,
        500
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.emailFromAddress,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.headers && Object.keys(message.headers).length
            ? { headers: message.headers }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        log.error('email_send_failed', {
          to: message.to,
          status: res.status,
          detail: detail.slice(0, 300),
        });
        throw new AppError('The email could not be sent. Please try again.', 502);
      }

      const json = (await res.json().catch(() => ({}))) as { id?: string };
      log.info('email_sent', { to: message.to, subject: message.subject, id: json.id });
      return { id: json.id };
    } catch (err: any) {
      if (err instanceof AppError) throw err;

      const reason = err?.name === 'AbortError' ? 'timeout after 10s' : err?.message;
      log.error('email_send_error', { to: message.to, reason });
      throw new AppError('The email could not be sent. Please try again.', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

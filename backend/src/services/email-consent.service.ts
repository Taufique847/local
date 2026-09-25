import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { verifyUnsubscribeToken } from '../utils/unsubscribe-token';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'email-consent' });

export interface UnsubscribePreview {
  /** Partially masked, so the page can confirm the right address without exposing it. */
  email: string;
  businessName: string;
  /** True when they already unsubscribed. The page says so instead of implying it failed. */
  alreadyUnsubscribed: boolean;
}

/**
 * Marketing email consent, driven by the unsubscribe link in campaign mail.
 *
 * Every method here is reachable **unauthenticated** — the signed token is the only
 * authorization factor, exactly like the invoice and quote share tokens. So the token
 * is verified before anything is read, and both ids in it are used together in the
 * lookup: a valid token for business A must not resolve a customer belonging to
 * business B even if the customer id were swapped.
 */
export class EmailConsentService {
  /**
   * Masks an address for display.
   *
   * The page has to show enough for the recipient to recognise which address they are
   * unsubscribing, without printing a full address on a URL that could be shared or sit
   * in a browser history. `alex@example.com` becomes `a***@example.com`.
   */
  private static mask(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    /**
     * Fixed width, not `local.length - 1` stars.
     *
     * A variable mask reveals the exact length of the local part for no benefit —
     * recognition comes from the first character and the domain. `alex@example.com` and
     * `alexander@example.com` both render as `a***@example.com`.
     */
    return `${local[0]}***${domain}`;
  }

  private static async resolve(token: unknown) {
    const verified = verifyUnsubscribeToken(token);

    if (!verified.ok) {
      /**
       * One generic 404 for every failure mode.
       *
       * Distinguishing "bad signature" from "no such customer" would turn this into an
       * oracle for probing which customer ids exist, on an endpoint that is
       * unauthenticated by design.
       */
      log.warn('unsubscribe_token_rejected', { reason: verified.reason });
      throw new AppError('This unsubscribe link is not valid.', 404);
    }

    const customer = await Customer.findOne({
      _id: verified.payload.cid,
      businessId: verified.payload.bid,
    }).select('email emailOptedOut businessId');

    if (!customer) throw new AppError('This unsubscribe link is not valid.', 404);

    return { customer, businessId: verified.payload.bid };
  }

  /** Read-only. Describes what unsubscribing would do; changes nothing. */
  public static async preview(token: unknown): Promise<UnsubscribePreview> {
    const { customer, businessId } = await this.resolve(token);

    const business = await Business.findById(businessId).select('name').lean();

    return {
      email: customer.email ? this.mask(customer.email) : '***',
      businessName: business?.name || 'this business',
      alreadyUnsubscribed: Boolean(customer.emailOptedOut),
    };
  }

  /**
   * Performs the unsubscribe.
   *
   * Idempotent: a second click, a forwarded email, or a mail client firing the one-click
   * POST after the recipient already used the link must all succeed. Re-clicking does
   * not move `emailOptedOutAt`, so "when did they unsubscribe?" stays answerable.
   */
  public static async unsubscribe(token: unknown): Promise<UnsubscribePreview> {
    const { customer, businessId } = await this.resolve(token);

    const business = await Business.findById(businessId).select('name').lean();
    const alreadyUnsubscribed = Boolean(customer.emailOptedOut);

    if (!alreadyUnsubscribed) {
      customer.emailOptedOut = true;
      customer.emailOptedOutAt = new Date();
      await customer.save();

      log.info('email_unsubscribed', {
        businessId: String(businessId),
        customerId: String(customer._id),
      });
    }

    return {
      email: customer.email ? this.mask(customer.email) : '***',
      businessName: business?.name || 'this business',
      alreadyUnsubscribed,
    };
  }

  /**
   * Re-subscribes a customer. Staff-only, and deliberately not reachable by link.
   *
   * A customer asking to start receiving email again does so by talking to the
   * business. Putting a re-subscribe link in an email would mean the unsubscribe page
   * could undo itself, and a prefetching mail scanner hitting it would silently opt
   * somebody back in.
   */
  public static async resubscribe(
    businessId: string,
    customerId: string
  ): Promise<void> {
    const result = await Customer.updateOne(
      { _id: customerId, businessId },
      { $set: { emailOptedOut: false, emailOptedOutAt: null } }
    );

    if (!result.matchedCount) throw new AppError('Customer not found', 404);
  }
}

import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Unsubscribe links for marketing email.
 *
 * Why this exists: email campaigns shipped without any way for a recipient to opt
 * out. Transactional email — a booking confirmation, an invoice, a receipt — is
 * exempt from CAN-SPAM's opt-out requirement because the customer asked for the
 * underlying thing. **A campaign is not.** Sending marketing email with no working
 * unsubscribe is the clearest legal exposure in the product, and it is the one gap
 * that kept feature #13 marked partial.
 *
 * A signed token rather than a stored per-customer secret, for the same reason the
 * share tokens are: no extra collection, nothing to expire or garbage-collect, and
 * the link keeps working from an email someone opens six months later. Unlike the
 * media-stream token this is deliberately **not** single-use — a customer may click
 * it twice, or forward the email, and the second click must not error.
 *
 * The payload is signed, not encrypted. Anyone holding the link can read the
 * customer and business ids in it, which is acceptable: it was emailed to that
 * customer over TLS and reveals nothing they do not already know about their own
 * relationship with the business. It must not be repurposed to carry anything else.
 */

/**
 * Separate key derived from JWT_SECRET, so an unsubscribe token can never be
 * interchanged with an auth token or a media-stream token even though all three
 * are HMAC'd from the same root secret.
 */
const unsubscribeKey = (): Buffer =>
  crypto.createHmac('sha256', config.jwtSecret).update('email-unsubscribe-token-v1').digest();

export interface UnsubscribeTokenPayload {
  /** Customer being unsubscribed. */
  cid: string;
  /** Tenant, so a token cannot be used against another business's customer. */
  bid: string;
}

/**
 * Mints an unsubscribe token.
 *
 * No expiry on purpose. An unsubscribe link that stops working is worse than no
 * link: the recipient clicks it, gets an error, and their only remaining option is
 * a spam complaint. The token grants exactly one irreversible-in-their-favour
 * action, so a long life carries no real risk.
 */
export const createUnsubscribeToken = (customerId: string, businessId: string): string => {
  const payload: UnsubscribeTokenPayload = { cid: customerId, bid: businessId };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', unsubscribeKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
};

export type UnsubscribeTokenResult =
  | { ok: true; payload: UnsubscribeTokenPayload }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' };

export const verifyUnsubscribeToken = (token: unknown): UnsubscribeTokenResult => {
  if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'missing' };
  // Bound the work an unauthenticated caller can make us do.
  if (token.length > 1024) return { ok: false, reason: 'malformed' };

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = crypto.createHmac('sha256', unsubscribeKey()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  // Length checked first: timingSafeEqual throws on a length mismatch.
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: UnsubscribeTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!payload || typeof payload.cid !== 'string' || typeof payload.bid !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  return { ok: true, payload };
};

/** The public URL a recipient clicks. */
export const unsubscribeUrl = (customerId: string, businessId: string): string =>
  `${config.frontendUrl}/unsubscribe/${createUnsubscribeToken(customerId, businessId)}`;

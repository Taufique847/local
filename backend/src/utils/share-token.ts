import crypto from 'crypto';

/**
 * Generates a cryptographically strong, URL-safe share token for public
 * customer-portal links (quotes / invoices).
 *
 * Security note: these tokens are the ONLY authorization factor protecting
 * public portal documents, so they must be unguessable. 32 random bytes gives
 * 256 bits of entropy, which is not brute-forceable.
 *
 * The prefix is purely for human/debug readability (e.g. `inv_`, `est_`).
 */
export const generateShareToken = (prefix: 'inv' | 'est'): string => {
  const random = crypto.randomBytes(32).toString('base64url');
  return `${prefix}_${random}`;
};

/**
 * Share tokens are opaque secrets, never Mongo ObjectIds. A lookup value that
 * looks like an ObjectId is therefore always invalid and must be rejected
 * rather than silently treated as an `_id` lookup (which would defeat the
 * token entirely and expose every document to enumeration).
 */
export const isValidShareTokenFormat = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 16 || trimmed.length > 200) return false;
  return /^(inv|est)_[A-Za-z0-9_-]+$/.test(trimmed);
};

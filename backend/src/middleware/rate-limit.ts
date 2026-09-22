import rateLimit, { Options } from 'express-rate-limit';
import { config } from '../config/env';

/**
 * Rate limiting. Previously absent entirely, which left login/signup open to
 * unlimited credential stuffing and left the public portal open to unlimited
 * share-token guessing.
 *
 * Limits are disabled under NODE_ENV=test so the suite is not throttled.
 */
const base = (options: Partial<Options> & Pick<Options, 'windowMs' | 'limit'>) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    message: {
      success: false,
      message: 'Too many requests. Please slow down and try again shortly.',
    },
    ...options,
  });

/** Broad ceiling applied to the whole API as a backstop against floods. */
export const globalLimiter = base({
  windowMs: 60 * 1000,
  limit: 300,
});

/**
 * Credential endpoints. Deliberately tight and keyed on IP + submitted email so
 * one attacker cannot lock out a shared-NAT office, while still blocking
 * password spraying against a single account.
 */
export const authLimiter = base({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${req.ip}|${email}`;
  },
  message: {
    success: false,
    message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
  },
});

/** Unauthenticated customer portal — the only anonymous DB-touching surface. */
export const portalLimiter = base({
  windowMs: 10 * 60 * 1000,
  limit: 60,
});

/** Anonymous marketing-site lead capture. */
export const publicFormLimiter = base({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: {
    success: false,
    message: 'You have submitted several requests already. Our team will be in touch shortly.',
  },
});

/**
 * Provider webhooks (Twilio, Stripe). Generous, because legitimate bursts are
 * normal, but still bounded.
 */
export const webhookLimiter = base({
  windowMs: 60 * 1000,
  limit: 600,
});

/**
 * Owner-initiated test calls. Every accepted request dials a real PSTN number
 * and burns speech, language-model and telephony spend, so the HTTP surface is
 * throttled in addition to the per-business hourly cap enforced in the service.
 */
export const testCallLimiter = base({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: {
    success: false,
    message: 'Too many test calls from this address. Please wait before trying again.',
  },
});

/**
 * Token refresh. Every signed-in client calls this on a normal cadence, so the
 * ceiling is generous — but it is still bounded, because presenting a revoked
 * refresh token is treated as a theft signal and should not be free to probe.
 */
export const refreshLimiter = base({
  windowMs: 15 * 60 * 1000,
  limit: 60,
});

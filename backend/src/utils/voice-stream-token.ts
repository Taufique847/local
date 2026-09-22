import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Authorization for the Twilio Media Streams WebSocket.
 *
 * Why this exists: `/api/voice/media-stream` used to accept any WebSocket that
 * reached it. Twilio does not sign WebSocket upgrades — there is no
 * `X-Twilio-Signature` to check the way the HTTP webhooks do — so once the
 * server was exposed publicly (which it must be for Twilio to reach it at all),
 * anyone could open a stream, send a `start` frame with whatever `from`/`to`
 * they liked, and make the server:
 *   - open a Deepgram socket and run OpenAI/Azure turns on our credentials, and
 *   - write a CallLog and a transcript into whichever tenant owned that `to`.
 *
 * The fix is a short-lived token minted at the moment the TwiML is generated —
 * a point already authenticated by the Twilio request signature — and handed to
 * Twilio inside the `<Stream>` URL. The call's identity travels *inside* the
 * signed payload, so `from`/`to` are no longer attacker-supplied values the
 * handler has to trust.
 *
 * The payload is signed, not encrypted: anyone holding the token can read the
 * two phone numbers in it. That is acceptable because the token only ever
 * travels over TLS to Twilio, which is the telephony carrier for this call and
 * therefore already knows both numbers. It must NOT be repurposed to carry
 * anything Twilio should not see.
 */

/**
 * Separate key derived from JWT_SECRET so a stream token can never be
 * interchanged with an auth token, even though both are HMAC'd with the same
 * root secret.
 */
const streamKey = (): Buffer =>
  crypto.createHmac('sha256', config.jwtSecret).update('voice-stream-token-v1').digest();

export interface VoiceStreamTokenPayload {
  /** Twilio Call SID this token is valid for. Binds the token to one call. */
  callSid: string;
  /** Caller's number, from the server's point of view. */
  from: string;
  /** Dialled number; this is what resolves the tenant. */
  to: string;
  /** True when Twilio already spoke the AI/recording notice. */
  disclosed: boolean;
  /** Unique id, used to enforce single use. */
  jti: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

const b64u = (buf: Buffer | string): string =>
  Buffer.from(buf as any).toString('base64url');

/** Mints a single-use token for one call's media stream. */
export const createVoiceStreamToken = (params: {
  callSid: string;
  from: string;
  to: string;
  disclosed: boolean;
}): string => {
  const payload: VoiceStreamTokenPayload = {
    callSid: params.callSid,
    from: params.from,
    to: params.to,
    disclosed: params.disclosed,
    jti: crypto.randomBytes(12).toString('base64url'),
    exp: Math.floor(Date.now() / 1000) + config.voiceStreamTokenTtlSeconds,
  };

  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', streamKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
};

export type VoiceStreamTokenFailure =
  | 'missing'
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'replayed';

export type VoiceStreamTokenResult =
  | { ok: true; payload: VoiceStreamTokenPayload }
  | { ok: false; reason: VoiceStreamTokenFailure };

/**
 * Consumed token ids, so a captured `<Stream>` URL cannot be replayed within
 * the TTL window to open a second billable session.
 *
 * In-memory on purpose: the voice path is already single-instance (live session
 * state, the Deepgram socket and the playback position all live in this
 * process's maps), so a shared store would not make the pipeline
 * multi-instance-safe on its own. Running more than one backend replica needs
 * that whole path addressed together, at which point this moves to Mongo
 * alongside it.
 */
const consumed = new Map<string, number>();

const sweepConsumed = (nowSec: number): void => {
  for (const [jti, exp] of consumed) {
    if (exp <= nowSec) consumed.delete(jti);
  }
};

/**
 * Verifies a token. `consume` marks it used; pass false for a pre-flight check
 * (the HTTP upgrade) so the real check at the `start` frame still succeeds.
 */
export const verifyVoiceStreamToken = (
  token: unknown,
  options: { consume: boolean }
): VoiceStreamTokenResult => {
  if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'missing' };
  // Bound the work an unauthenticated peer can make us do.
  if (token.length > 2048) return { ok: false, reason: 'malformed' };

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = crypto.createHmac('sha256', streamKey()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: VoiceStreamTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    !payload ||
    typeof payload.callSid !== 'string' ||
    typeof payload.from !== 'string' ||
    typeof payload.to !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) return { ok: false, reason: 'expired' };

  sweepConsumed(nowSec);
  if (consumed.has(payload.jti)) return { ok: false, reason: 'replayed' };
  if (options.consume) consumed.set(payload.jti, payload.exp);

  return { ok: true, payload: { ...payload, disclosed: payload.disclosed === true } };
};

/** Test/diagnostic helper. Not used by request handling. */
export const _resetConsumedVoiceStreamTokens = (): void => consumed.clear();

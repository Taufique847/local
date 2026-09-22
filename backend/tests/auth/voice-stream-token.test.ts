import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  _resetConsumedVoiceStreamTokens,
  createVoiceStreamToken,
  verifyVoiceStreamToken,
} from '../../src/utils/voice-stream-token';
import { TwilioService } from '../../src/services/twilio.service';
import { config } from '../../src/config/env';

/**
 * Media-stream authorization.
 *
 * Twilio does not sign WebSocket upgrades, so there is no `X-Twilio-Signature` to
 * check the way the HTTP webhooks do. The endpoint used to accept any socket that
 * reached it, which — once the server is publicly exposed, as it must be for
 * Twilio to reach it at all — let anyone open a stream, spend Deepgram and LLM
 * credit on our keys, and write a fabricated call into whichever tenant owned the
 * `to` number they named.
 *
 * These are unit tests rather than HTTP tests because the surface is a WebSocket
 * upgrade rather than a route.
 */

const CALL = {
  callSid: 'CAtest0000000000000000000000000001',
  from: '+15557778888',
  to: '+15551110000',
  disclosed: true,
};

beforeEach(() => {
  _resetConsumedVoiceStreamTokens();
});

describe('voice stream token', () => {
  it('round-trips the call identity', async () => {
    const token = createVoiceStreamToken(CALL);
    const result = verifyVoiceStreamToken(token, { consume: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.callSid).toBe(CALL.callSid);
    expect(result.payload.from).toBe(CALL.from);
    expect(result.payload.to).toBe(CALL.to);
    expect(result.payload.disclosed).toBe(true);
  });

  it('rejects a missing or empty token', () => {
    expect(verifyVoiceStreamToken(undefined, { consume: false })).toMatchObject({
      ok: false,
      reason: 'missing',
    });
    expect(verifyVoiceStreamToken('', { consume: false })).toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects a malformed token', () => {
    expect(verifyVoiceStreamToken('no-dot-here', { consume: false })).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });

  it('bounds the work an unauthenticated peer can cause', () => {
    const huge = `${'a'.repeat(4000)}.${'b'.repeat(64)}`;
    expect(verifyVoiceStreamToken(huge, { consume: false })).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a tampered signature', () => {
    const token = createVoiceStreamToken(CALL);
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');

    expect(verifyVoiceStreamToken(flipped, { consume: false })).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a payload re-signed with the wrong key', () => {
    // The attacker knows the format; what they lack is the secret.
    const token = createVoiceStreamToken(CALL);
    const body = token.split('.')[0];
    const forged = `${body}.${crypto
      .createHmac('sha256', 'not-the-real-key')
      .update(body)
      .digest('base64url')}`;

    expect(verifyVoiceStreamToken(forged, { consume: false })).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a payload swapped for one naming a different tenant', () => {
    // Re-encoding the claims does not produce a matching signature, which is the
    // property that stops a peer choosing which business its audio is billed to.
    const token = createVoiceStreamToken(CALL);
    const [, signature] = token.split('.');

    const swapped = Buffer.from(
      JSON.stringify({ ...CALL, to: '+19998887777', jti: 'x', exp: Math.floor(Date.now() / 1000) + 60 })
    ).toString('base64url');

    expect(verifyVoiceStreamToken(`${swapped}.${signature}`, { consume: false })).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects an expired token even when correctly signed', () => {
    const streamKey = crypto
      .createHmac('sha256', config.jwtSecret)
      .update('voice-stream-token-v1')
      .digest();

    const body = Buffer.from(
      JSON.stringify({
        ...CALL,
        jti: 'expired-one',
        exp: Math.floor(Date.now() / 1000) - 10,
      })
    ).toString('base64url');
    const signature = crypto.createHmac('sha256', streamKey).update(body).digest('base64url');

    expect(verifyVoiceStreamToken(`${body}.${signature}`, { consume: false })).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('is single use once consumed', () => {
    const token = createVoiceStreamToken(CALL);

    expect(verifyVoiceStreamToken(token, { consume: true }).ok).toBe(true);
    // Replaying a captured <Stream> URL inside the TTL window is refused.
    expect(verifyVoiceStreamToken(token, { consume: false })).toMatchObject({
      ok: false,
      reason: 'replayed',
    });
  });

  it('does not consume on a pre-flight check', () => {
    // The HTTP upgrade checks without consuming, so a connection that dies during
    // the handshake cannot burn a real caller's only token.
    const token = createVoiceStreamToken(CALL);

    expect(verifyVoiceStreamToken(token, { consume: false }).ok).toBe(true);
    expect(verifyVoiceStreamToken(token, { consume: false }).ok).toBe(true);
    expect(verifyVoiceStreamToken(token, { consume: true }).ok).toBe(true);
  });

  it('binds each token to one call', () => {
    const a = createVoiceStreamToken(CALL);
    const b = createVoiceStreamToken({ ...CALL, callSid: 'CAtest0000000000000000000000000002' });

    const first = verifyVoiceStreamToken(a, { consume: false });
    const second = verifyVoiceStreamToken(b, { consume: false });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // The stream handler refuses a start frame whose callSid differs from this.
    expect(first.payload.callSid).not.toBe(second.payload.callSid);
  });
});

describe('media stream TwiML', () => {
  it('carries a token and no longer exposes the call parameters', () => {
    const twiml = TwilioService.generateMediaStreamTwiML(
      'wss://test.example.com/api/voice/media-stream',
      { from: CALL.from, to: CALL.to, callSid: CALL.callSid },
      { disclosure: 'This call is handled by an AI assistant and may be recorded.' }
    );

    expect(twiml).toMatch(/[?&]token=/);
    // `from` and `to` used to travel as <Parameter> elements that the stream
    // handler trusted to resolve the tenant.
    expect(twiml).not.toMatch(/<Parameter/i);
    expect(twiml).not.toContain(CALL.from);
    expect(twiml).not.toContain(CALL.to);
  });

  it('mints a token the verifier accepts, carrying the real identity', () => {
    const twiml = TwilioService.generateMediaStreamTwiML(
      'wss://test.example.com/api/voice/media-stream',
      { from: CALL.from, to: CALL.to, callSid: CALL.callSid },
      { disclosure: null }
    );

    const token = decodeURIComponent(twiml.match(/[?&]token=([^"&]+)/)![1]);
    const result = verifyVoiceStreamToken(token, { consume: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.to).toBe(CALL.to);
    expect(result.payload.callSid).toBe(CALL.callSid);
    // No disclosure was spoken, so the assistant must greet in full.
    expect(result.payload.disclosed).toBe(false);
  });
});

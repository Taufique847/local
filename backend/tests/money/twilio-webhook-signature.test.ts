import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { asAnon } from '../helpers/agent';
import { CallLog } from '../../src/models/call-log.model';

/**
 * Twilio webhook authentication.
 *
 * These endpoints are public and they drive real telephony: the voice webhook
 * decides what the caller hears and opens a billable AI stream, and the status
 * webhook writes call records. Signature verification used to be skipped
 * whenever `NODE_ENV === 'development'` — which is the DEFAULT value — so it was
 * effectively off unless someone had explicitly set NODE_ENV.
 *
 * It is now gated on `ALLOW_INSECURE_WEBHOOKS`, which the test env pins to false
 * precisely so these assertions are meaningful.
 */

const VOICE_PATH = '/api/webhooks/twilio/voice';
const STATUS_PATH = '/api/webhooks/twilio/status';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN as string;
const BASE_URL = process.env.TWILIO_WEBHOOK_BASE_URL as string;

/**
 * Reproduces Twilio's signature: HMAC-SHA1 over the full URL followed by each
 * POST parameter sorted by key, appended as key then value with no separators.
 */
const twilioSignature = (url: string, params: Record<string, string>, token = AUTH_TOKEN) => {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
};

const postForm = (path: string, params: Record<string, string>, signature?: string) => {
  const req = asAnon().post(path).type('form');
  if (signature !== undefined) req.set('X-Twilio-Signature', signature);
  return req.send(params);
};

const inboundParams = {
  CallSid: 'CAtest0000000000000000000000000001',
  From: '+15557778888',
  To: '+15551110000',
  CallStatus: 'ringing',
};

describe('Twilio voice webhook — signature verification', () => {
  it('rejects a request with no signature', async () => {
    const res = await postForm(VOICE_PATH, inboundParams);
    expect(res.status).toBe(403);
  });

  it('rejects a forged signature', async () => {
    const res = await postForm(VOICE_PATH, inboundParams, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(res.status).toBe(403);
  });

  it('rejects a signature computed with the wrong auth token', async () => {
    const signature = twilioSignature(
      `${BASE_URL}${VOICE_PATH}`,
      inboundParams,
      'someone_elses_auth_token'
    );
    const res = await postForm(VOICE_PATH, inboundParams, signature);
    expect(res.status).toBe(403);
  });

  it('rejects a valid signature whose parameters were then changed', async () => {
    // Signed for one caller, submitted with another.
    const signature = twilioSignature(`${BASE_URL}${VOICE_PATH}`, inboundParams);
    const res = await postForm(
      VOICE_PATH,
      { ...inboundParams, From: '+19995550000' },
      signature
    );
    expect(res.status).toBe(403);
  });

  it('writes no call record for an unsigned request', async () => {
    await postForm(VOICE_PATH, inboundParams);
    expect(await CallLog.countDocuments({})).toBe(0);
  });

  it('accepts a correctly signed request', async () => {
    // Proves the rejections above are the signature check doing its job rather
    // than the endpoint failing for everyone.
    const signature = twilioSignature(`${BASE_URL}${VOICE_PATH}`, inboundParams);
    const res = await postForm(VOICE_PATH, inboundParams, signature);

    expect(res.status).toBe(200);
    // Twilio requires TwiML, and the handler answers with it even on an internal
    // error so the caller never hears a dead line.
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toMatch(/<Response>/);
  });
});

describe('Twilio status webhook — signature verification', () => {
  const statusParams = {
    CallSid: 'CAtest0000000000000000000000000002',
    CallStatus: 'completed',
    CallDuration: '120',
  };

  it('rejects an unsigned status callback', async () => {
    const res = await postForm(STATUS_PATH, statusParams);
    expect(res.status).toBe(403);
  });

  it('rejects a forged status callback', async () => {
    const res = await postForm(STATUS_PATH, statusParams, 'bogus');
    expect(res.status).toBe(403);
  });

  it('accepts a correctly signed status callback', async () => {
    const signature = twilioSignature(`${BASE_URL}${STATUS_PATH}`, statusParams);
    const res = await postForm(STATUS_PATH, statusParams, signature);
    expect(res.status).toBe(200);
  });
});

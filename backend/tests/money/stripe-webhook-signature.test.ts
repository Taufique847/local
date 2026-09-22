import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { asAnon } from '../helpers/agent';
import { Subscription } from '../../src/models/subscription.model';
import { createWorkspace } from '../helpers/factories';

/**
 * Stripe webhook authentication.
 *
 * This endpoint is public and it is what tells the server a payment succeeded.
 * Before signature verification existed, anyone who knew the URL could POST a
 * `checkout.session.completed` body and hand themselves an Enterprise
 * subscription for free — or mark a customer's invoice paid without paying.
 *
 * The signature is computed over the EXACT bytes Stripe sent, which is why
 * `STRIPE_WEBHOOK_PATH` is parsed as a raw Buffer in app.ts. A test that posted
 * a JS object would re-serialise it and could pass against a broken
 * implementation, so every request here sends a pre-serialised string.
 */

const WEBHOOK_PATH = '/api/billing/webhook';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

/** Builds the `Stripe-Signature` header the way Stripe's own library does. */
const signPayload = (payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) => {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
};

const eventBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout_session',
        mode: 'subscription',
        subscription: 'sub_test_1',
        customer: 'cus_test_1',
        metadata: {},
      },
    },
    ...overrides,
  });

const post = (payload: string, signature?: string) => {
  const req = asAnon()
    .post(WEBHOOK_PATH)
    .set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('Stripe-Signature', signature);
  // `.send(string)` keeps the exact bytes; `.send(object)` would not.
  return req.send(payload);
};

describe('Stripe webhook — signature verification', () => {
  it('rejects a body with no signature header at all', async () => {
    const res = await post(eventBody());

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a syntactically wrong signature header', async () => {
    const res = await post(eventBody(), 'not-a-signature');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const payload = eventBody();
    const res = await post(payload, signPayload(payload, 'whsec_the_wrong_secret'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a correctly signed payload whose body was then altered', async () => {
    const original = eventBody();
    const signature = signPayload(original);

    // The classic attack: take a real webhook and change the plan.
    const tampered = original.replace('"metadata":{}', '"metadata":{"tier":"enterprise"}');
    expect(tampered).not.toBe(original);

    const res = await post(tampered, signature);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a replay whose timestamp is outside Stripe’s tolerance', async () => {
    const payload = eventBody();
    const oneDayAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24;

    const res = await post(payload, signPayload(payload, SECRET, oneDayAgo));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('grants nothing to a forged webhook', async () => {
    const workspace = await createWorkspace();

    // A forged event naming a real tenant and the most expensive tier.
    const payload = JSON.stringify({
      id: 'evt_forged',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_forged',
          object: 'checkout_session',
          mode: 'subscription',
          subscription: 'sub_forged',
          customer: 'cus_forged',
          metadata: { businessId: workspace.businessId, tier: 'enterprise' },
        },
      },
    });

    const res = await post(payload, signPayload(payload, 'whsec_attacker_guess'));
    expect(res.status).toBeGreaterThanOrEqual(400);

    // The assertion that actually matters: no entitlement was written.
    const subs = await Subscription.find({ businessId: workspace.businessId });
    const upgraded = subs.filter((s: any) => s.tier === 'enterprise' && s.status === 'active');
    expect(upgraded).toHaveLength(0);
  });

  it('accepts a genuinely signed payload (proving rejections are not blanket failures)', async () => {
    // Without this, every test above would also pass against a handler that
    // rejected 100% of requests — including Stripe's own.
    const payload = eventBody({ type: 'customer.subscription.deleted' });
    const res = await post(payload, signPayload(payload));

    // Signature verification passed, so this is no longer a 4xx signature error.
    // The handler's own outcome for an unknown subscription is not what is under
    // test here; what matters is that it got past the gate.
    expect(res.status).toBeLessThan(400);
  });
});

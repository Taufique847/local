import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkspace, createStaff, type Workspace } from '../helpers/factories';
import { asUser, asAnon } from '../helpers/agent';
import { Customer } from '../../src/models/customer.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { CommunicationService } from '../../src/services/communication.service';
import { EmailService } from '../../src/services/email.service';
import { NotificationService } from '../../src/services/notification.service';
import { CustomerSegmentService } from '../../src/services/customer-segment.service';
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../../src/utils/unsubscribe-token';

/**
 * Marketing email consent.
 *
 * The gap that kept feature #13 marked partial: email campaigns could be sent and the
 * recipient had no way to opt out, with nothing recording that they had asked.
 *
 * The distinction under test throughout is that `emailOptedOut` (CAN-SPAM, set by
 * clicking unsubscribe) and `isOptedOut` (TCPA, set by texting STOP) are **two different
 * consents** and neither may stand in for the other. Conflating them breaks the product
 * in both directions: a customer who stopped texts would lose their own invoice, and a
 * customer who unsubscribed from promotions would keep receiving them.
 */

let phoneCounter = 0;

const setupWorkspace = async (): Promise<Workspace> => {
  const ws = await createWorkspace();
  await BusinessPhoneNumber.create({
    businessId: ws.businessId,
    phoneNumber: '+15557770000',
    status: 'active',
    isPrimary: true,
  });
  return ws;
};

const makeCustomer = async (businessId: string, overrides: Record<string, unknown> = {}) => {
  phoneCounter++;
  return Customer.create({
    businessId,
    firstName: 'Cust',
    lastName: `Number${phoneCounter}`,
    phone: `+1555000${String(1000 + phoneCounter)}`,
    email: `cust${phoneCounter}@example.com`,
    ...overrides,
  });
};

const stubTransports = () => {
  const smsCreate = vi.fn().mockResolvedValue({ sid: 'SM_stub' });
  vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
    messages: { create: smsCreate },
  });
  const email = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_1' });
  vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  return { smsCreate, email };
};

describe('the unsubscribe token', () => {
  it('round-trips the customer and business ids', () => {
    const token = createUnsubscribeToken('cust123', 'biz456');
    const result = verifyUnsubscribeToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.cid).toBe('cust123');
      expect(result.payload.bid).toBe('biz456');
    }
  });

  /**
   * The payload is base64url, so anyone can rewrite it. Only the signature stops them
   * from unsubscribing an arbitrary customer.
   */
  it('rejects a tampered payload', () => {
    const token = createUnsubscribeToken('cust123', 'biz456');
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ cid: 'other', bid: 'biz456' })).toString(
      'base64url'
    );

    expect(verifyUnsubscribeToken(`${forged}.${sig}`)).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each([
    ['', 'missing'],
    ['nodot', 'malformed'],
    ['.sig', 'malformed'],
    ['body.', 'malformed'],
  ])('rejects %j as %s', (token, reason) => {
    expect(verifyUnsubscribeToken(token)).toMatchObject({ ok: false, reason });
  });

  it('bounds the work an unauthenticated caller can cause', () => {
    expect(verifyUnsubscribeToken(`${'x'.repeat(2000)}.sig`)).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });

  /** Two tokens signed with different derived keys must not be interchangeable. */
  it('is not interchangeable with a media-stream token', async () => {
    const { createVoiceStreamToken } = await import('../../src/utils/voice-stream-token');
    const streamToken = createVoiceStreamToken({
      callSid: 'CA1',
      from: '+15551110000',
      to: '+15557770000',
      disclosed: true,
    });

    expect(verifyUnsubscribeToken(streamToken).ok).toBe(false);
  });

  /**
   * Pins the **derived** key, not just any key.
   *
   * Signing with the root `JWT_SECRET` directly would still round-trip perfectly — the
   * token would mint and verify, and every other test here would pass. What it loses is
   * domain separation: a second token type signed the same way with a similar payload
   * would become interchangeable with this one. The test above cannot catch that,
   * because the media-stream token differs in payload shape as well as key.
   *
   * So this forges a token with the raw secret and asserts it is rejected.
   */
  it('rejects a token signed with the root secret instead of the derived key', async () => {
    const crypto = await import('node:crypto');
    const { config } = await import('../../src/config/env');

    const body = Buffer.from(JSON.stringify({ cid: 'c1', bid: 'b1' })).toString('base64url');
    const sig = crypto
      .createHmac('sha256', config.jwtSecret)
      .update(body)
      .digest('base64url');

    expect(verifyUnsubscribeToken(`${body}.${sig}`)).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
  });
});

describe('the public unsubscribe endpoint', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  /**
   * The property that matters most here. Mail clients and security scanners prefetch
   * links in email, so a GET that unsubscribed would opt people out who never clicked.
   */
  it('GET describes without changing anything', async () => {
    const customer = await makeCustomer(ws.businessId);
    const token = createUnsubscribeToken(customer._id.toString(), ws.businessId);

    const res = await asAnon().get(`/api/portal/unsubscribe/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe('Test Heating & Air');
    expect(res.body.alreadyUnsubscribed).toBe(false);

    // Unchanged.
    expect((await Customer.findById(customer._id).lean())!.emailOptedOut).toBe(false);
  });

  it('masks the address rather than printing it in full', async () => {
    const customer = await makeCustomer(ws.businessId, { email: 'alexander@example.com' });
    const token = createUnsubscribeToken(customer._id.toString(), ws.businessId);

    const res = await asAnon().get(`/api/portal/unsubscribe/${token}`);

    // Enough to recognise, not enough to harvest from a shared URL or browser history.
    expect(res.body.email).toBe('a***@example.com');
    expect(res.body.email).not.toContain('alexander');
  });

  /**
   * The mask is fixed width, so it does not reveal how long the local part is. Two
   * addresses of very different length must render identically.
   */
  it('does not leak the length of the address', async () => {
    const short = await makeCustomer(ws.businessId, { email: 'al@example.com' });
    const long = await makeCustomer(ws.businessId, { email: 'alexanderhamilton@example.com' });

    const shortRes = await asAnon().get(
      `/api/portal/unsubscribe/${createUnsubscribeToken(short._id.toString(), ws.businessId)}`
    );
    const longRes = await asAnon().get(
      `/api/portal/unsubscribe/${createUnsubscribeToken(long._id.toString(), ws.businessId)}`
    );

    expect(shortRes.body.email).toBe('a***@example.com');
    expect(longRes.body.email).toBe(shortRes.body.email);
  });

  it('POST performs it', async () => {
    const customer = await makeCustomer(ws.businessId);
    const token = createUnsubscribeToken(customer._id.toString(), ws.businessId);

    const res = await asAnon().post(`/api/portal/unsubscribe/${token}`);

    expect(res.status).toBe(200);

    const stored = await Customer.findById(customer._id).lean();
    expect(stored!.emailOptedOut).toBe(true);
    expect(stored!.emailOptedOutAt).toBeInstanceOf(Date);
  });

  /**
   * A forwarded email, a second click, and the mail client's one-click POST firing after
   * the human already used the link must all succeed — and the timestamp must not move,
   * or "when did they unsubscribe?" stops being answerable.
   */
  it('is idempotent and keeps the first timestamp', async () => {
    const customer = await makeCustomer(ws.businessId);
    const token = createUnsubscribeToken(customer._id.toString(), ws.businessId);

    await asAnon().post(`/api/portal/unsubscribe/${token}`);
    const first = (await Customer.findById(customer._id).lean())!.emailOptedOutAt!;

    await new Promise((r) => setTimeout(r, 15));
    const second = await asAnon().post(`/api/portal/unsubscribe/${token}`);

    expect(second.status).toBe(200);
    expect(second.body.alreadyUnsubscribed).toBe(true);

    const after = (await Customer.findById(customer._id).lean())!.emailOptedOutAt!;
    expect(after.getTime()).toBe(first.getTime());
  });

  it('requires no authentication', async () => {
    const customer = await makeCustomer(ws.businessId);
    const token = createUnsubscribeToken(customer._id.toString(), ws.businessId);

    // No cookie at all. The signed token is the only authorization factor.
    expect((await asAnon().post(`/api/portal/unsubscribe/${token}`)).status).toBe(200);
  });

  /**
   * One generic 404 for every failure. Distinguishing "bad signature" from "no such
   * customer" would make this an oracle for probing which ids exist, on an endpoint that
   * is unauthenticated by design.
   */
  it('gives the same answer for a forged token and an unknown customer', async () => {
    const forged = await asAnon().post('/api/portal/unsubscribe/abc.def');
    const unknown = await asAnon().post(
      `/api/portal/unsubscribe/${createUnsubscribeToken('64b7f9c2a1d4e5f601234567', ws.businessId)}`
    );

    expect(forged.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(forged.body.message ?? forged.body.error).toBe(
      unknown.body.message ?? unknown.body.error
    );
  });

  /**
   * The token carries both ids and both are used in the lookup, so a valid token for one
   * business cannot be repointed at another business's customer.
   */
  it('will not unsubscribe a customer belonging to another business', async () => {
    const other = await setupWorkspace();
    const theirCustomer = await makeCustomer(other.businessId);

    // Their customer id, our business id.
    const token = createUnsubscribeToken(theirCustomer._id.toString(), ws.businessId);

    expect((await asAnon().post(`/api/portal/unsubscribe/${token}`)).status).toBe(404);
    expect((await Customer.findById(theirCustomer._id).lean())!.emailOptedOut).toBe(false);
  });
});

describe('what unsubscribing actually suppresses', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  /**
   * The whole point of the distinction. CAN-SPAM's opt-out requirement does not cover
   * transactional mail, and withholding somebody's invoice because they unsubscribed
   * from promotions would be the wrong reading of a narrower request.
   */
  it('does not suppress transactional email', async () => {
    const { email } = stubTransports();
    const customer = await makeCustomer(ws.businessId, {
      emailOptedOut: true,
      emailOptedOutAt: new Date(),
    });

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1', amount: '$100.00', link: 'https://portal.test/x' },
      { channels: 'email' }
    );

    expect(result.sentAny).toBe(true);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('does not put an unsubscribe link on transactional email', async () => {
    const { email } = stubTransports();
    const customer = await makeCustomer(ws.businessId);

    await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1', amount: '$100.00', link: 'https://portal.test/x' },
      { channels: 'email' }
    );

    const message = email.mock.calls[0][0];
    // Offering to unsubscribe somebody from their own invoice would be offering
    // something we would not honour.
    expect(message.text).not.toMatch(/unsubscribe/i);
    expect(message.headers).toBeUndefined();
  });

  it('suppresses a campaign email', async () => {
    const { email } = stubTransports();
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['VIP'], emailOptedOut: true });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'email',
      subject: 'Spring offer',
      body: 'Book before the end of the month.',
    });

    // Excluded from the audience up front, so the operator sees the real number rather
    // than discovering the shortfall from a skipped count.
    expect(result.audience).toBe(1);
    expect(result.sent).toBe(1);
    expect(email).toHaveBeenCalledTimes(1);
  });

  /**
   * The audience is counted before the send, so somebody unsubscribing in between would
   * otherwise slip through. This is the second guard, in the send path itself.
   */
  it('refuses a marketing send to an unsubscribed customer even when asked directly', async () => {
    const { email } = stubTransports();
    const customer = await makeCustomer(ws.businessId, { emailOptedOut: true });

    const result = await NotificationService.send(
      ws.businessId,
      'custom',
      { customerId: customer._id.toString() },
      {},
      { channels: 'email', bodyOverride: 'Promo', subjectOverride: 'Promo', marketing: true }
    );

    expect(result.sentAny).toBe(false);
    expect(result.results[0]).toMatchObject({
      channel: 'email',
      status: 'skipped',
      reason: 'email_unsubscribed',
    });
    expect(email).not.toHaveBeenCalled();
  });

  it('puts the link and the List-Unsubscribe headers on a campaign email', async () => {
    const { email } = stubTransports();
    const customer = await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'email',
      subject: 'Spring offer',
      body: 'Book before the end of the month.',
    });

    const message = email.mock.calls[0][0];

    expect(message.text).toMatch(/unsubscribe/i);
    expect(message.text).toContain('/unsubscribe/');

    /**
     * The headers are not decoration: Gmail and Outlook render a native unsubscribe
     * button from them, and a recipient who cannot find the link marks the message as
     * spam instead — which costs the sending domain more than the lost contact.
     */
    expect(message.headers!['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/unsubscribe\/.+>$/);
    expect(message.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    // And the link in it actually works.
    const url = message.headers!['List-Unsubscribe'].slice(1, -1);
    const token = url.split('/unsubscribe/')[1];
    expect((await asAnon().post(`/api/portal/unsubscribe/${token}`)).status).toBe(200);
    expect((await Customer.findById(customer._id).lean())!.emailOptedOut).toBe(true);
  });

  it('logs the body as sent, including the unsubscribe line', async () => {
    stubTransports();
    await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'email',
      subject: 'Spring offer',
      body: 'Book before the end of the month.',
    });

    const row = await CommunicationLog.findOne({ businessId: ws.businessId, channel: 'email' });
    // The log has to match what the customer received, not what was rendered before the
    // footer was appended.
    expect(row!.body).toMatch(/unsubscribe/i);
  });

  /**
   * Two different consents under two different laws. Neither may stand in for the other.
   */
  it('is independent of the SMS opt-out in both directions', async () => {
    const { smsCreate, email } = stubTransports();

    const emailOnly = await makeCustomer(ws.businessId, { tags: ['X'], emailOptedOut: true });
    const smsOnly = await makeCustomer(ws.businessId, { tags: ['X'], isOptedOut: true });

    // A customer who unsubscribed from email can still be texted.
    const smsResult = await CustomerSegmentService.sendCampaign(
      ws.businessId,
      (await CustomerSegmentService.create(ws.businessId, { name: 'Xs', filter: { tags: ['X'] } }))
        .id,
      { channel: 'sms', body: 'Offer. Reply STOP to unsubscribe.' }
    );

    expect(smsResult.audience).toBe(1);
    expect(smsCreate).toHaveBeenCalledTimes(1);
    // The one texted is the email-unsubscriber, not the STOP-er.
    expect(smsCreate.mock.calls[0][0].to).toBe(emailOnly.phone);

    // And a customer who texted STOP can still be emailed.
    const emailResult = await CustomerSegmentService.sendCampaign(
      ws.businessId,
      (
        await CustomerSegmentService.create(ws.businessId, {
          name: 'Xs email',
          filter: { tags: ['X'] },
        })
      ).id,
      { channel: 'email', subject: 'Offer', body: 'Offer inside.' }
    );

    expect(emailResult.audience).toBe(1);
    expect(email.mock.calls[0][0].to).toBe(smsOnly.email);
  });
});

describe('staff re-subscribe', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  it('clears the flag', async () => {
    const customer = await makeCustomer(ws.businessId, {
      emailOptedOut: true,
      emailOptedOutAt: new Date(),
    });

    const res = await asUser(ws.ownerToken).post(
      `/api/customers/${customer._id}/resubscribe-email`
    );

    expect(res.status).toBe(200);
    const stored = await Customer.findById(customer._id).lean();
    expect(stored!.emailOptedOut).toBe(false);
    expect(stored!.emailOptedOutAt).toBeNull();
  });

  it('is surfaced on the customer DTO so the UI can explain an exclusion', async () => {
    const customer = await makeCustomer(ws.businessId, { emailOptedOut: true });

    const res = await asUser(ws.ownerToken).get(`/api/customers/${customer._id}`);

    expect(res.body.customer.emailOptedOut).toBe(true);
  });

  it('will not re-subscribe another business\'s customer', async () => {
    const other = await setupWorkspace();
    const theirCustomer = await makeCustomer(other.businessId, { emailOptedOut: true });

    const res = await asUser(ws.ownerToken).post(
      `/api/customers/${theirCustomer._id}/resubscribe-email`
    );

    expect(res.status).toBe(404);
    expect((await Customer.findById(theirCustomer._id).lean())!.emailOptedOut).toBe(true);
  });

  it('is available to a dispatcher, who handles customer requests day to day', async () => {
    const dispatcher = await createStaff(ws.businessId, 'dispatcher');
    const customer = await makeCustomer(ws.businessId, { emailOptedOut: true });

    const res = await asUser(dispatcher.token).post(
      `/api/customers/${customer._id}/resubscribe-email`
    );

    expect(res.status).toBe(200);
  });
});

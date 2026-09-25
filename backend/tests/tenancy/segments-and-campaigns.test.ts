import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorkspace,
  createCustomerRecord,
  createServiceRecord,
  createStaff,
  type Workspace,
} from '../helpers/factories';
import { asUser } from '../helpers/agent';
import { Customer } from '../../src/models/customer.model';
import { Appointment } from '../../src/models/appointment.model';
import { CustomerSegment } from '../../src/models/customer-segment.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { CustomerService } from '../../src/services/customer.service';
import { CustomerSegmentService } from '../../src/services/customer-segment.service';
import { EquipmentService } from '../../src/services/equipment.service';
import { InvoiceService } from '../../src/services/invoice.service';
import { AppointmentService } from '../../src/services/appointment.service';
import { CommunicationService } from '../../src/services/communication.service';
import { EmailService } from '../../src/services/email.service';
import { NotificationService } from '../../src/services/notification.service';
import { buildCustomerQuery, sanitiseCustomerFilter } from '../../src/services/customer-filter';

/**
 * Segments that work.
 *
 * Feature #13 had `tags` indexed on the model, editable in the 360 drawer, and
 * returned by nothing — `toDTO` omitted them, so the list API could not show a tag and
 * the customers page's two tag dropdowns had no data to filter against. There was no
 * saved-segment concept and no way to message a group.
 *
 * Two fields had the same "declared and never written" problem: `lifetimeValue` was
 * permanently 0 and `lastServiceAt` did not exist, which would have made a
 * "customers worth over $500" segment permanently empty.
 */

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

const stubTransports = () => {
  const smsCreate = vi.fn().mockResolvedValue({ sid: 'SM_stub' });
  vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
    messages: { create: smsCreate },
  });
  const email = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_1' });
  vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  return { smsCreate, email };
};

/** A customer with a distinct phone, so several can coexist. */
let phoneCounter = 0;
const makeCustomer = async (
  businessId: string,
  overrides: Record<string, unknown> = {}
) => {
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

describe('the plumbing that made tags useless', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  /**
   * The list API omitted tags from its DTO entirely. Everything else about
   * segmentation was downstream of this.
   */
  it('returns tags on the customer list', async () => {
    await makeCustomer(ws.businessId, { tags: ['VIP', 'MAINTENANCE_PLAN'] });

    const res = await asUser(ws.ownerToken).get('/api/customers');

    expect(res.status).toBe(200);
    expect(res.body.customers[0].tags).toEqual(['VIP', 'MAINTENANCE_PLAN']);
  });

  it('writes tags on create', async () => {
    const created = await CustomerService.createCustomer(ws.businessId, {
      firstName: 'Tagged',
      lastName: 'Person',
      phone: '+15551234567',
      tags: ['VIP'],
    });

    expect(created.tags).toEqual(['VIP']);
    const stored = await Customer.findById(created.id).lean();
    expect(stored!.tags).toEqual(['VIP']);
  });

  it('writes tags on a general update, not only through the tags endpoint', async () => {
    const customer = await makeCustomer(ws.businessId);

    const res = await asUser(ws.ownerToken)
      .patch(`/api/customers/${customer._id}`)
      .send({ tags: ['WINBACK'] });

    expect(res.status).toBe(200);
    expect((await Customer.findById(customer._id).lean())!.tags).toEqual(['WINBACK']);
  });

  /**
   * Tags are matched exactly by the segment filter, so two spellings of one tag means
   * a segment that silently misses half its audience.
   */
  it('normalises tags to upper case and deduplicates them', async () => {
    const created = await CustomerService.createCustomer(ws.businessId, {
      firstName: 'Tagged',
      lastName: 'Person',
      phone: '+15551234567',
      tags: ['vip', 'VIP', ' Vip ', 'winback'],
    });

    expect(created.tags!.sort()).toEqual(['VIP', 'WINBACK']);
  });

  it('surfaces lifetime value and last service date', async () => {
    const customer = await makeCustomer(ws.businessId, {
      lifetimeValue: 1250.5,
      lastServiceAt: new Date('2026-01-15T00:00:00.000Z'),
    });

    const res = await asUser(ws.ownerToken).get(`/api/customers/${customer._id}`);

    expect(res.body.customer.lifetimeValue).toBe(1250.5);
    expect(res.body.customer.lastServiceAt).toBeTruthy();
  });

  /** The search term went straight into `new RegExp`, so "(" returned a 500. */
  it('does not blow up on a search term containing regex characters', async () => {
    await makeCustomer(ws.businessId, { firstName: 'Normal' });

    const res = await asUser(ws.ownerToken).get('/api/customers?search=%28');

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(0);
  });
});

describe('rollup fields that nothing used to write', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
    stubTransports();
  });

  /**
   * `lifetimeValue` was declared on the schema from the beginning and written by
   * nothing, so it was permanently 0 — `customer-360.service.ts` even computes a
   * fallback on read because the stored value could not be trusted.
   */
  it('accumulates lifetime value from payments actually received', async () => {
    const customer = await makeCustomer(ws.businessId);

    const invoice = await InvoiceService.createInvoice(ws.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Repair', quantity: 1, unitPrice: 400, total: 400 }] as any,
      taxRate: 0,
    });

    // Raised but unpaid: not lifetime value.
    expect((await Customer.findById(customer._id).lean())!.lifetimeValue).toBe(0);

    await InvoiceService.recordPaymentForBusiness(ws.businessId, invoice._id.toString(), {
      amount: 150,
      paymentMethod: 'check',
    });
    expect((await Customer.findById(customer._id).lean())!.lifetimeValue).toBe(150);

    await InvoiceService.recordPaymentForBusiness(ws.businessId, invoice._id.toString(), {
      amount: 250,
      paymentMethod: 'cash',
    });
    // Two partial payments, not the invoice total counted twice.
    expect((await Customer.findById(customer._id).lean())!.lifetimeValue).toBe(400);
  });

  it('stamps the last service date when an appointment completes', async () => {
    const customer = await makeCustomer(ws.businessId);
    const service = await createServiceRecord(ws.businessId);
    const startAt = new Date('2026-05-10T15:00:00.000Z');

    const appointment = await Appointment.create({
      businessId: ws.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt,
      endAt: new Date(startAt.getTime() + 3600_000),
      status: 'scheduled',
    });

    await AppointmentService.updateStatus(
      ws.businessId,
      appointment._id.toString(),
      'completed'
    );

    expect(
      (await Customer.findById(customer._id).lean())!.lastServiceAt!.getTime()
    ).toBe(startAt.getTime());
  });

  /**
   * A technician closing last week's job today must not drag the date backwards past a
   * more recent visit.
   */
  it('never moves the last service date backwards', async () => {
    const customer = await makeCustomer(ws.businessId, {
      lastServiceAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const service = await createServiceRecord(ws.businessId);
    const older = new Date('2026-01-01T15:00:00.000Z');

    const appointment = await Appointment.create({
      businessId: ws.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt: older,
      endAt: new Date(older.getTime() + 3600_000),
      status: 'scheduled',
    });

    await AppointmentService.updateStatus(
      ws.businessId,
      appointment._id.toString(),
      'completed'
    );

    expect(
      (await Customer.findById(customer._id).lean())!.lastServiceAt!.toISOString()
    ).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('the filter builder', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  const countMatching = async (filter: any): Promise<number> => {
    const query = await buildCustomerQuery(ws.businessId, sanitiseCustomerFilter(filter));
    return Customer.countDocuments(query);
  };

  it('matches any of several tags by default', async () => {
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['WINBACK'] });
    await makeCustomer(ws.businessId, { tags: ['OTHER'] });

    expect(await countMatching({ tags: ['VIP', 'WINBACK'] })).toBe(2);
  });

  it('can require all tags', async () => {
    await makeCustomer(ws.businessId, { tags: ['VIP', 'WINBACK'] });
    await makeCustomer(ws.businessId, { tags: ['VIP'] });

    expect(await countMatching({ tags: ['VIP', 'WINBACK'], tagMode: 'all' })).toBe(1);
  });

  /** What makes "customers we have NOT tagged as maintenance plan" expressible. */
  it('can exclude tags', async () => {
    await makeCustomer(ws.businessId, { tags: ['MAINTENANCE_PLAN'] });
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: [] });

    expect(await countMatching({ tags: ['MAINTENANCE_PLAN'], tagMode: 'none' })).toBe(2);
  });

  it('filters by lifetime value range', async () => {
    await makeCustomer(ws.businessId, { lifetimeValue: 100 });
    await makeCustomer(ws.businessId, { lifetimeValue: 600 });
    await makeCustomer(ws.businessId, { lifetimeValue: 2000 });

    expect(await countMatching({ minLifetimeValue: 500 })).toBe(2);
    expect(await countMatching({ minLifetimeValue: 500, maxLifetimeValue: 1000 })).toBe(1);
  });

  /**
   * A win-back segment wants both "serviced long ago" and "never serviced" — the
   * latter being the most overdue of all.
   */
  it('includes never-serviced customers in a serviced-before window', async () => {
    await makeCustomer(ws.businessId, { lastServiceAt: new Date('2025-01-01') });
    await makeCustomer(ws.businessId, { lastServiceAt: new Date('2026-09-01') });
    await makeCustomer(ws.businessId, { lastServiceAt: null });

    expect(await countMatching({ servicedBefore: '2026-01-01' })).toBe(2);
  });

  it('can narrow to only never-serviced customers', async () => {
    await makeCustomer(ws.businessId, { lastServiceAt: new Date('2025-01-01') });
    await makeCustomer(ws.businessId, { lastServiceAt: null });

    expect(await countMatching({ neverServiced: true })).toBe(1);
  });

  it('filters by equipment brand', async () => {
    const withCarrier = await makeCustomer(ws.businessId);
    const withTrane = await makeCustomer(ws.businessId);
    await makeCustomer(ws.businessId);

    await EquipmentService.create(ws.businessId, withCarrier._id.toString(), {
      type: 'heat_pump',
      brand: 'Carrier',
    });
    await EquipmentService.create(ws.businessId, withTrane._id.toString(), {
      type: 'furnace',
      brand: 'Trane',
    });

    expect(await countMatching({ equipmentBrand: 'carrier' })).toBe(1);
  });

  /**
   * Omitting the clause when nothing matched would widen the segment to every
   * customer — the difference between "nobody has a Lennox" and "everybody does".
   */
  it('matches nobody when no equipment of that brand exists', async () => {
    await makeCustomer(ws.businessId);
    await makeCustomer(ws.businessId);

    expect(await countMatching({ equipmentBrand: 'Lennox' })).toBe(0);
  });

  /**
   * Two clauses that both need `$or` must both survive.
   *
   * A text search spans four fields and a serviced-before window has to include
   * never-serviced customers, so both are `$or`. Merged into one object the second
   * silently replaces the first — no error, just a filter that quietly stopped
   * applying.
   *
   * The fixture needs a customer that the *search* excludes and the *date* includes,
   * or losing the search clause produces the same count and the test passes for
   * nothing.
   */
  it('does not let two clauses that both need $or overwrite each other', async () => {
    const match = await makeCustomer(ws.businessId, {
      firstName: 'Findme',
      lastServiceAt: new Date('2025-01-01'),
    });
    // Right name, wrong date.
    await makeCustomer(ws.businessId, {
      firstName: 'Findme',
      lastServiceAt: new Date('2026-09-01'),
    });
    // Right date, wrong name — this is the one that exposes a dropped search clause.
    await makeCustomer(ws.businessId, {
      firstName: 'Someoneelse',
      lastServiceAt: new Date('2025-01-01'),
    });

    const query = await buildCustomerQuery(
      ws.businessId,
      sanitiseCustomerFilter({ search: 'Findme', servicedBefore: '2026-01-01' })
    );
    const found = await Customer.find(query);

    expect(found).toHaveLength(1);
    expect(String(found[0]._id)).toBe(String(match._id));
  });

  it('never matches another business\'s customers', async () => {
    const other = await setupWorkspace();
    await makeCustomer(other.businessId, { tags: ['VIP'] });

    expect(await countMatching({ tags: ['VIP'] })).toBe(0);
  });

  it('rejects an unparseable date at sanitise time', () => {
    expect(() => sanitiseCustomerFilter({ servicedBefore: 'sometime last year' })).toThrow();
  });

  it('strips keys that are not part of the stored contract', () => {
    const clean = sanitiseCustomerFilter({
      tags: ['VIP'],
      businessId: 'someone-elses-id',
      $where: 'this.password',
      nonsense: true,
    });

    expect(clean).toEqual({ tags: ['VIP'] });
  });

  /**
   * The consent and channel flags are send-time concerns, not part of what a segment is.
   *
   * Storing one would mean a segment's headline count silently reflected a consent rule
   * unrelated to its definition — and that count sits next to a send button. The campaign
   * sender adds whichever apply to the channel it is about to use.
   */
  it('refuses to store send-time consent flags in a segment', () => {
    const clean = sanitiseCustomerFilter({
      tags: ['VIP'],
      excludeOptedOut: true,
      excludeEmailOptedOut: true,
      requireEmail: true,
    });

    expect(clean).toEqual({ tags: ['VIP'] });
  });

  /** But the query builder must still honour them, because that is how campaigns work. */
  it('still applies them when the campaign sender passes them directly', async () => {
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['VIP'], isOptedOut: true });
    await makeCustomer(ws.businessId, { tags: ['VIP'], emailOptedOut: true });

    const smsQuery = await buildCustomerQuery(ws.businessId, {
      tags: ['VIP'],
      excludeOptedOut: true,
    });
    expect(await Customer.countDocuments(smsQuery)).toBe(2);

    const emailQuery = await buildCustomerQuery(ws.businessId, {
      tags: ['VIP'],
      excludeEmailOptedOut: true,
    });
    expect(await Customer.countDocuments(emailQuery)).toBe(2);
  });
});

describe('saved segments', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  it('saves a named filter and reports a live count', async () => {
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['OTHER'] });

    const created = await asUser(ws.ownerToken)
      .post('/api/segments')
      .send({ name: 'VIP customers', filter: { tags: ['VIP'] } });

    expect(created.status).toBe(201);
    expect(created.body.segment.count).toBe(2);

    // Adding a customer changes the count, because it is never cached.
    await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const list = await asUser(ws.ownerToken).get('/api/segments');
    expect(list.body.segments[0].count).toBe(3);
  });

  /**
   * A segment matching everyone, sitting next to a send button, is a loaded gun.
   */
  it('refuses a segment with no conditions', async () => {
    const res = await asUser(ws.ownerToken)
      .post('/api/segments')
      .send({ name: 'Everyone', filter: {} });

    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toMatch(/every customer/i);
    expect(await CustomerSegment.countDocuments({})).toBe(0);
  });

  it('refuses two segments with the same name, ignoring case', async () => {
    await asUser(ws.ownerToken)
      .post('/api/segments')
      .send({ name: 'VIP', filter: { tags: ['VIP'] } });

    const duplicate = await asUser(ws.ownerToken)
      .post('/api/segments')
      .send({ name: 'vip', filter: { tags: ['WINBACK'] } });

    expect(duplicate.status).toBe(409);
  });

  it('counts an unsaved filter so the audience is known before committing', async () => {
    await makeCustomer(ws.businessId, { lifetimeValue: 900 });
    await makeCustomer(ws.businessId, { lifetimeValue: 10 });

    const res = await asUser(ws.ownerToken)
      .post('/api/segments/count')
      .send({ filter: { minLifetimeValue: 500 } });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(await CustomerSegment.countDocuments({})).toBe(0);
  });

  /**
   * The headline number and the members must come from the same query. If they can
   * disagree, a segment reading "42 customers" sends to 39 and nobody knows which
   * number was wrong.
   */
  it('previews exactly the customers its count claims', async () => {
    for (let i = 0; i < 4; i++) await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['OTHER'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const res = await asUser(ws.ownerToken).get(`/api/segments/${segment.id}/preview`);

    expect(res.body.count).toBe(4);
    expect(res.body.customers).toHaveLength(4);
  });

  it('does not expose another business\'s segments', async () => {
    const other = await setupWorkspace();
    const theirs = await CustomerSegmentService.create(other.businessId, {
      name: 'Theirs',
      filter: { tags: ['VIP'] },
    });

    const list = await asUser(ws.ownerToken).get('/api/segments');
    expect(list.body.segments).toHaveLength(0);

    const read = await asUser(ws.ownerToken).get(`/api/segments/${theirs.id}/preview`);
    expect(read.status).toBe(404);

    const del = await asUser(ws.ownerToken).delete(`/api/segments/${theirs.id}`);
    expect(del.status).toBe(404);
  });

  it('cannot be tricked into counting another tenant by a stored businessId', async () => {
    const other = await setupWorkspace();
    await makeCustomer(other.businessId, { tags: ['VIP'] });

    // businessId is a parameter, never part of the stored filter — sanitise strips it.
    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'Sneaky',
      filter: { tags: ['VIP'], businessId: other.businessId } as any,
    });

    expect(segment.count).toBe(0);
    expect((segment.filter as any).businessId).toBeUndefined();
  });
});

describe('campaigns', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    phoneCounter = 0;
  });

  it('sends one text per customer in the segment', async () => {
    const { smsCreate } = stubTransports();
    for (let i = 0; i < 3; i++) await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['OTHER'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const res = await asUser(ws.ownerToken)
      .post(`/api/segments/${segment.id}/campaign`)
      .send({
        channel: 'sms',
        body: 'Spring tune-up special this month. Reply STOP to unsubscribe.',
      });

    expect(res.status).toBe(200);
    expect(res.body.result.audience).toBe(3);
    expect(res.body.result.sent).toBe(3);
    expect(smsCreate).toHaveBeenCalledTimes(3);

    const logs = await CommunicationLog.find({ businessId: ws.businessId, channel: 'sms' });
    expect(logs).toHaveLength(3);
  });

  /**
   * The single most important property. A bulk sender that assembles its own recipient
   * list is how a marketing blast reaches someone who texted STOP.
   */
  it('skips a customer who has opted out of texts', async () => {
    const { smsCreate } = stubTransports();
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await makeCustomer(ws.businessId, { tags: ['VIP'], isOptedOut: true });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'sms',
      body: 'Offer inside. Reply STOP to unsubscribe.',
    });

    // Excluded from the audience up front, so the operator sees the real number.
    expect(result.audience).toBe(1);
    expect(result.sent).toBe(1);
    expect(smsCreate).toHaveBeenCalledTimes(1);
  });

  /**
   * Every transactional send bypasses quiet hours because the customer just asked for
   * something. A campaign is the opposite — a cold contact, which is what the window
   * exists for.
   */
  it('does not send during quiet hours', async () => {
    const { smsCreate } = stubTransports();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(true);

    await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'sms',
      body: 'Offer inside. Reply STOP to unsubscribe.',
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.reasons.quiet_hours).toBe(1);
    expect(smsCreate).not.toHaveBeenCalled();
  });

  /**
   * The transactional templates ship with an opt-out notice. This body is typed fresh
   * by an operator, and a bulk send with no way out is the clearest TCPA exposure in
   * the product.
   */
  it('refuses a campaign text with no opt-out notice', async () => {
    stubTransports();
    await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const res = await asUser(ws.ownerToken)
      .post(`/api/segments/${segment.id}/campaign`)
      .send({ channel: 'sms', body: 'Spring tune-up special this month!' });

    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toMatch(/opt out|STOP/i);
    expect(await CommunicationLog.countDocuments({})).toBe(0);
  });

  it('narrows an email campaign to customers who have an address', async () => {
    const { email } = stubTransports();
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    const noEmail = await makeCustomer(ws.businessId, { tags: ['VIP'] });
    await Customer.updateOne({ _id: noEmail._id }, { $unset: { email: 1 } });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'email',
      subject: 'Spring tune-up',
      body: 'Book before the end of the month.',
    });

    // The operator sees 1, not 2 with a skip afterwards.
    expect(result.audience).toBe(1);
    expect(result.sent).toBe(1);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('requires a subject on an email campaign', async () => {
    stubTransports();
    await makeCustomer(ws.businessId, { tags: ['VIP'] });
    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const res = await asUser(ws.ownerToken)
      .post(`/api/segments/${segment.id}/campaign`)
      .send({ channel: 'email', body: 'Book before the end of the month.' });

    expect(res.status).toBe(400);
  });

  it('can report the audience without sending', async () => {
    const { smsCreate } = stubTransports();
    for (let i = 0; i < 2; i++) await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'sms',
      body: 'Offer. Reply STOP to unsubscribe.',
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.audience).toBe(2);
    expect(result.sent).toBe(0);
    expect(smsCreate).not.toHaveBeenCalled();
  });

  /**
   * The loop's own catch, which nothing else reaches.
   *
   * `NotificationService.send` does not throw — it catches internally and reports per
   * channel — so a provider rejection exercises that handler, not this one. The guard
   * in the campaign loop is the last line of defence against an unforeseen fault, and
   * without forcing a throw it is untested: a mutation turning it into a rethrow
   * survives, and one bad recipient would abandon the rest of the send.
   */
  it('keeps going when the notification layer itself throws', async () => {
    stubTransports();
    for (let i = 0; i < 3; i++) await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const send = vi
      .spyOn(NotificationService, 'send')
      .mockRejectedValueOnce(new Error('unforeseen fault'))
      .mockResolvedValue({
        type: 'custom',
        results: [{ channel: 'sms', status: 'sent' }],
        sentAny: true,
      });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'sms',
      body: 'Offer. Reply STOP to unsubscribe.',
    });

    expect(send).toHaveBeenCalledTimes(3);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.reasons.unexpected_error).toBe(1);
  });

  /** One bad number must not abandon the other recipients. */
  it('keeps going after one recipient fails', async () => {
    const smsCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('unreachable'))
      .mockResolvedValue({ sid: 'SM_stub' });
    vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
      messages: { create: smsCreate },
    });
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);

    for (let i = 0; i < 3; i++) await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'VIPs',
      filter: { tags: ['VIP'] },
    });

    const result = await CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
      channel: 'sms',
      body: 'Offer. Reply STOP to unsubscribe.',
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(smsCreate).toHaveBeenCalledTimes(3);
  });

  /**
   * A blast-radius limit, not a technical one. A mistyped filter matching every
   * customer should fail loudly rather than send five hundred texts.
   */
  it('refuses an audience over the campaign cap', async () => {
    stubTransports();

    // Bulk-inserted rather than created one at a time, to keep the test quick.
    await Customer.insertMany(
      Array.from({ length: 501 }, (_, i) => ({
        businessId: ws.businessId,
        firstName: 'Bulk',
        lastName: `Person${i}`,
        phone: `+1555${String(100000 + i)}`,
        tags: ['BULK'],
      }))
    );

    const segment = await CustomerSegmentService.create(ws.businessId, {
      name: 'Everyone bulk',
      filter: { tags: ['BULK'] },
    });

    await expect(
      CustomerSegmentService.sendCampaign(ws.businessId, segment.id, {
        channel: 'sms',
        body: 'Offer. Reply STOP to unsubscribe.',
      })
    ).rejects.toThrow(/limit for one campaign/i);
  });

  it('is owner-only to send, but a dispatcher can define segments', async () => {
    stubTransports();
    const dispatcher = await createStaff(ws.businessId, 'dispatcher');
    await makeCustomer(ws.businessId, { tags: ['VIP'] });

    const created = await asUser(dispatcher.token)
      .post('/api/segments')
      .send({ name: 'VIPs', filter: { tags: ['VIP'] } });
    expect(created.status).toBe(201);

    const send = await asUser(dispatcher.token)
      .post(`/api/segments/${created.body.segment.id}/campaign`)
      .send({ channel: 'sms', body: 'Offer. Reply STOP to unsubscribe.' });
    expect(send.status).toBe(403);

    expect(await CommunicationLog.countDocuments({})).toBe(0);
  });

  it('will not send to another business\'s segment', async () => {
    stubTransports();
    const other = await setupWorkspace();
    await makeCustomer(other.businessId, { tags: ['VIP'] });
    const theirs = await CustomerSegmentService.create(other.businessId, {
      name: 'Theirs',
      filter: { tags: ['VIP'] },
    });

    const res = await asUser(ws.ownerToken)
      .post(`/api/segments/${theirs.id}/campaign`)
      .send({ channel: 'sms', body: 'Offer. Reply STOP to unsubscribe.' });

    expect(res.status).toBe(404);
    expect(await CommunicationLog.countDocuments({})).toBe(0);
  });
});

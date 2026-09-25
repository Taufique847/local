import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorkspace,
  createCustomerRecord,
  createServiceRecord,
  bookableAt,
  type Workspace,
} from '../helpers/factories';
import { asUser } from '../helpers/agent';
import { Appointment } from '../../src/models/appointment.model';
import { Business } from '../../src/models/business.model';
import { Customer } from '../../src/models/customer.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { RescheduleRequest } from '../../src/models/reschedule-request.model';
import { CommunicationService } from '../../src/services/communication.service';
import { AppointmentReplyService } from '../../src/services/appointment-reply.service';
import { AvailabilityService } from '../../src/services/availability.service';
import { BusinessPolicy } from '../../src/models/business-policy.model';
import { AppointmentStatus } from '../../src/types/appointment.types';
import { zonedWallClockToUtc } from '../../src/utils/format';

/**
 * Confirm and reschedule by reply.
 *
 * The reminder tells the customer to reply `C` or `R`; these tests are what make
 * that instruction true rather than a promise. They also cover the case the old
 * code got wrong by omission: a message nothing understands is no longer dropped
 * in silence.
 */

const BIZ_NUMBER = '+15557770000';
const CUSTOMER_PHONE = '+15552223333';
const HOUR = 60 * 60 * 1000;

const setupWorkspace = async (): Promise<Workspace> => {
  const ws = await createWorkspace();

  await BusinessPhoneNumber.create({
    businessId: ws.businessId,
    phoneNumber: BIZ_NUMBER,
    status: 'active',
    isPrimary: true,
  });

  /**
   * Open every day, wide hours. The reschedule reply offers slots from
   * `getAvailableSlots`, which returns nothing at all for a day the business is
   * closed — so without hours these tests would assert "no slots offered" and
   * pass for entirely the wrong reason.
   */
  await Business.findByIdAndUpdate(ws.businessId, {
    email: 'shop@example.com',
    businessHours: [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ].map((day) => ({ day, isOpen: true, openTime: '00:00', closeTime: '23:30' })),
  });

  return ws;
};

const makeAppointment = async (
  businessId: string,
  options: { hoursFromNow?: number; status?: AppointmentStatus; customerId?: any } = {}
) => {
  const customerId = options.customerId ?? (await createCustomerRecord(businessId))._id;
  const service = await createServiceRecord(businessId);
  const startAt = new Date(Date.now() + (options.hoursFromNow ?? 30) * HOUR);

  return Appointment.create({
    businessId,
    customerId,
    serviceId: service._id,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
    status: options.status ?? 'scheduled',
    address: '1 Test St, Testville, TX 75001',
  });
};

/**
 * A Chicago wall-clock time, as a UTC instant.
 *
 * The opening-hours tests used to send a hardcoded UTC hour with a comment saying
 * what it meant in Chicago — true in July and an hour out for the rest of the year,
 * and both of them also happened to land in 2027, outside the 30-day booking horizon
 * that nothing was checking. Stating the local time and converting says what the test
 * means and survives DST.
 */
const chicagoWallClock = (daysAhead: number, minutesOfDay: number): Date => {
  const target = new Date(Date.now() + daysAhead * 24 * HOUR);
  return zonedWallClockToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    minutesOfDay,
    'America/Chicago'
  );
};

const inbound = (text: string, from = CUSTOMER_PHONE) =>
  CommunicationService.handleInboundSms({
    MessageSid: `SM_${Math.random().toString(36).slice(2)}`,
    From: from,
    To: BIZ_NUMBER,
    Body: text,
  });

describe('keyword matching', () => {
  it.each(['C', 'c', ' C ', 'CONFIRM', 'confirm'])('reads %j as a confirmation', (text) => {
    expect(AppointmentReplyService.matchKeyword(text)).toBe('confirm');
  });

  it.each(['R', 'r', 'RESCHEDULE', 'reschedule'])('reads %j as a reschedule', (text) => {
    expect(AppointmentReplyService.matchKeyword(text)).toBe('reschedule');
  });

  /**
   * Exact match only, deliberately.
   *
   * "Can we reschedule?" contains the word, but inferring intent from prose is
   * how a customer saying "I do NOT want to reschedule" gets rescheduled. Prose
   * goes to a human.
   */
  it.each([
    'Can we reschedule please?',
    'C u tomorrow',
    'yes',
    'STOP',
    '5',
    '',
    'Confirmed already thanks',
  ])('does not treat %j as a keyword', (text) => {
    expect(AppointmentReplyService.matchKeyword(text)).toBeNull();
  });
});

describe('replying C to confirm', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  it('stamps confirmedByCustomerAt and advances the status', async () => {
    const appointment = await makeAppointment(ws.businessId);

    const res = await inbound('C');

    expect(res.reply).toMatch(/confirmed/i);

    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.confirmedByCustomerAt).toBeInstanceOf(Date);
    expect(reloaded!.status).toBe('confirmed');
  });

  /**
   * `confirmedByCustomerAt` is not the same fact as `status: 'confirmed'`. One is
   * the customer's own acknowledgement, the other is the business's. Overwriting
   * 'rescheduled' would lose how the appointment came to be at this time.
   */
  it('keeps a rescheduled status while still recording the confirmation', async () => {
    const appointment = await makeAppointment(ws.businessId, { status: 'rescheduled' });

    await inbound('C');

    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.confirmedByCustomerAt).toBeInstanceOf(Date);
    expect(reloaded!.status).toBe('rescheduled');
  });

  /**
   * Twilio retries a webhook that did not return 2xx, and a customer can text C
   * twice. Re-stamping would move the timestamp and make "when did they confirm?"
   * unanswerable.
   */
  it('is idempotent and keeps the first timestamp', async () => {
    const appointment = await makeAppointment(ws.businessId);

    await inbound('C');
    const first = (await Appointment.findById(appointment._id))!.confirmedByCustomerAt;

    await new Promise((r) => setTimeout(r, 15));
    const second = await inbound('C');

    expect(second.reply).toMatch(/already confirmed/i);
    const after = (await Appointment.findById(appointment._id))!.confirmedByCustomerAt;
    expect(after!.getTime()).toBe(first!.getTime());
  });

  it('confirms the nearest appointment, not an arbitrary one', async () => {
    const customer = await createCustomerRecord(ws.businessId);
    const soon = await makeAppointment(ws.businessId, {
      hoursFromNow: 20,
      customerId: customer._id,
    });
    const later = await makeAppointment(ws.businessId, {
      hoursFromNow: 300,
      customerId: customer._id,
    });

    await inbound('C');

    expect((await Appointment.findById(soon._id))!.confirmedByCustomerAt).toBeInstanceOf(Date);
    expect((await Appointment.findById(later._id))!.confirmedByCustomerAt).toBeNull();
  });

  it('ignores an appointment that has already passed', async () => {
    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: -5 });

    const res = await inbound('C');

    expect(res.reply).toMatch(/could not find an upcoming appointment/i);
    expect((await Appointment.findById(appointment._id))!.confirmedByCustomerAt).toBeNull();
  });

  it.each<AppointmentStatus>(['cancelled', 'completed', 'no_show'])(
    'ignores a %s appointment',
    async (status) => {
      await makeAppointment(ws.businessId, { status });

      const res = await inbound('C');

      expect(res.reply).toMatch(/could not find an upcoming appointment/i);
    }
  );

  it('ignores a keyword from a number with no customer record here', async () => {
    const other = await setupWorkspace();
    await makeAppointment(other.businessId);

    // Texting OUR number, with their appointment. Must not confirm it.
    const res = await inbound('C');

    expect(res.reply).toBeUndefined();
    const theirs = await Appointment.findOne({ businessId: other.businessId });
    expect(theirs!.confirmedByCustomerAt).toBeNull();
  });

  /**
   * The appointment lookup's own tenant scope.
   *
   * The test above does not reach it: with no customer record at this business the
   * handler bails at the customer lookup, so dropping `businessId` from the
   * appointment query survives it. A homeowner who uses two contractors — the same
   * phone number known to both — is the case that exposes it, and it is an
   * entirely ordinary one.
   */
  it('will not confirm another business\'s appointment for a shared phone number', async () => {
    const other = await setupWorkspace();

    // Known to both businesses under the same number.
    await createCustomerRecord(ws.businessId);
    const theirCustomer = await createCustomerRecord(other.businessId);
    const theirAppointment = await makeAppointment(other.businessId, {
      customerId: theirCustomer._id,
    });

    // We have a customer but no appointment; they have the appointment.
    const res = await inbound('C');

    expect(res.reply).toMatch(/could not find an upcoming appointment/i);
    expect((await Appointment.findById(theirAppointment._id))!.confirmedByCustomerAt).toBeNull();
  });

  /**
   * The `businessId` clause on the appointment lookup, specifically.
   *
   * With consistent data that clause is redundant — `customerId` comes from a
   * tenant-scoped customer lookup, and customer documents are per-tenant, so the
   * id already implies the tenant. It earns its place against *inconsistent* data:
   * an appointment row carrying one business's id and another's customer. Rows
   * mis-tenanted exactly like this are not hypothetical in this codebase, which is
   * why the clause stays and why this test writes one directly.
   */
  it('ignores an appointment row whose businessId does not match its customer', async () => {
    const other = await setupWorkspace();
    const customer = await createCustomerRecord(ws.businessId);
    const service = await createServiceRecord(other.businessId);

    const startAt = new Date(Date.now() + 30 * HOUR);
    const mistenanted = await Appointment.create({
      // Belongs to the other business, but points at OUR customer.
      businessId: other.business._id,
      customerId: customer._id,
      serviceId: service._id,
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
    });

    const res = await inbound('C');

    expect(res.reply).toMatch(/could not find an upcoming appointment/i);
    expect((await Appointment.findById(mistenanted._id))!.confirmedByCustomerAt).toBeNull();
  });
});

describe('replying R to reschedule', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  it('opens a pending request and offers real alternatives', async () => {
    const appointment = await makeAppointment(ws.businessId);

    const res = await inbound('R');

    expect(res.reply).toMatch(/nearest openings/i);

    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });
    expect(request).not.toBeNull();
    expect(request!.status).toBe('pending');
    expect(request!.source).toBe('sms');
    expect(request!.originalStartAt.getTime()).toBe(appointment.startAt.getTime());
    expect(request!.offeredSlots.length).toBeGreaterThan(0);

    // The appointment itself must not move until someone applies the request.
    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.startAt.getTime()).toBe(appointment.startAt.getTime());
    expect(reloaded!.status).toBe('scheduled');
  });

  /**
   * The appointment is placed on a real generated slot, so the assertion is about
   * something that could actually happen.
   *
   * With an arbitrary `Date.now() + 30h` start this passes for free: slots land on
   * clean half-hour boundaries and an arbitrary millisecond offset never collides
   * with one. Pinning the appointment to a slot the generator genuinely emits is
   * what makes "we did not offer them the time they are trying to escape" a claim
   * rather than a coincidence.
   */
  it('never offers the time the customer already has', async () => {
    const customer = await createCustomerRecord(ws.businessId);
    const service = await createServiceRecord(ws.businessId);

    // Ask the generator which slots exist today, and take one it reports open.
    const today = new Date().toISOString().slice(0, 10);
    const { slots } = await AvailabilityService.getAvailableSlots(
      ws.businessId,
      service._id.toString(),
      today
    );
    const target = slots.find((s) => s.available);
    expect(target).toBeDefined();

    const startAt = new Date(target!.startAt);

    const appointment = await Appointment.create({
      businessId: ws.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt,
      endAt: new Date(target!.endAt),
      status: 'scheduled',
    });

    await inbound('R');

    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });
    const offered = request!.offeredSlots;

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.map((s) => s.startAt.getTime())).not.toContain(startAt.getTime());

    /**
     * Two properties a customer would notice being broken, asserted directly
     * rather than trusting `available` to mean what it says: nothing offered may be
     * in the past, and nothing may overlap the appointment they already hold. The
     * day's slot list starts at 00:00, so dropping the availability filter puts
     * this morning's expired slots straight into the offer.
     */
    for (const slot of offered) {
      expect(slot.startAt.getTime()).toBeGreaterThan(Date.now());
      const overlaps =
        slot.startAt.getTime() < appointment.endAt.getTime() &&
        slot.endAt.getTime() > appointment.startAt.getTime();
      expect(overlaps).toBe(false);
    }
  });

  /**
   * One pending request per appointment. A customer texting R twice should get
   * fresh slots, not a second row for the owner to work through.
   */
  it('refreshes the existing request rather than opening a second', async () => {
    const appointment = await makeAppointment(ws.businessId);

    await inbound('R');
    await inbound('R');

    expect(await RescheduleRequest.countDocuments({ appointmentId: appointment._id })).toBe(1);
  });

  it('still records the request when no slots are open', async () => {
    // Closed every day, so getAvailableSlots returns nothing at all.
    await Business.findByIdAndUpdate(ws.businessId, {
      businessHours: [{ day: 'Monday', isOpen: false, openTime: '08:00', closeTime: '18:00' }],
    });

    const appointment = await makeAppointment(ws.businessId);

    const res = await inbound('R');

    expect(res.reply).toMatch(/reschedule request/i);
    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });
    expect(request).not.toBeNull();
    expect(request!.offeredSlots).toHaveLength(0);
  });
});

describe('the needs-attention queue', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  /**
   * The behaviour this whole mechanism exists for. Prose used to be logged and
   * dropped: no reply to the customer, and nothing telling the owner a question
   * had been asked.
   */
  it('flags a message no handler understood', async () => {
    await makeAppointment(ws.businessId);

    const res = await inbound('Hi, will the tech be able to look at the thermostat too?');

    // No invented reply. Silence is correct here; invisibility was not.
    expect(res.reply).toBeUndefined();

    const rows = await CommunicationLog.find({ direction: 'inbound' });
    expect(rows).toHaveLength(1);
    expect(rows[0].needsAttention).toBe(true);
  });

  it.each([
    ['C', 'a confirmation'],
    ['R', 'a reschedule'],
    ['STOP', 'an opt-out'],
    ['START', 'an opt-in'],
  ])('does not flag %s, which is %s', async (text) => {
    await makeAppointment(ws.businessId);

    await inbound(text);

    const row = await CommunicationLog.findOne({ direction: 'inbound' });
    expect(row!.needsAttention).toBe(false);
  });

  it('exposes the queue to the owner and lets them clear it', async () => {
    await makeAppointment(ws.businessId);
    await inbound('Do you take Amex?');

    const list = await asUser(ws.ownerToken).get('/api/messages/needs-attention');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);

    const id = list.body.messages[0]._id;
    const resolve = await asUser(ws.ownerToken).post(`/api/messages/${id}/resolve-attention`);
    expect(resolve.status).toBe(200);

    const after = await asUser(ws.ownerToken).get('/api/messages/needs-attention');
    expect(after.body.total).toBe(0);
  });

  it('will not let one business clear another business\'s message', async () => {
    const other = await setupWorkspace();
    await makeAppointment(ws.businessId);
    await inbound('Do you take Amex?');

    const row = await CommunicationLog.findOne({ direction: 'inbound' });

    const res = await asUser(other.ownerToken).post(
      `/api/messages/${row!._id}/resolve-attention`
    );

    expect(res.status).toBe(404);
    expect((await CommunicationLog.findById(row!._id))!.needsAttention).toBe(true);
  });

  it('does not show one business\'s queue to another', async () => {
    const other = await setupWorkspace();
    await makeAppointment(ws.businessId);
    await inbound('Do you take Amex?');

    const mine = await asUser(ws.ownerToken).get('/api/messages/needs-attention');
    expect(mine.body.total).toBe(1);

    const theirs = await asUser(other.ownerToken).get('/api/messages/needs-attention');
    expect(theirs.body.total).toBe(0);
    expect(theirs.body.messages).toHaveLength(0);
  });
});

describe('the owner reschedule queue', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  it('lists a pending request', async () => {
    await makeAppointment(ws.businessId);
    await inbound('R');

    const res = await asUser(ws.ownerToken).get('/api/reschedule-requests?status=pending');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.requests[0].status).toBe('pending');
    // Populated so the owner can act without a second round trip.
    expect(res.body.requests[0].customerId.phone).toBe(CUSTOMER_PHONE);
  });

  it('applies a request by actually moving the appointment', async () => {
    const appointment = await makeAppointment(ws.businessId);
    await inbound('R');

    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });
    const newStart = request!.offeredSlots[0].startAt;

    const res = await asUser(ws.ownerToken)
      .post(`/api/reschedule-requests/${request!._id}/apply`)
      .send({ startAt: newStart.toISOString() });

    expect(res.status).toBe(200);

    const moved = await Appointment.findById(appointment._id);
    expect(moved!.startAt.getTime()).toBe(newStart.getTime());
    // Routed through rescheduleAppointment, so the audit trail is written.
    expect(moved!.rescheduleHistory).toHaveLength(1);
    expect(moved!.status).toBe('rescheduled');

    const after = await RescheduleRequest.findById(request!._id);
    expect(after!.status).toBe('applied');
    expect(after!.appliedStartAt!.getTime()).toBe(newStart.getTime());
  });

  it('refuses to apply the same request twice', async () => {
    const appointment = await makeAppointment(ws.businessId);
    await inbound('R');
    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });
    const newStart = request!.offeredSlots[0].startAt;

    await asUser(ws.ownerToken)
      .post(`/api/reschedule-requests/${request!._id}/apply`)
      .send({ startAt: newStart.toISOString() });

    const second = await asUser(ws.ownerToken)
      .post(`/api/reschedule-requests/${request!._id}/apply`)
      .send({ startAt: newStart.toISOString() });

    expect(second.status).toBe(409);
  });

  /**
   * A failed move must leave the request pending. Marking it applied when nothing
   * changed is how an owner loses track of a customer who is still waiting.
   */
  it('leaves the request pending when the new time is rejected', async () => {
    const appointment = await makeAppointment(ws.businessId);
    await inbound('R');
    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });

    // Closed on every day, so any time is outside opening hours.
    await Business.findByIdAndUpdate(ws.businessId, {
      businessHours: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ].map((day) => ({ day, isOpen: false, openTime: '08:00', closeTime: '18:00' })),
    });

    const res = await asUser(ws.ownerToken)
      .post(`/api/reschedule-requests/${request!._id}/apply`)
      .send({ startAt: request!.offeredSlots[0].startAt.toISOString() });

    expect(res.status).toBe(409);
    expect((await RescheduleRequest.findById(request!._id))!.status).toBe('pending');
    expect((await Appointment.findById(appointment._id))!.startAt.getTime()).toBe(
      appointment.startAt.getTime()
    );
  });

  it('rejects an unparseable date before it reaches the scheduler', async () => {
    const appointment = await makeAppointment(ws.businessId);
    await inbound('R');
    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });

    const res = await asUser(ws.ownerToken)
      .post(`/api/reschedule-requests/${request!._id}/apply`)
      .send({ startAt: 'next tuesday-ish' });

    expect(res.status).toBe(400);
  });

  it('can be dismissed', async () => {
    const appointment = await makeAppointment(ws.businessId);
    await inbound('R');
    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });

    const res = await asUser(ws.ownerToken).post(
      `/api/reschedule-requests/${request!._id}/dismiss`
    );

    expect(res.status).toBe(200);
    expect((await RescheduleRequest.findById(request!._id))!.status).toBe('dismissed');
    // The appointment is untouched.
    expect((await Appointment.findById(appointment._id))!.startAt.getTime()).toBe(
      appointment.startAt.getTime()
    );
  });

  it('will not expose another business\'s request', async () => {
    const other = await setupWorkspace();
    const appointment = await makeAppointment(ws.businessId);
    await inbound('R');
    const request = await RescheduleRequest.findOne({ appointmentId: appointment._id });

    const list = await asUser(other.ownerToken).get('/api/reschedule-requests');
    expect(list.body.total).toBe(0);

    const apply = await asUser(other.ownerToken)
      .post(`/api/reschedule-requests/${request!._id}/apply`)
      .send({ startAt: new Date(Date.now() + 100 * HOUR).toISOString() });

    expect(apply.status).toBe(404);

    /**
     * Asserted on the message, not just the status.
     *
     * Both guards return 404 — the request lookup and, behind it,
     * `rescheduleAppointment`'s own tenant-scoped appointment lookup. Checking only
     * the status lets the outer scope be removed while the inner one silently
     * covers for it, which is how one of two defences rots unnoticed.
     */
    expect(apply.body.message ?? apply.body.error).toMatch(/reschedule request not found/i);
  });
});

describe('opening hours on the reschedule path', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  /**
   * `rescheduleAppointment` re-checked slot overlap and nothing else, so a move to
   * 3am succeeded: the slot genuinely is free, because nobody is working.
   */
  it('refuses a move to a time the business is closed', async () => {
    await Business.findByIdAndUpdate(ws.businessId, {
      timezone: 'America/Chicago',
      businessHours: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ].map((day) => ({ day, isOpen: true, openTime: '08:00', closeTime: '18:00' })),
    });

    const appointment = await makeAppointment(ws.businessId);

    const res = await asUser(ws.ownerToken)
      .post(`/api/appointments/${appointment._id}/reschedule`)
      .send({ startAt: chicagoWallClock(5, 3 * 60).toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.message ?? res.body.error).toMatch(/before you open|opening hours/i);
  });

  it('allows a move inside opening hours', async () => {
    await Business.findByIdAndUpdate(ws.businessId, {
      timezone: 'America/Chicago',
      businessHours: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ].map((day) => ({ day, isOpen: true, openTime: '08:00', closeTime: '18:00' })),
    });

    const appointment = await makeAppointment(ws.businessId);

    const res = await asUser(ws.ownerToken)
      .post(`/api/appointments/${appointment._id}/reschedule`)
      .send({ startAt: chicagoWallClock(5, 11 * 60).toISOString() });

    expect(res.status).toBe(200);
  });

  it('refuses a move beyond the booking horizon', async () => {
    /**
     * The horizon is enforced on reschedule; minimum notice deliberately is not.
     * They guard different things — notice protects the business from a job it has no
     * time to prepare for, which an owner moving their own card is not, while a job
     * moved a year out is a typo whoever made it and vanishes from every list that
     * looks at the next month.
     *
     * These two tests previously both booked into 2027, which is outside the default
     * 30-day horizon. They passed because nothing checked.
     */
    const appointment = await makeAppointment(ws.businessId);

    const res = await asUser(ws.ownerToken)
      .post(`/api/appointments/${appointment._id}/reschedule`)
      .send({ startAt: chicagoWallClock(400, 11 * 60).toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.message ?? res.body.error).toMatch(/days in advance/i);
  });

  it('allows a move inside the notice period, which creating would have refused', async () => {
    /**
     * Deliberate asymmetry, asserted rather than left to be discovered. With a
     * three-day notice requirement, *booking* tomorrow is refused — the business said
     * it needs the warning. *Moving* an existing job to tomorrow is not the same
     * thing: the work is already on the books, and a customer asking to be seen
     * sooner is usually the outcome everyone wants.
     *
     * Stated as a notice window rather than "in 30 minutes" so the test does not
     * depend on what time of day the suite happens to run.
     */
    await BusinessPolicy.findOneAndUpdate(
      { businessId: ws.businessId },
      { $set: { minBookingNoticeHours: 72 } },
      { upsert: true }
    );

    const appointment = await makeAppointment(ws.businessId);
    const tomorrowMidday = bookableAt(1).toISOString();

    const rejected = await asUser(ws.ownerToken)
      .post('/api/appointments')
      .send({
        customerId: (appointment.customerId as any).toString(),
        serviceId: (appointment.serviceId as any).toString(),
        startAt: tomorrowMidday,
      });

    expect(rejected.status).toBe(409);
    expect(rejected.body.message ?? rejected.body.error).toMatch(/advance notice/i);

    const moved = await asUser(ws.ownerToken)
      .post(`/api/appointments/${appointment._id}/reschedule`)
      .send({ startAt: tomorrowMidday });

    expect(moved.status).toBe(200);
  });
});

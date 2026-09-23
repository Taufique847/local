import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import {
  createWorkspace,
  createCustomerRecord,
  createServiceRecord,
  type Workspace,
} from '../helpers/factories';
import { Appointment } from '../../src/models/appointment.model';
import { BusinessPolicy } from '../../src/models/business-policy.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { Customer } from '../../src/models/customer.model';
import { Business } from '../../src/models/business.model';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { AppointmentReminderService } from '../../src/services/appointment-reminder.service';
import { CommunicationService } from '../../src/services/communication.service';
import { EmailService } from '../../src/services/email.service';
import { AppointmentStatus } from '../../src/types/appointment.types';
import { JobScheduler } from '../../src/jobs/scheduler';
import { asUser } from '../helpers/agent';

/**
 * Appointment reminders.
 *
 * Nothing in the platform sent one before this. The template and the message type
 * both existed and had zero callers, so a customer booked three weeks out heard
 * nothing until the van turned up.
 *
 * The two properties worth protecting are the selection window (remind about the
 * right appointments, and only those) and idempotence (never twice). Both are
 * mutation-checked: the tests below fail if the `startAt > now` bound, the
 * per-business lead time, the status filter or the atomic claim is weakened.
 */

const HOUR = 60 * 60 * 1000;

const setupWorkspace = async (): Promise<Workspace> => {
  const ws = await createWorkspace();

  await BusinessPhoneNumber.create({
    businessId: ws.businessId,
    phoneNumber: '+15557770000',
    status: 'active',
    isPrimary: true,
  });

  await Business.findByIdAndUpdate(ws.businessId, { email: 'shop@example.com' });

  return ws;
};

const makeAppointment = async (
  businessId: string,
  options: {
    hoursFromNow: number;
    status?: AppointmentStatus;
    reminderSentAt?: Date | null;
    reminderAttempts?: number;
    customerId?: Types.ObjectId;
  }
) => {
  const customerId =
    options.customerId ?? (await createCustomerRecord(businessId))._id;
  const service = await createServiceRecord(businessId);
  const startAt = new Date(Date.now() + options.hoursFromNow * HOUR);

  return Appointment.create({
    businessId,
    customerId,
    serviceId: service._id,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
    status: options.status ?? 'scheduled',
    address: '1 Test St, Testville, TX 75001',
    reminderSentAt: options.reminderSentAt ?? null,
    reminderAttempts: options.reminderAttempts ?? 0,
  });
};

/** Both transports succeed, without touching the network. */
const stubTransportsSucceeding = () => {
  const smsCreate = vi.fn().mockResolvedValue({ sid: 'SM_stub_1' });
  vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
    messages: { create: smsCreate },
  });
  const email = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_1' });
  return { smsCreate, email };
};

describe('reminder selection window', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
    stubTransportsSucceeding();
  });

  it('reminds about an appointment inside the default 24h lead time', async () => {
    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(1);

    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.reminderSentAt).toBeInstanceOf(Date);
    expect(reloaded!.reminderAttempts).toBe(1);

    const rows = await CommunicationLog.find({ type: 'appointment_reminder' });
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'sms']);
  });

  it('leaves an appointment beyond the lead time alone', async () => {
    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 48 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(0);
    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.reminderSentAt).toBeNull();
    expect(await CommunicationLog.countDocuments({})).toBe(0);
  });

  /**
   * The `startAt > now` bound. Without it, an appointment that has already
   * started — or an old one that was never reminded — stays selected forever and
   * the customer is reminded about a job that has been and gone.
   */
  it('never reminds about an appointment that has already started', async () => {
    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: -2 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(0);
    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.reminderSentAt).toBeNull();
  });

  it('honours a per-business lead time shorter than the default', async () => {
    await BusinessPolicy.create({ businessId: ws.businessId, reminderLeadHours: 2 });

    const soon = await makeAppointment(ws.businessId, { hoursFromNow: 1 });
    const later = await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(1);
    expect((await Appointment.findById(soon._id))!.reminderSentAt).toBeInstanceOf(Date);
    // 6h out with a 2h lead is not due, even though it is inside the default 24h.
    expect((await Appointment.findById(later._id))!.reminderSentAt).toBeNull();
  });

  it('honours a per-business lead time longer than the default', async () => {
    await BusinessPolicy.create({ businessId: ws.businessId, reminderLeadHours: 72 });

    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 48 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(1);
    expect((await Appointment.findById(appointment._id))!.reminderSentAt).toBeInstanceOf(Date);
  });

  it.each<AppointmentStatus>(['cancelled', 'completed', 'no_show', 'in_progress'])(
    'does not remind about a %s appointment',
    async (status) => {
      const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 6, status });

      const counts = await AppointmentReminderService.processDueReminders();

      expect(counts.sent).toBe(0);
      expect((await Appointment.findById(appointment._id))!.reminderSentAt).toBeNull();
    }
  );

  it.each<AppointmentStatus>(['scheduled', 'confirmed', 'rescheduled'])(
    'does remind about a %s appointment',
    async (status) => {
      await makeAppointment(ws.businessId, { hoursFromNow: 6, status });

      const counts = await AppointmentReminderService.processDueReminders();

      expect(counts.sent).toBe(1);
    }
  );

  it('sends nothing when the business has turned reminders off', async () => {
    await BusinessPolicy.create({
      businessId: ws.businessId,
      appointmentRemindersEnabled: false,
    });

    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(0);
    expect((await Appointment.findById(appointment._id))!.reminderSentAt).toBeNull();
  });

  it('does not leak across tenants', async () => {
    const other = await setupWorkspace();
    await BusinessPolicy.create({ businessId: other.businessId, reminderLeadHours: 1 });

    const mine = await makeAppointment(ws.businessId, { hoursFromNow: 6 });
    const theirs = await makeAppointment(other.businessId, { hoursFromNow: 6 });

    await AppointmentReminderService.processDueReminders();

    // Mine is due on the 24h default; theirs is not, on their own 1h setting.
    expect((await Appointment.findById(mine._id))!.reminderSentAt).toBeInstanceOf(Date);
    expect((await Appointment.findById(theirs._id))!.reminderSentAt).toBeNull();

    const logs = await CommunicationLog.find({ type: 'appointment_reminder' });
    expect(logs.every((l) => String(l.businessId) === ws.businessId)).toBe(true);
  });
});

describe('reminder idempotence', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  it('sends once across repeated runs', async () => {
    const { smsCreate, email } = stubTransportsSucceeding();
    await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const first = await AppointmentReminderService.processDueReminders();
    const second = await AppointmentReminderService.processDueReminders();
    const third = await AppointmentReminderService.processDueReminders();

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(third.sent).toBe(0);
    expect(smsCreate).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
    expect(await CommunicationLog.countDocuments({ type: 'appointment_reminder' })).toBe(2);
  });

  /**
   * The claim is a single conditional update, so two replicas ticking at the same
   * second cannot both win it. The distributed job lock makes this rare rather
   * than impossible — a lock can expire mid-run — so the claim has to hold on its
   * own.
   */
  it('sends once even when two runs overlap', async () => {
    const { smsCreate } = stubTransportsSucceeding();
    await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const [a, b] = await Promise.all([
      AppointmentReminderService.processDueReminders(),
      AppointmentReminderService.processDueReminders(),
    ]);

    expect(a.sent + b.sent).toBe(1);
    expect(smsCreate).toHaveBeenCalledTimes(1);
  });

  it('does not re-remind an appointment already stamped', async () => {
    const { smsCreate } = stubTransportsSucceeding();
    await makeAppointment(ws.businessId, {
      hoursFromNow: 6,
      reminderSentAt: new Date(Date.now() - HOUR),
    });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(0);
    expect(smsCreate).not.toHaveBeenCalled();
  });
});

describe('reminder deferral and retry', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
  });

  /**
   * Quiet hours defer; they do not consume the reminder. Nothing is claimed, so
   * the next tick reconsiders it — and because due-ness is
   * `startAt - lead <= now`, a held reminder only becomes more due as the night
   * passes and goes out as soon as the window opens.
   */
  it('defers during quiet hours without claiming or sending', async () => {
    const { smsCreate, email } = stubTransportsSucceeding();
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(true);

    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.deferred).toBe(1);
    expect(counts.sent).toBe(0);
    expect(smsCreate).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();

    const reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.reminderSentAt).toBeNull();
    // Not counted as an attempt either, or a long night would burn the retry cap.
    expect(reloaded!.reminderAttempts).toBe(0);
  });

  it('sends on a later tick once quiet hours end', async () => {
    const { smsCreate } = stubTransportsSucceeding();
    const quiet = vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(true);

    await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    expect((await AppointmentReminderService.processDueReminders()).sent).toBe(0);

    quiet.mockReturnValue(false);

    expect((await AppointmentReminderService.processDueReminders()).sent).toBe(1);
    expect(smsCreate).toHaveBeenCalledTimes(1);
  });

  /**
   * A provider fault releases the claim so the next tick retries. Without this,
   * a single Resend blip would silently cost that customer their reminder.
   */
  it('releases the claim after a transient failure and retries', async () => {
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
    vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue(null);
    const email = vi.spyOn(EmailService, 'send').mockRejectedValue(new Error('provider down'));

    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    const first = await AppointmentReminderService.processDueReminders();
    expect(first.failed).toBe(1);

    let reloaded = await Appointment.findById(appointment._id);
    expect(reloaded!.reminderSentAt).toBeNull();
    expect(reloaded!.reminderAttempts).toBe(1);

    // Provider recovers.
    email.mockResolvedValue({ id: 'resend_1' });

    const second = await AppointmentReminderService.processDueReminders();
    expect(second.sent).toBe(1);
    expect((await Appointment.findById(appointment._id))!.reminderSentAt).toBeInstanceOf(Date);
  });

  it('gives up after the attempt cap rather than retrying every tick', async () => {
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
    vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue(null);
    const email = vi.spyOn(EmailService, 'send').mockRejectedValue(new Error('provider down'));

    const appointment = await makeAppointment(ws.businessId, { hoursFromNow: 6 });

    await AppointmentReminderService.processDueReminders();
    await AppointmentReminderService.processDueReminders();
    await AppointmentReminderService.processDueReminders();

    expect((await Appointment.findById(appointment._id))!.reminderAttempts).toBe(3);

    const callsBefore = email.mock.calls.length;
    const fourth = await AppointmentReminderService.processDueReminders();

    expect(fourth.failed).toBe(0);
    expect(email.mock.calls.length).toBe(callsBefore);
  });

  /**
   * A settled fact about the customer is not a transient failure. Retrying a
   * customer with no phone and no email produces the identical outcome, so the
   * claim stands and the tick stops reconsidering them.
   */
  it('keeps the claim when the customer is simply not contactable', async () => {
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
    stubTransportsSucceeding();

    const customer = await createCustomerRecord(ws.businessId);
    await Customer.findByIdAndUpdate(customer._id, {
      isOptedOut: true,
      $unset: { email: 1 },
    });

    const appointment = await makeAppointment(ws.businessId, {
      hoursFromNow: 6,
      customerId: customer._id,
    });

    const counts = await AppointmentReminderService.processDueReminders();

    expect(counts.sent).toBe(0);
    expect(counts.undeliverable).toBe(1);
    expect(counts.failed).toBe(0);
    expect((await Appointment.findById(appointment._id))!.reminderSentAt).toBeInstanceOf(Date);
  });
});

describe('scheduler registration', () => {
  it('registers appointment_reminders as a runnable job', () => {
    expect(JobScheduler.jobNames()).toContain('appointment_reminders');
  });
});

/**
 * The settings round trip, because this is the exact bug class that has bitten
 * this codebase twice: a field the UI collects, the validation schema does not
 * declare, and Mongoose therefore discards without complaint. `diagnosticFee` and
 * `propertyType` both shipped that way. A setting the owner cannot change is the
 * same as no setting.
 */
describe('reminder settings round trip', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
  });

  it('persists reminderLeadHours posted through the policy endpoint', async () => {
    const res = await asUser(ws.ownerToken)
      .put('/api/policies')
      .send({
        minBookingNoticeHours: 2,
        maxBookingHorizonDays: 30,
        emergencyKeywords: ['gas leak'],
        diagnosticFee: 89,
        emergencyFee: 149,
        reminderLeadHours: 4,
        appointmentRemindersEnabled: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.policy.reminderLeadHours).toBe(4);
    expect(res.body.policy.appointmentRemindersEnabled).toBe(false);

    const stored = await BusinessPolicy.findOne({ businessId: ws.businessId }).lean();
    expect(stored!.reminderLeadHours).toBe(4);
    expect(stored!.appointmentRemindersEnabled).toBe(false);
  });

  it('rejects a lead time outside the supported range', async () => {
    const res = await asUser(ws.ownerToken)
      .put('/api/policies')
      .send({
        minBookingNoticeHours: 2,
        maxBookingHorizonDays: 30,
        emergencyKeywords: ['gas leak'],
        diagnosticFee: 89,
        emergencyFee: 149,
        // Past the 168h ceiling the reminder job's scan window is sized against.
        reminderLeadHours: 500,
      });

    expect(res.status).toBe(400);
  });

  it('a saved lead time actually changes which appointments are reminded', async () => {
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
    stubTransportsSucceeding();

    await asUser(ws.ownerToken)
      .put('/api/policies')
      .send({
        minBookingNoticeHours: 2,
        maxBookingHorizonDays: 30,
        emergencyKeywords: ['gas leak'],
        diagnosticFee: 89,
        emergencyFee: 149,
        reminderLeadHours: 3,
      });

    const outside = await makeAppointment(ws.businessId, { hoursFromNow: 8 });
    const inside = await makeAppointment(ws.businessId, { hoursFromNow: 2 });

    await AppointmentReminderService.processDueReminders();

    expect((await Appointment.findById(inside._id))!.reminderSentAt).toBeInstanceOf(Date);
    // 8h out would have been due on the 24h default; the saved 3h setting is
    // what makes this assertion meaningful.
    expect((await Appointment.findById(outside._id))!.reminderSentAt).toBeNull();
  });
});

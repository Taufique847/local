import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommunicationService } from '../../src/services/communication.service';
import { Customer } from '../../src/models/customer.model';
import { Appointment } from '../../src/models/appointment.model';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { LeadRecovery } from '../../src/models/lead-recovery.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { Service } from '../../src/models/service.model';
import { createWorkspace } from '../helpers/factories';

/**
 * Inbound SMS keyword handling.
 *
 * `YES` used to be an SMS opt-in keyword, and the opt-in branch did not return.
 * So a customer replying "YES" to an appointment reminder had the reply consumed
 * as a marketing opt-in and then fell through to the lead-recovery handler, whose
 * booking-intent regex matches "yes" — which booked them a SECOND appointment for
 * the next morning and texted a confirmation for it.
 *
 * Outbound sends are stubbed: these tests are about what an inbound message
 * causes, not about Twilio.
 */

const AI_LINE = '+15551110000';
const CALLER = '+15557778888';

let sent: Array<{ to: string; body: string }>;

beforeEach(() => {
  sent = [];
  vi.spyOn(CommunicationService, 'sendMessage').mockImplementation(
    async (_businessId: any, input: any) => {
      sent.push({ to: input.to, body: input.body });
      return { _id: 'stubbed' } as any;
    }
  );
});

/** A business with a live AI line, a known customer, and a bookable service. */
const seedBusiness = async () => {
  const shop = await createWorkspace();

  await BusinessPhoneNumber.create({
    businessId: shop.businessId,
    phoneNumber: AI_LINE,
    provider: 'twilio',
    providerSid: 'PNtest0000000000000000000000000001',
    status: 'active',
    isPrimary: true,
  });

  const customer = await Customer.create({
    businessId: shop.businessId,
    firstName: 'Reply',
    lastName: 'Person',
    phone: CALLER,
  });

  await Service.create({
    businessId: shop.businessId,
    name: 'AC Repair',
    category: 'Cooling',
    durationMinutes: 60,
    startingPrice: 200,
    status: 'active',
  });

  return { shop, customer };
};

/** An open recovery campaign — the state that made the fall-through dangerous. */
const seedOpenRecovery = (businessId: string, customerId: any) =>
  LeadRecovery.create({
    businessId,
    customerId,
    callerPhone: CALLER,
    status: 'speed_to_lead_sent',
    currentStep: 1,
    speedToLeadSentAt: new Date(),
  });

const inbound = (body: string) =>
  CommunicationService.handleInboundSms({
    MessageSid: `SM${Math.random().toString(36).slice(2, 12)}`,
    From: CALLER,
    To: AI_LINE,
    Body: body,
  });

/** An appointment already on the books, which is what makes a second one a bug. */
const seedUpcomingAppointment = async (businessId: string, customerId: any) => {
  const service = await Service.findOne({ businessId });
  const startAt = new Date(Date.now() + 26 * 60 * 60 * 1000);
  return Appointment.create({
    businessId,
    customerId,
    serviceId: service!._id,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
    status: 'scheduled',
  });
};

describe('replying YES to a reminder for an existing appointment', () => {
  it('does not create a second appointment', async () => {
    const { shop, customer } = await seedBusiness();
    const existing = await seedUpcomingAppointment(shop.businessId, customer._id);
    await seedOpenRecovery(shop.businessId, customer._id);

    await inbound('YES');

    // The regression: this created a second appointment for tomorrow 10:00 and
    // texted a confirmation for it.
    const all = await Appointment.find({ businessId: shop.businessId });
    expect(all).toHaveLength(1);
    expect(all[0]._id.toString()).toBe(existing._id.toString());
  });

  it('replies by pointing at the appointment they already have', async () => {
    const { shop, customer } = await seedBusiness();
    await seedUpcomingAppointment(shop.businessId, customer._id);
    await seedOpenRecovery(shop.businessId, customer._id);

    const res = await inbound('YES');

    expect(res.reply).toMatch(/already booked/i);
  });

  // The guard is the invariant, not the vocabulary — a keyword list cannot
  // separate "yes, book me" from "yes, I'll be there".
  it.each([['book me tomorrow'], ['sure'], ['morning works'], ['today please']])(
    'applies to "%s" as well, not just YES',
    async (phrase) => {
      const { shop, customer } = await seedBusiness();
      await seedUpcomingAppointment(shop.businessId, customer._id);
      await seedOpenRecovery(shop.businessId, customer._id);

      await inbound(phrase);

      expect(await Appointment.countDocuments({ businessId: shop.businessId })).toBe(1);
    }
  );

  it('does not silently flip the customer’s marketing consent', async () => {
    const { shop, customer } = await seedBusiness();
    await Customer.updateOne({ _id: customer._id }, { $set: { isOptedOut: true } });

    await inbound('YES');

    // YES is not a carrier opt-in keyword, so it must not resubscribe anyone.
    const reloaded = await Customer.findById(customer._id);
    expect((reloaded as any).isOptedOut).toBe(true);
  });

  it('does not append an opt-in note to the customer record', async () => {
    const { shop, customer } = await seedBusiness();

    await inbound('YES');

    const reloaded = await Customer.findById(customer._id);
    expect(reloaded?.notes || '').not.toMatch(/Opt-In/i);
  });

  it('still records the message so the reply is not lost', async () => {
    const { shop } = await seedBusiness();

    await inbound('YES');

    const logged = await CommunicationLog.findOne({
      businessId: shop.businessId,
      direction: 'inbound',
    });
    expect(logged?.body).toBe('YES');
    expect(logged?.status).toBe('received');
  });
});

describe('opt-out keywords', () => {
  it('unsubscribes on STOP and replies', async () => {
    const { customer } = await seedBusiness();

    const res = await inbound('STOP');

    expect((await Customer.findById(customer._id) as any).isOptedOut).toBe(true);
    expect(res.reply).toMatch(/unsubscribed/i);
  });

  it('is case-insensitive', async () => {
    const { customer } = await seedBusiness();

    await inbound('stop');

    expect((await Customer.findById(customer._id) as any).isOptedOut).toBe(true);
  });

  it('does not fall through to booking', async () => {
    const { shop, customer } = await seedBusiness();
    await seedOpenRecovery(shop.businessId, customer._id);

    await inbound('CANCEL');

    expect(await Appointment.countDocuments({ businessId: shop.businessId })).toBe(0);
  });

  it('does not grow the notes field on repeated identical messages', async () => {
    // Notes has a 2000-character cap. This appended on every matching message, so
    // a customer texting STOP enough times would eventually make customer.save()
    // fail validation and take the inbound webhook down with it.
    const { customer } = await seedBusiness();

    for (let i = 0; i < 25; i++) {
      await inbound('STOP');
    }

    const reloaded = await Customer.findById(customer._id);
    const occurrences = (reloaded?.notes || '').match(/Opt-Out/g) || [];
    expect(occurrences).toHaveLength(1);
    expect((reloaded?.notes || '').length).toBeLessThan(200);
  });
});

describe('opt-in keywords', () => {
  it('resubscribes on START and replies', async () => {
    const { customer } = await seedBusiness();
    await Customer.updateOne({ _id: customer._id }, { $set: { isOptedOut: true } });

    const res = await inbound('START');

    expect((await Customer.findById(customer._id) as any).isOptedOut).toBe(false);
    expect(res.reply).toMatch(/subscribed again/i);
  });

  it('accepts UNSTOP as well', async () => {
    const { customer } = await seedBusiness();
    await Customer.updateOne({ _id: customer._id }, { $set: { isOptedOut: true } });

    await inbound('UNSTOP');

    expect((await Customer.findById(customer._id) as any).isOptedOut).toBe(false);
  });

  it('does not fall through to booking', async () => {
    const { shop, customer } = await seedBusiness();
    await seedOpenRecovery(shop.businessId, customer._id);

    await inbound('START');

    // The consent keyword is a complete instruction on its own.
    expect(await Appointment.countDocuments({ businessId: shop.businessId })).toBe(0);
  });
});

describe('a genuine booking reply still works', () => {
  it('books when the customer has no appointment yet', async () => {
    // Guards against a fix that simply disabled the recovery handler.
    const { shop, customer } = await seedBusiness();
    await seedOpenRecovery(shop.businessId, customer._id);

    await inbound('book me tomorrow morning please');

    expect(await Appointment.countDocuments({ businessId: shop.businessId })).toBe(1);
  });

  it('reuses the existing service instead of creating a duplicate each time', async () => {
    /**
     * The recovery path looked up a service with `{ active: true }`, which is not
     * a field on the Service schema — it carries `status`. Mongoose passes an
     * unknown filter key through to MongoDB, so the query matched nothing and a
     * fresh "HVAC Diagnostic & Service Inspection" was created on every booking.
     */
    const { shop, customer } = await seedBusiness();
    const before = await Service.countDocuments({ businessId: shop.businessId });
    expect(before).toBe(1);

    await seedOpenRecovery(shop.businessId, customer._id);
    await inbound('book me tomorrow morning please');

    expect(await Service.countDocuments({ businessId: shop.businessId })).toBe(1);
  });
});

/**
 * The opt-out has to actually persist and actually block sending.
 *
 * `isOptedOut` was not a field on the Customer schema, while two code paths read
 * and wrote it through `as any`. Mongoose is strict by default, so the write was
 * silently dropped on every save and the guard in `sendMessage` read `undefined`.
 * Texting STOP did nothing at all — a TCPA violation, not a cosmetic bug.
 */
describe('opt-out persistence and enforcement', () => {
  it('persists the opt-out through a reload', async () => {
    const { customer } = await seedBusiness();

    await inbound('STOP');

    const reloaded = await Customer.findById(customer._id);
    expect(reloaded?.isOptedOut).toBe(true);
    expect(reloaded?.optedOutAt).toBeTruthy();
  });

  it('clears the audit timestamp on resubscribe', async () => {
    const { customer } = await seedBusiness();

    await inbound('STOP');
    await inbound('START');

    const reloaded = await Customer.findById(customer._id);
    expect(reloaded?.isOptedOut).toBe(false);
    expect(reloaded?.optedOutAt ?? null).toBeNull();
  });

  it('refuses to send to an opted-out customer', async () => {
    const { shop, customer } = await seedBusiness();
    await inbound('STOP');

    // The real sender, not the stub — this is the guard under test.
    vi.restoreAllMocks();

    await expect(
      CommunicationService.sendMessage(shop.businessId, {
        to: CALLER,
        body: 'Your appointment is tomorrow at 10am.',
        customerId: customer._id.toString(),
        type: 'appointment_reminder',
        bypassQuietHours: true,
      } as any)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows sending again after the customer resubscribes', async () => {
    const { shop, customer } = await seedBusiness();
    await inbound('STOP');
    await inbound('START');

    vi.restoreAllMocks();
    // Force the unconfigured-telephony branch so this fails deterministically at
    // the provider rather than making a real Twilio call from a test.
    vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue(null);

    // 503 is the telephony branch, which proves the consent guard was passed.
    // A 409 would mean the opt-out was still blocking the send.
    await expect(
      CommunicationService.sendMessage(shop.businessId, {
        to: CALLER,
        body: 'Welcome back.',
        customerId: customer._id.toString(),
        bypassQuietHours: true,
      } as any)
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('exposes the opt-out state on the customer DTO', async () => {
    // Otherwise an operator composes a message the server will refuse.
    const { shop, customer } = await seedBusiness();
    await inbound('STOP');

    const { CustomerService } = await import('../../src/services/customer.service');
    const dto = await CustomerService.getCustomerById(
      shop.businessId,
      customer._id.toString()
    );

    expect(dto.isOptedOut).toBe(true);
  });
});

describe('unknown inbound messages', () => {
  it('are logged and produce no side effects', async () => {
    const { shop } = await seedBusiness();

    const res = await inbound('what are your hours?');

    expect(res.reply).toBeUndefined();
    expect(await Appointment.countDocuments({ businessId: shop.businessId })).toBe(0);
    expect(
      await CommunicationLog.countDocuments({ businessId: shop.businessId, direction: 'inbound' })
    ).toBe(1);
  });

  it('are ignored entirely when the To number belongs to no business', async () => {
    await seedBusiness();

    const res = await CommunicationService.handleInboundSms({
      MessageSid: 'SMunknownline',
      From: CALLER,
      To: '+19995550000',
      Body: 'STOP',
    });

    expect(res.reply).toBeUndefined();
    expect(await CommunicationLog.countDocuments({})).toBe(0);
  });
});

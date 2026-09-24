import { describe, expect, it } from 'vitest';
import { Appointment } from '../../src/models/appointment.model';
import { Business } from '../../src/models/business.model';
import { BusinessPolicy } from '../../src/models/business-policy.model';
import { Lead } from '../../src/models/lead.model';
import { Service } from '../../src/models/service.model';
import { AppointmentService } from '../../src/services/appointment.service';
import { AvailabilityService } from '../../src/services/availability.service';
import {
  zonedParts,
  zonedWallClockToUtc,
  zonedDayBounds,
  zonedDateKey,
} from '../../src/utils/format';
import {
  createCustomerRecord,
  createServiceRecord,
  createTechnicianRecord,
  createWorkspace,
} from '../helpers/factories';

/**
 * Day 16: the calendar's timezone correctness and per-technician conflicts.
 *
 * Two defects, both of which made the product actively wrong for its intended
 * customer — a US contractor with a crew:
 *
 *  1. `getAvailableSlots` stamped the business's `openTime` onto `Date.UTC(...)`,
 *     while `isWithinBusinessHours` compared the same string in the business's own
 *     timezone. A New York shop open 08:00–18:00 was offered slots covering
 *     03:00–13:00 Eastern, and the booking path rejected most of them with a 409.
 *     The endpoint that offers slots and the service that accepts them disagreed
 *     about what time it was.
 *  2. `checkSlotConflict` never read `technicianId`, so a five-technician business
 *     could hold exactly one job at any instant. Assigning different people to
 *     different addresses made no difference at all.
 */

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const openHours = (openTime: string, closeTime: string, days: string[] = ALL_DAYS) =>
  ALL_DAYS.map((day) => ({
    day,
    isOpen: days.includes(day),
    openTime,
    closeTime,
  }));

/** Sets a real timezone and real trading hours on an otherwise wide-open fixture. */
const configure = (businessId: string, timezone: string, open = '08:00', close = '18:00') =>
  Business.findByIdAndUpdate(businessId, {
    timezone,
    businessHours: openHours(open, close),
  });

/** A date far enough ahead to clear minimum notice, inside the 30-day horizon. */
const dateKeyAhead = (daysAhead: number, timezone: string): string =>
  zonedDateKey(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000), timezone);

describe('zonedWallClockToUtc', () => {
  it('turns a local wall clock into the right instant', async () => {
    // 08:00 on 14 July in New York is EDT, UTC-4, so 12:00Z.
    const instant = zonedWallClockToUtc(2027, 7, 14, 8 * 60, 'America/New_York');
    expect(instant.toISOString()).toBe('2027-07-14T12:00:00.000Z');
  });

  it('accounts for the winter offset on the same clock time', async () => {
    // 08:00 on 14 January is EST, UTC-5, so 13:00Z. A fixed offset would get one of
    // these two wrong, which is why this is not arithmetic on a stored number.
    const instant = zonedWallClockToUtc(2027, 1, 14, 8 * 60, 'America/New_York');
    expect(instant.toISOString()).toBe('2027-01-14T13:00:00.000Z');
  });

  it('handles a zone that does not observe DST', async () => {
    // Phoenix is UTC-7 all year.
    expect(zonedWallClockToUtc(2027, 7, 14, 9 * 60, 'America/Phoenix').toISOString()).toBe(
      '2027-07-14T16:00:00.000Z'
    );
    expect(zonedWallClockToUtc(2027, 1, 14, 9 * 60, 'America/Phoenix').toISOString()).toBe(
      '2027-01-14T16:00:00.000Z'
    );
  });

  it('handles a zone east of Greenwich', async () => {
    expect(zonedWallClockToUtc(2027, 7, 14, 9 * 60, 'Asia/Kolkata').toISOString()).toBe(
      '2027-07-14T03:30:00.000Z'
    );
  });

  it('round-trips through zonedParts for every hour of a normal day', async () => {
    for (let m = 0; m < 24 * 60; m += 15) {
      const instant = zonedWallClockToUtc(2027, 6, 10, m, 'America/Chicago');
      expect(zonedParts(instant, 'America/Chicago')!.minutesOfDay).toBe(m);
    }
  });

  it('resolves a clock time that does not exist to the instant the clock reached', async () => {
    /**
     * US DST begins 14 March 2027: 02:00 becomes 03:00, so 02:30 never happens.
     * There is no correct answer, so the documented one is the instant the clock
     * actually reached — and callers that care verify by reading it back, which is
     * exactly what slot generation does.
     */
    const instant = zonedWallClockToUtc(2027, 3, 14, 2 * 60 + 30, 'America/New_York');
    expect(zonedParts(instant, 'America/New_York')!.minutesOfDay).toBe(3 * 60 + 30);
  });

  it('resolves a clock time that happens twice to the earlier of the two', async () => {
    // US DST ends 7 November 2027: 01:30 occurs in EDT and again in EST.
    const instant = zonedWallClockToUtc(2027, 11, 7, 60 + 30, 'America/New_York');
    expect(instant.toISOString()).toBe('2027-11-07T05:30:00.000Z');
    expect(zonedParts(instant, 'America/New_York')!.minutesOfDay).toBe(60 + 30);
  });
});

describe('zonedDayBounds', () => {
  it('bounds a local day, not a UTC one', async () => {
    const bounds = zonedDayBounds('2027-07-14', 'America/Chicago')!;
    // Midnight to midnight in Chicago (CDT, UTC-5).
    expect(bounds.start.toISOString()).toBe('2027-07-14T05:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2027-07-15T05:00:00.000Z');
  });

  it('gives a 23-hour day when the clocks go forward', async () => {
    const bounds = zonedDayBounds('2027-03-14', 'America/New_York')!;
    const hours = (bounds.end.getTime() - bounds.start.getTime()) / 3_600_000;
    // Adding 24 hours to the start would have overshot into the next day.
    expect(hours).toBe(23);
  });

  it('gives a 25-hour day when the clocks go back', async () => {
    const bounds = zonedDayBounds('2027-11-07', 'America/New_York')!;
    expect((bounds.end.getTime() - bounds.start.getTime()) / 3_600_000).toBe(25);
  });

  it('rolls over correctly at the end of a month', async () => {
    const bounds = zonedDayBounds('2027-01-31', 'America/Chicago')!;
    expect(bounds.end.toISOString()).toBe('2027-02-01T06:00:00.000Z');
  });

  it('rejects a malformed date rather than guessing', async () => {
    expect(zonedDayBounds('not-a-date', 'UTC')).toBeNull();
    expect(zonedDayBounds('2027-13-01', 'UTC')).toBeNull();
  });
});

describe('getAvailableSlots offers slots the business is actually open for', () => {
  it('generates slots in the business timezone, not UTC', async () => {
    /**
     * The regression this file exists for. A New York shop open 08:00 was offered a
     * first slot at 08:00**Z** — 04:00 Eastern — and the booking path then refused it
     * for being before opening time.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/New_York', '08:00', '18:00');
    const service = await createServiceRecord(shop.businessId);

    const date = dateKeyAhead(5, 'America/New_York');
    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      date
    );

    expect(result.timezone).toBe('America/New_York');
    expect(result.slots.length).toBeGreaterThan(0);

    const first = zonedParts(result.slots[0].startAt, 'America/New_York')!;
    expect(first.minutesOfDay).toBe(8 * 60);
    expect(first.hour).not.toBe(8 - 4); // Not the old UTC-stamped 04:00 local.

    // And every slot lands inside the published window in local terms.
    for (const slot of result.slots) {
      const start = zonedParts(slot.startAt, 'America/New_York')!;
      const end = zonedParts(slot.endAt, 'America/New_York')!;
      expect(start.minutesOfDay).toBeGreaterThanOrEqual(8 * 60);
      expect(end.minutesOfDay).toBeLessThanOrEqual(18 * 60);
    }
  });

  it('agrees with isWithinBusinessHours on every slot it offers', async () => {
    /**
     * The real invariant: an offered slot must be bookable. These two functions were
     * the two halves of the same feature and they disagreed, so roughly half of every
     * offered day was a 409 waiting to happen.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Los_Angeles', '07:30', '16:30');
    const service = await createServiceRecord(shop.businessId);

    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      dateKeyAhead(6, 'America/Los_Angeles')
    );

    expect(result.slots.length).toBeGreaterThan(0);

    for (const slot of result.slots) {
      const check = await AvailabilityService.isWithinBusinessHours(
        shop.businessId,
        new Date(slot.startAt),
        new Date(slot.endAt)
      );
      expect(check.ok, `${slot.startAt} was offered but rejected: ${check.reason}`).toBe(true);
    }
  });

  it('reads the weekday in the business timezone', async () => {
    /**
     * A Sunday-closed shop in Kolkata. 00:30 Monday in Kolkata is 19:00 Sunday UTC,
     * so a UTC weekday lookup and a local one disagree near the day boundary.
     */
    const shop = await createWorkspace();
    await Business.findByIdAndUpdate(shop.businessId, {
      timezone: 'Asia/Kolkata',
      businessHours: openHours('09:00', '18:00', ALL_DAYS.filter((d) => d !== 'Sunday')),
    });
    const service = await createServiceRecord(shop.businessId);

    // Find the next Sunday in Kolkata terms.
    let sunday = '';
    for (let i = 1; i <= 8; i += 1) {
      const key = dateKeyAhead(i, 'Asia/Kolkata');
      const parts = zonedParts(zonedWallClockToUtc(...keyParts(key), 12 * 60, 'Asia/Kolkata'), 'Asia/Kolkata')!;
      if (parts.weekday === 'Sunday') {
        sunday = key;
        break;
      }
    }
    expect(sunday).not.toBe('');

    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      sunday
    );

    expect(result.slots).toEqual([]);
  });

  it('skips a clock time the local day does not have', async () => {
    /**
     * A business opening at 02:00 on the US spring-forward day. 02:00 and 02:30 do
     * not exist, and offering them would book the customer an hour later than the
     * time they were shown.
     */
    const shop = await createWorkspace();
    await Business.findByIdAndUpdate(shop.businessId, {
      timezone: 'America/New_York',
      businessHours: openHours('02:00', '08:00'),
    });
    const service = await Service.create({
      businessId: shop.businessId,
      name: 'Early call',
      category: 'Cooling',
      startingPrice: 100,
      durationMinutes: 30,
      status: 'active',
    });

    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      '2027-03-14'
    );

    const localMinutes = result.slots.map((s) => zonedParts(s.startAt, 'America/New_York')!.minutesOfDay);

    // Every slot reads back as the time it claims to be.
    expect(localMinutes).not.toContain(2 * 60);
    expect(localMinutes).not.toContain(2 * 60 + 30);
    expect(localMinutes).toContain(3 * 60);
    expect(new Set(localMinutes).size).toBe(localMinutes.length);
  });

  it('sees an evening job that the old UTC-day window missed', async () => {
    /**
     * For a Chicago business the old window ran 19:00 the previous evening to 19:00,
     * so a job at 20:00 local was outside it and never blocked a slot on its own day.
     * Here the shop closes at 21:00 and has a one-person crew.
     */
    const shop = await createWorkspace();
    // Closing at 22:00 so a 20:00 slot exists at all — the fixture service runs 90
    // minutes, and the loop only emits slots that finish before closing time.
    await configure(shop.businessId, 'America/Chicago', '08:00', '22:00');
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);

    const date = dateKeyAhead(5, 'America/Chicago');
    const [y, m, d] = keyParts(date);
    const eveningStart = zonedWallClockToUtc(y, m, d, 20 * 60, 'America/Chicago');

    await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt: eveningStart,
      endAt: new Date(eveningStart.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      timezone: 'America/Chicago',
      address: '1 Test St',
    });

    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      date
    );

    const eightPm = result.slots.find(
      (s) => zonedParts(s.startAt, 'America/Chicago')!.minutesOfDay === 20 * 60
    );

    expect(eightPm).toBeDefined();
    expect(eightPm!.available).toBe(false);
  });

  it('keeps a slot free while another technician is still unbooked', async () => {
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '08:00', '18:00');
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    const [alpha] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Alpha'),
      createTechnicianRecord(shop.businessId, 'Beta'),
    ]);

    const date = dateKeyAhead(5, 'America/Chicago');
    const [y, m, d] = keyParts(date);
    const tenAm = zonedWallClockToUtc(y, m, d, 10 * 60, 'America/Chicago');

    await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      technicianId: alpha._id,
      technicianName: 'Alpha',
      startAt: tenAm,
      endAt: new Date(tenAm.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      timezone: 'America/Chicago',
      address: '1 Test St',
    });

    const business = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      date
    );
    const slotAtTen = (slots: typeof business.slots) =>
      slots.find((s) => zonedParts(s.startAt, 'America/Chicago')!.minutesOfDay === 10 * 60)!;

    // Two technicians, one booked: still bookable.
    expect(slotAtTen(business.slots).available).toBe(true);

    // Asked about Alpha specifically, it is not.
    const alphaOnly = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      date,
      { technicianId: alpha._id }
    );
    expect(slotAtTen(alphaOnly.slots).available).toBe(false);
  });
});

describe('conflicts are per technician, not per business', () => {
  const bookFor = async (
    shop: { businessId: string },
    technicianId: any,
    startAt: Date,
    serviceId: any,
    customerId: any,
    technicianName?: string
  ) =>
    Appointment.create({
      businessId: shop.businessId,
      customerId,
      serviceId,
      technicianId,
      technicianName,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: 'UTC',
      address: '1 Test St',
    });

  it('lets a three-technician business hold three concurrent jobs', async () => {
    /**
     * The headline defect. `checkSlotConflict` filtered only on `businessId`, so the
     * second concurrent job was refused no matter how many people were free — a
     * scheduling product that could not schedule a crew.
     */
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    const techs = await Promise.all([
      createTechnicianRecord(shop.businessId, 'One'),
      createTechnicianRecord(shop.businessId, 'Two'),
      createTechnicianRecord(shop.businessId, 'Three'),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);

    for (const tech of techs) {
      const conflict = await AvailabilityService.checkSlotConflictDetailed(
        shop.businessId,
        startAt,
        new Date(startAt.getTime() + 60 * 60 * 1000),
        { technicianId: tech._id }
      );
      expect(conflict.conflict).toBe(false);
      await bookFor(shop, tech._id, startAt, service._id, customer._id, tech.name);
    }

    expect(
      await Appointment.countDocuments({ businessId: shop.businessId, startAt })
    ).toBe(3);
  });

  it('still refuses to double-book the same technician, and says who', async () => {
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    const tech = await createTechnicianRecord(shop.businessId, 'Dana Reyes');

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    await bookFor(shop, tech._id, startAt, service._id, customer._id, 'Dana Reyes');

    const conflict = await AvailabilityService.checkSlotConflictDetailed(
      shop.businessId,
      new Date(startAt.getTime() + 30 * 60 * 1000),
      new Date(startAt.getTime() + 90 * 60 * 1000),
      { technicianId: tech._id }
    );

    expect(conflict.conflict).toBe(true);
    // "Already booked" is not actionable; a name tells a dispatcher who to pick instead.
    expect(conflict.reason).toMatch(/Dana Reyes/);
  });

  it('treats back-to-back jobs as two jobs, not a conflict', async () => {
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    const tech = await createTechnicianRecord(shop.businessId, 'Solo');

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    await bookFor(shop, tech._id, startAt, service._id, customer._id, 'Solo');

    const conflict = await AvailabilityService.checkSlotConflictDetailed(
      shop.businessId,
      new Date(startAt.getTime() + 60 * 60 * 1000),
      new Date(startAt.getTime() + 120 * 60 * 1000),
      { technicianId: tech._id }
    );

    expect(conflict.conflict).toBe(false);
  });

  it('caps unassigned jobs at the size of the crew', async () => {
    /**
     * An unassigned job names nobody, so the question is capacity rather than one
     * person's diary. Skipping the check entirely would let a two-person shop accept
     * six overlapping jobs, which is the same broken promise as double-booking one
     * technician.
     */
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    await Promise.all([
      createTechnicianRecord(shop.businessId, 'One'),
      createTechnicianRecord(shop.businessId, 'Two'),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    await bookFor(shop, null, startAt, service._id, customer._id);
    expect(
      (await AvailabilityService.checkSlotConflictDetailed(shop.businessId, startAt, endAt, {}))
        .conflict
    ).toBe(false);

    await bookFor(shop, null, startAt, service._id, customer._id);
    const full = await AvailabilityService.checkSlotConflictDetailed(
      shop.businessId,
      startAt,
      endAt,
      {}
    );
    expect(full.conflict).toBe(true);
    expect(full.reason).toMatch(/All 2 technicians/);
  });

  it('treats a business with no technician records as a crew of one', async () => {
    // The one-person shop the old business-wide behaviour actually suited.
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    await bookFor(shop, null, startAt, service._id, customer._id);

    const conflict = await AvailabilityService.checkSlotConflictDetailed(
      shop.businessId,
      startAt,
      endAt,
      {}
    );
    expect(conflict.conflict).toBe(true);
  });

  it('does not count a deactivated technician towards capacity', async () => {
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    const gone = await createTechnicianRecord(shop.businessId, 'Departed');
    gone.active = false;
    await gone.save();
    await createTechnicianRecord(shop.businessId, 'Present');

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    await bookFor(shop, null, startAt, service._id, customer._id);

    const conflict = await AvailabilityService.checkSlotConflictDetailed(
      shop.businessId,
      startAt,
      endAt,
      {}
    );
    expect(conflict.conflict).toBe(true);
  });

  it('does not count another business’s technicians towards capacity', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const service = await createServiceRecord(alpha.businessId);
    const customer = await createCustomerRecord(alpha.businessId);
    await Promise.all([
      createTechnicianRecord(beta.businessId, 'Beta One'),
      createTechnicianRecord(beta.businessId, 'Beta Two'),
      createTechnicianRecord(beta.businessId, 'Beta Three'),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    await bookFor(alpha, null, startAt, service._id, customer._id);

    const conflict = await AvailabilityService.checkSlotConflictDetailed(
      alpha.businessId,
      startAt,
      endAt,
      {}
    );
    expect(conflict.conflict).toBe(true);
  });

  it('ignores a cancelled job when counting', async () => {
    const shop = await createWorkspace();
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const booked = await bookFor(shop, null, startAt, service._id, customer._id);
    booked.status = 'cancelled';
    await booked.save();

    const conflict = await AvailabilityService.checkSlotConflictDetailed(
      shop.businessId,
      startAt,
      endAt,
      {}
    );
    expect(conflict.conflict).toBe(false);
  });
});

describe('booking a crew through the real create path', () => {
  it('books two technicians into the same hour', async () => {
    /**
     * Through `createAppointment`, so this covers the ordering change as well: the
     * technician is now resolved *before* the conflict check, because "is this person
     * free" cannot be asked before anyone has been named.
     */
    const shop = await createWorkspace();
    const [service, customer, alpha, beta] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
      createTechnicianRecord(shop.businessId, 'Alpha'),
      createTechnicianRecord(shop.businessId, 'Beta'),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);

    const base = {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      startAt: startAt.toISOString(),
    };

    const first = await AppointmentService.createAppointment(shop.businessId, {
      ...base,
      technicianId: alpha._id.toString(),
    } as any);

    const second = await AppointmentService.createAppointment(shop.businessId, {
      ...base,
      technicianId: beta._id.toString(),
    } as any);

    expect(first.technicianId!.toString()).toBe(alpha._id.toString());
    expect(second.technicianId!.toString()).toBe(beta._id.toString());
    expect(second.startAt.getTime()).toBe(first.startAt.getTime());
  });

  it('refuses to book the same technician twice and names them', async () => {
    const shop = await createWorkspace();
    const [service, customer, alpha] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
      createTechnicianRecord(shop.businessId, 'Alpha Smith'),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);

    const base = {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      startAt: startAt.toISOString(),
      technicianId: alpha._id.toString(),
    };

    await AppointmentService.createAppointment(shop.businessId, base as any);

    await expect(
      AppointmentService.createAppointment(shop.businessId, base as any)
    ).rejects.toThrow(/Alpha Smith/);
  });

  it('still refuses a second job for a one-person shop', async () => {
    const shop = await createWorkspace();
    const [service, customer] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);

    const base = {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      startAt: startAt.toISOString(),
    };

    await AppointmentService.createAppointment(shop.businessId, base as any);

    await expect(
      AppointmentService.createAppointment(shop.businessId, base as any)
    ).rejects.toThrow(/already booked/i);
  });

  it('holds the lock invariant: five parallel bookings for one technician yield one job', async () => {
    /**
     * The existing concurrency guarantee, re-asserted because the conflict check it
     * protects has changed shape. The lock is per business and the check inside it is
     * now per technician, so this confirms the pair still serialise.
     */
    const shop = await createWorkspace();
    const [service, customer, alpha] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
      createTechnicianRecord(shop.businessId, 'Alpha'),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);

    const attempts = Array.from({ length: 5 }, () =>
      AppointmentService.createAppointment(shop.businessId, {
        customerId: customer._id.toString(),
        serviceId: service._id.toString(),
        startAt: startAt.toISOString(),
        technicianId: alpha._id.toString(),
      } as any).then(
        () => 'ok' as const,
        () => 'rejected' as const
      )
    );

    const results = await Promise.all(attempts);

    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(
      await Appointment.countDocuments({ businessId: shop.businessId, technicianId: alpha._id })
    ).toBe(1);
  });
});

describe('a day means a day where the business is', () => {
  it('lists an evening job on its own local day, not the next one', async () => {
    /**
     * The `date` filter built a UTC midnight-to-midnight window, which for a Chicago
     * business runs 19:00 the previous evening to 19:00. A 20:00 local job therefore
     * appeared on the *next* day's schedule — on the page a dispatcher uses to see
     * what is happening today.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '00:00', '23:59');
    const [service, customer] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
    ]);

    const date = dateKeyAhead(5, 'America/Chicago');
    const [y, m, d] = keyParts(date);
    const eveningStart = zonedWallClockToUtc(y, m, d, 20 * 60, 'America/Chicago');

    await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt: eveningStart,
      endAt: new Date(eveningStart.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: 'America/Chicago',
      address: '1 Test St',
    });

    // The local day it belongs to.
    const onItsDay = await AppointmentService.getAppointments(shop.businessId, { date });
    expect(onItsDay.total).toBe(1);

    // And not the following one, which the UTC window put it on.
    const nextKey = zonedDateKey(
      new Date(eveningStart.getTime() + 24 * 60 * 60 * 1000),
      'America/Chicago'
    );
    const onTheNextDay = await AppointmentService.getAppointments(shop.businessId, {
      date: nextKey,
    });
    expect(onTheNextDay.total).toBe(0);
  });

  it('includes a job at exactly local midnight in the day it starts, once', async () => {
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '00:00', '23:59');
    const [service, customer] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
    ]);

    const date = dateKeyAhead(5, 'America/Chicago');
    const [y, m, d] = keyParts(date);
    const midnight = zonedWallClockToUtc(y, m, d, 0, 'America/Chicago');

    await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt: midnight,
      endAt: new Date(midnight.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: 'America/Chicago',
      address: '1 Test St',
    });

    const previousKey = zonedDateKey(
      new Date(midnight.getTime() - 24 * 60 * 60 * 1000),
      'America/Chicago'
    );

    expect((await AppointmentService.getAppointments(shop.businessId, { date })).total).toBe(1);
    // Half-open window, so it does not also show on the day that ends there.
    expect(
      (await AppointmentService.getAppointments(shop.businessId, { date: previousKey })).total
    ).toBe(0);
  });
});

/** `'2027-07-14'` → `[2027, 7, 14]`. */
function keyParts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

describe('zonedDateKey', () => {
  it('zero-pads the month and day', async () => {
    /**
     * `2027-1-5` is not a date key. It happens to survive `split('-').map(Number)`,
     * which is why nothing noticed, but it does not sort, does not compare and does
     * not match what the frontend sends.
     */
    const january5 = zonedWallClockToUtc(2027, 1, 5, 12 * 60, 'America/Chicago');
    expect(zonedDateKey(january5, 'America/Chicago')).toBe('2027-01-05');
  });

  it('reports the local date, not the UTC one', async () => {
    // 01:00 UTC on 5 January is still 19:00 on the 4th in Chicago.
    expect(zonedDateKey('2027-01-05T01:00:00.000Z', 'America/Chicago')).toBe('2027-01-04');
  });
});

describe('the weekday is the business’s weekday', () => {
  it('reads Sunday in a zone where local Sunday is UTC Saturday', async () => {
    /**
     * Kiritimati is UTC+14, so local Sunday noon is Saturday 22:00 UTC. A shop closed
     * on Sundays would be offered a full day of slots by any lookup that asks UTC what
     * day it is — and the booking path, which asks the business's zone, would refuse
     * every one of them.
     */
    const shop = await createWorkspace();
    await Business.findByIdAndUpdate(shop.businessId, {
      timezone: 'Pacific/Kiritimati',
      businessHours: openHours('09:00', '18:00', ALL_DAYS.filter((d) => d !== 'Sunday')),
    });
    const service = await createServiceRecord(shop.businessId);

    // 2027-01-03 is a Sunday.
    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      '2027-01-03'
    );

    expect(result.slots).toEqual([]);

    // And the Monday after is open, so this is not just rejecting everything.
    const monday = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      '2027-01-04'
    );
    expect(monday.slots.length).toBeGreaterThan(0);
  });
});

describe('a one-person shop can still book its own calendar', () => {
  it('offers available slots to a business with no technician records', async () => {
    /**
     * The failure mode this guards is total: if a crewless business resolves to a
     * capacity of zero, `overlapping < capacity` is false for every slot and the entire
     * calendar reads as fully booked with nothing on it. Most accounts have no
     * technician records at all, so this is the default experience.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '08:00', '18:00');
    const service = await createServiceRecord(shop.businessId);

    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      dateKeyAhead(5, 'America/Chicago')
    );

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.every((s) => s.available)).toBe(true);
  });

  it('offers available slots to a technician who has nothing booked', async () => {
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '08:00', '18:00');
    const service = await createServiceRecord(shop.businessId);
    const tech = await createTechnicianRecord(shop.businessId, 'Solo');

    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      dateKeyAhead(5, 'America/Chicago'),
      { technicianId: tech._id }
    );

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.every((s) => s.available)).toBe(true);
  });
});

describe('slots in the past are never offered', () => {
  it('marks every slot on a past day unavailable', async () => {
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '08:00', '18:00');
    const service = await createServiceRecord(shop.businessId);

    const yesterday = dateKeyAhead(-1, 'America/Chicago');
    const result = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      yesterday
    );

    // Still returned, so the UI can render a greyed-out day rather than an empty one.
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.every((s) => s.available === false)).toBe(true);
  });
});

describe('technician-scoped availability asks only about that technician', () => {
  it('offers a slot to a free technician while a colleague is booked', async () => {
    /**
     * The narrower version of the crew defect. Asking "is Alpha free at 10?" must not
     * be answered by looking at Beta's diary — which is what dropping the technician
     * filter from the appointment fetch does, because the capacity for a named person
     * is one.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '08:00', '18:00');
    const service = await createServiceRecord(shop.businessId);
    const customer = await createCustomerRecord(shop.businessId);
    const [alpha, beta] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Alpha'),
      createTechnicianRecord(shop.businessId, 'Beta'),
    ]);

    const date = dateKeyAhead(5, 'America/Chicago');
    const [y, m, d] = keyParts(date);
    const tenAm = zonedWallClockToUtc(y, m, d, 10 * 60, 'America/Chicago');

    await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      technicianId: beta._id,
      technicianName: 'Beta',
      startAt: tenAm,
      endAt: new Date(tenAm.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      timezone: 'America/Chicago',
      address: '1 Test St',
    });

    const alphaSlots = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      date,
      { technicianId: alpha._id }
    );

    const slotAtTen = alphaSlots.slots.find(
      (s) => zonedParts(s.startAt, 'America/Chicago')!.minutesOfDay === 10 * 60
    )!;

    expect(slotAtTen.available).toBe(true);

    // Beta, asked about directly, is not free.
    const betaSlots = await AvailabilityService.getAvailableSlots(
      shop.businessId,
      service._id.toString(),
      date,
      { technicianId: beta._id }
    );
    expect(
      betaSlots.slots.find(
        (s) => zonedParts(s.startAt, 'America/Chicago')!.minutesOfDay === 10 * 60
      )!.available
    ).toBe(false);
  });
});

describe('conflict checking stays inside one business', () => {
  it('lets two businesses book the same instant', async () => {
    /**
     * `businessId` on the overlap filter. Without it one contractor's fully booked
     * afternoon would block an unrelated company's — the most visible possible form of
     * tenant leakage, and one a customer would report as "the system says we're busy
     * when we're not".
     */
    const alpha = await createWorkspace();
    const beta = await createWorkspace();

    const [alphaService, alphaCustomer, betaService, betaCustomer] = await Promise.all([
      createServiceRecord(alpha.businessId),
      createCustomerRecord(alpha.businessId),
      createServiceRecord(beta.businessId),
      createCustomerRecord(beta.businessId),
    ]);

    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(12, 0, 0, 0);

    await AppointmentService.createAppointment(alpha.businessId, {
      customerId: alphaCustomer._id.toString(),
      serviceId: alphaService._id.toString(),
      startAt: startAt.toISOString(),
    } as any);

    const theirs = await AppointmentService.createAppointment(beta.businessId, {
      customerId: betaCustomer._id.toString(),
      serviceId: betaService._id.toString(),
      startAt: startAt.toISOString(),
    } as any);

    expect(theirs.startAt.getTime()).toBe(startAt.getTime());
  });
});

describe('rescheduling', () => {
  const seedAssignedJob = async (
    businessId: string,
    technicianId: any,
    startAt: Date,
    technicianName?: string
  ) => {
    const [service, customer] = await Promise.all([
      createServiceRecord(businessId),
      createCustomerRecord(businessId),
    ]);

    return Appointment.create({
      businessId,
      customerId: customer._id,
      serviceId: service._id,
      technicianId,
      technicianName,
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      timezone: 'UTC',
      address: '1 Test St',
    });
  };

  const inFiveDaysAt = (hour: number): Date => {
    const d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };

  it('does not treat an appointment as conflicting with itself', async () => {
    /**
     * A nudge of 30 minutes overlaps the job's own current window, so without
     * `excludeAppointmentId` every small adjustment is refused — which is precisely
     * what calendar drag-and-drop does most of the time.
     */
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Solo');
    const job = await seedAssignedJob(shop.businessId, tech._id, inFiveDaysAt(12), 'Solo');

    const moved = await AppointmentService.rescheduleAppointment(
      shop.businessId,
      job._id.toString(),
      { startAt: new Date(job.startAt.getTime() + 30 * 60 * 1000).toISOString() } as any
    );

    expect(moved.startAt.getTime()).toBe(job.startAt.getTime() + 30 * 60 * 1000);
  });

  it('allows a move into an hour a colleague is working', async () => {
    // Business-wide conflict checking refused this, which is the crew defect showing
    // up on the reschedule path rather than the create path.
    const shop = await createWorkspace();
    const [alpha, beta] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Alpha'),
      createTechnicianRecord(shop.businessId, 'Beta'),
    ]);

    const busyHour = inFiveDaysAt(12);
    await seedAssignedJob(shop.businessId, beta._id, busyHour, 'Beta');
    const alphaJob = await seedAssignedJob(shop.businessId, alpha._id, inFiveDaysAt(16), 'Alpha');

    const moved = await AppointmentService.rescheduleAppointment(
      shop.businessId,
      alphaJob._id.toString(),
      { startAt: busyHour.toISOString() } as any
    );

    expect(moved.startAt.getTime()).toBe(busyHour.getTime());
  });

  it('refuses a move onto the assigned technician’s own job', async () => {
    const shop = await createWorkspace();
    const alpha = await createTechnicianRecord(shop.businessId, 'Alpha Jones');

    const busyHour = inFiveDaysAt(12);
    await seedAssignedJob(shop.businessId, alpha._id, busyHour, 'Alpha Jones');
    const other = await seedAssignedJob(shop.businessId, alpha._id, inFiveDaysAt(16), 'Alpha Jones');

    await expect(
      AppointmentService.rescheduleAppointment(shop.businessId, other._id.toString(), {
        startAt: busyHour.toISOString(),
      } as any)
    ).rejects.toThrow(/Alpha Jones/);
  });

  it('refuses a move beyond the booking horizon', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Solo');
    const job = await seedAssignedJob(shop.businessId, tech._id, inFiveDaysAt(12), 'Solo');

    const farOut = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    farOut.setUTCHours(12, 0, 0, 0);

    await expect(
      AppointmentService.rescheduleAppointment(shop.businessId, job._id.toString(), {
        startAt: farOut.toISOString(),
      } as any)
    ).rejects.toThrow(/days in advance/i);
  });

  it('does not enforce minimum notice, which creating does', async () => {
    /**
     * The asymmetry, asserted so it stays deliberate. Notice protects the business from
     * a job it has no time to prepare for; an owner moving work already on the books is
     * not that, and a customer asking to be seen sooner is usually what everyone wants.
     */
    const shop = await createWorkspace();
    await BusinessPolicy.findOneAndUpdate(
      { businessId: shop.businessId },
      { $set: { minBookingNoticeHours: 72 } },
      { upsert: true, new: true }
    );

    const tech = await createTechnicianRecord(shop.businessId, 'Solo');
    const job = await seedAssignedJob(shop.businessId, tech._id, inFiveDaysAt(12), 'Solo');

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const moved = await AppointmentService.rescheduleAppointment(
      shop.businessId,
      job._id.toString(),
      { startAt: tomorrow.toISOString() } as any
    );

    expect(moved.startAt.getTime()).toBe(tomorrow.getTime());
  });
});

describe('today’s appointments mean today where the business is', () => {
  it('includes an evening job and excludes one from the next local day', async () => {
    /**
     * `getTodayAppointments` built its window from `now.getUTCDate()`, so for any
     * business west of Greenwich the evening's own jobs were already filed under
     * tomorrow — on the endpoint the dashboard calls to say what is happening today.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '00:00', '23:59');
    const [service, customer] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
    ]);

    const todayKey = zonedDateKey(new Date(), 'America/Chicago');
    const [y, m, d] = keyParts(todayKey);

    const atLocal = (minutes: number, dayOffset = 0) =>
      zonedWallClockToUtc(y, m, d + dayOffset, minutes, 'America/Chicago');

    const make = (startAt: Date) =>
      Appointment.create({
        businessId: shop.businessId,
        customerId: customer._id,
        serviceId: service._id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status: 'scheduled',
        timezone: 'America/Chicago',
        address: '1 Test St',
      });

    // 23:30 tonight, and 00:30 tomorrow. A UTC window puts the first on tomorrow.
    const tonight = await make(atLocal(23 * 60 + 30));
    await make(atLocal(30, 1));

    const today = await AppointmentService.getTodayAppointments(shop.businessId);
    const ids = today.map((a) => a._id.toString());

    expect(ids).toContain(tonight._id.toString());
    expect(today).toHaveLength(1);
  });
});

describe('the lead timeline records the business’s time, not the server’s', () => {
  it('writes the appointment time in the business timezone', async () => {
    /**
     * `startAt.toLocaleString()` with no zone rendered this in whatever zone the server
     * runs in. On a UTC host a 14:00 Chicago job was recorded on the lead's own
     * timeline as 19:00 — the note a salesperson reads back to the customer.
     */
    const shop = await createWorkspace();
    await configure(shop.businessId, 'America/Chicago', '00:00', '23:59');
    const [service, customer] = await Promise.all([
      createServiceRecord(shop.businessId),
      createCustomerRecord(shop.businessId),
    ]);

    const lead = await Lead.create({
      businessId: shop.businessId,
      customerId: customer._id,
      title: 'Needs a new condenser',
      status: 'new',
    });

    const date = dateKeyAhead(5, 'America/Chicago');
    const [y, m, d] = keyParts(date);
    const twoPm = zonedWallClockToUtc(y, m, d, 14 * 60, 'America/Chicago');

    await AppointmentService.createAppointment(shop.businessId, {
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      leadId: lead._id.toString(),
      startAt: twoPm.toISOString(),
    } as any);

    const updated = await Lead.findById(lead._id).lean();
    const note = updated!.activities.find((a: any) => a.type === 'appointment_scheduled')!;

    expect(note.description).toMatch(/2:00\s*PM/);
    // And it names the zone, because "2:00 PM" without one is what customers call about.
    expect(note.description).toMatch(/C[SD]T/);
  });
});

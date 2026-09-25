import { describe, expect, it } from 'vitest';
import { Appointment } from '../../src/models/appointment.model';
import { Business } from '../../src/models/business.model';
import { Lead } from '../../src/models/lead.model';
import { AppointmentService } from '../../src/services/appointment.service';
import { RecurrenceService } from '../../src/services/recurrence.service';
import { zonedParts, zonedWallClockToUtc, zonedDateKey } from '../../src/utils/format';
import { asUser } from '../helpers/agent';
import {
  createCustomerRecord,
  createServiceRecord,
  createTechnicianRecord,
  createWorkspace,
  type Workspace,
} from '../helpers/factories';

/**
 * Day 19: recurring appointments — the maintenance plan every home-services business
 * sells, and the last missing piece of #14.
 *
 * Occurrences are real appointments rather than computed on read, because a technician is
 * assigned to a specific visit and that visit gets rescheduled, invoiced and photographed.
 * The cost of that decision is materialisation, which is what the horizon, the
 * `recurrenceGeneratedThrough` watermark and the top-up job exist to manage.
 */

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const openAllHours = (businessId: string, timezone: string) =>
  Business.findByIdAndUpdate(businessId, {
    timezone,
    businessHours: ALL_DAYS.map((day) => ({
      day,
      isOpen: true,
      openTime: '00:00',
      closeTime: '23:59',
    })),
  });

/** A local wall-clock instant N days ahead, in the given zone. */
const localAhead = (daysAhead: number, minutesOfDay: number, timezone: string): Date => {
  const key = zonedDateKey(new Date(Date.now() + daysAhead * 86_400_000), timezone);
  const [y, m, d] = key.split('-').map(Number);
  return zonedWallClockToUtc(y, m, d, minutesOfDay, timezone);
};

const seedWorkspace = async (timezone = 'America/Chicago') => {
  const shop = await createWorkspace({ timezone });
  await openAllHours(shop.businessId, timezone);
  const [service, customer] = await Promise.all([
    createServiceRecord(shop.businessId),
    createCustomerRecord(shop.businessId),
  ]);
  return { shop, service, customer, timezone };
};

const bookSeries = async (
  ctx: Awaited<ReturnType<typeof seedWorkspace>>,
  recurrence: any,
  options: { daysAhead?: number; minutesOfDay?: number; technicianId?: any } = {}
) =>
  AppointmentService.createAppointment(ctx.shop.businessId, {
    customerId: ctx.customer._id.toString(),
    serviceId: ctx.service._id.toString(),
    startAt: localAhead(
      options.daysAhead ?? 3,
      options.minutesOfDay ?? 9 * 60,
      ctx.timezone
    ).toISOString(),
    ...(options.technicianId ? { technicianId: options.technicianId.toString() } : {}),
    recurrence,
  } as any);

const occurrencesOf = (businessId: string, parentId: any) =>
  Appointment.find({ businessId, recurrenceParentId: parentId }).sort({ startAt: 1 });

describe('RecurrenceService.occurrenceAt', () => {
  it('keeps a weekly series at the same local time across a DST transition', async () => {
    /**
     * The reason each occurrence is derived from index 0 rather than by adding to the
     * previous one. US DST begins 14 March 2027; a 09:00 visit on the 7th must still be
     * 09:00 on the 21st, and repeated millisecond addition would make it 08:00 and keep it
     * there for the rest of the year.
     */
    const first = zonedWallClockToUtc(2027, 3, 7, 9 * 60, 'America/New_York');
    const rule = { frequency: 'weekly' as const, interval: 1 };

    for (let index = 0; index <= 4; index += 1) {
      const at = RecurrenceService.occurrenceAt(first, rule, index, 'America/New_York')!;
      expect(zonedParts(at, 'America/New_York')!.minutesOfDay).toBe(9 * 60);
    }

    // And the instants really do cross the transition: 14:00Z before, 13:00Z after.
    expect(
      RecurrenceService.occurrenceAt(first, rule, 0, 'America/New_York')!.toISOString()
    ).toBe('2027-03-07T14:00:00.000Z');
    expect(
      RecurrenceService.occurrenceAt(first, rule, 2, 'America/New_York')!.toISOString()
    ).toBe('2027-03-21T13:00:00.000Z');
  });

  it('steps a fortnightly series by 14 calendar days', async () => {
    const first = zonedWallClockToUtc(2027, 6, 1, 8 * 60, 'America/Chicago');
    const at = RecurrenceService.occurrenceAt(
      first,
      { frequency: 'weekly', interval: 2 },
      3,
      'America/Chicago'
    )!;
    // 1 June + 6 weeks.
    expect(zonedDateKey(at, 'America/Chicago')).toBe('2027-07-13');
  });

  it('keeps a monthly series on the same day of the month, at the same time', async () => {
    const first = zonedWallClockToUtc(2027, 1, 15, 10 * 60, 'America/Chicago');
    const rule = { frequency: 'monthly' as const, interval: 1 };

    expect(
      zonedDateKey(RecurrenceService.occurrenceAt(first, rule, 1, 'America/Chicago')!, 'America/Chicago')
    ).toBe('2027-02-15');
    expect(
      zonedDateKey(RecurrenceService.occurrenceAt(first, rule, 11, 'America/Chicago')!, 'America/Chicago')
    ).toBe('2027-12-15');

    /**
     * The time of day, not only the date.
     *
     * Asserting the date alone left the whole clock time untested — a monthly plan could
     * have put every visit at midnight and nothing would have noticed. January is CST and
     * July is CDT, so this also covers the offset changing underneath a monthly series.
     */
    for (const index of [0, 1, 6, 11]) {
      const at = RecurrenceService.occurrenceAt(first, rule, index, 'America/Chicago')!;
      expect(zonedParts(at, 'America/Chicago')!.minutesOfDay).toBe(10 * 60);
    }
  });

  it('expresses quarterly as monthly every three', async () => {
    // Why there is no `quarterly` frequency: it would be a third spelling of this.
    const first = zonedWallClockToUtc(2027, 1, 10, 13 * 60, 'America/Chicago');
    const at = RecurrenceService.occurrenceAt(
      first,
      { frequency: 'monthly', interval: 3 },
      2,
      'America/Chicago'
    )!;
    expect(zonedDateKey(at, 'America/Chicago')).toBe('2027-07-10');
  });

  it('skips a month that does not have the date rather than clamping it', async () => {
    /**
     * A plan set for the 31st. Clamping to the 30th looks friendlier and silently varies
     * the interval between visits — April on the 30th, February on the 28th — so a customer
     * told "the 31st of every month" is visited on four different dates. Skipping keeps the
     * promise the plan made.
     */
    const first = zonedWallClockToUtc(2027, 1, 31, 9 * 60, 'America/Chicago');
    const rule = { frequency: 'monthly' as const, interval: 1 };

    // February and April have no 31st.
    expect(RecurrenceService.occurrenceAt(first, rule, 1, 'America/Chicago')).toBeNull();
    expect(RecurrenceService.occurrenceAt(first, rule, 3, 'America/Chicago')).toBeNull();
    // March does.
    expect(
      zonedDateKey(RecurrenceService.occurrenceAt(first, rule, 2, 'America/Chicago')!, 'America/Chicago')
    ).toBe('2027-03-31');
  });

  it('handles a 29 February in a leap year and skips it otherwise', async () => {
    const rule = { frequency: 'monthly' as const, interval: 12 };
    // 2028 is a leap year; 2029 is not.
    const first = zonedWallClockToUtc(2028, 2, 29, 9 * 60, 'America/Chicago');

    expect(
      zonedDateKey(RecurrenceService.occurrenceAt(first, rule, 0, 'America/Chicago')!, 'America/Chicago')
    ).toBe('2028-02-29');
    expect(RecurrenceService.occurrenceAt(first, rule, 1, 'America/Chicago')).toBeNull();
    expect(
      zonedDateKey(RecurrenceService.occurrenceAt(first, rule, 4, 'America/Chicago')!, 'America/Chicago')
    ).toBe('2032-02-29');
  });
});

describe('RecurrenceService.normaliseRule', () => {
  it('refuses a series with no end', async () => {
    /**
     * An unbounded series cannot be materialised in full by definition, so accepting one
     * would mean the plan exists only as far as the last top-up ran. A contractor who
     * disabled the scheduler would find their maintenance calendar stopping on a date
     * nothing chose. Making the end explicit means the calendar shows the whole commitment.
     */
    expect(() =>
      RecurrenceService.normaliseRule({ frequency: 'weekly', interval: 1 } as any)
    ).toThrow(/needs an end/i);
  });

  it('refuses both a count and an until', async () => {
    // Two ends that can disagree is worse than no end at all.
    expect(() =>
      RecurrenceService.normaliseRule({
        frequency: 'weekly',
        interval: 1,
        count: 10,
        until: new Date(),
      } as any)
    ).toThrow(/not both/i);
  });

  it('refuses a single-visit series', async () => {
    // A "repeating" appointment that happens once is just an appointment.
    expect(() =>
      RecurrenceService.normaliseRule({ frequency: 'weekly', interval: 1, count: 1 } as any)
    ).toThrow(/between 2 and 260/i);
  });

  it('refuses an interval below one', async () => {
    expect(() =>
      RecurrenceService.normaliseRule({ frequency: 'weekly', interval: 0, count: 5 } as any)
    ).toThrow(/between 1 and 52/i);
  });

  it('refuses an unrecognised frequency', async () => {
    expect(() =>
      RecurrenceService.normaliseRule({ frequency: 'daily', interval: 1, count: 5 } as any)
    ).toThrow(/weekly.*monthly/i);
  });

  it('refuses an unparseable until date', async () => {
    expect(() =>
      RecurrenceService.normaliseRule({
        frequency: 'weekly',
        interval: 1,
        until: 'someday',
      } as any)
    ).toThrow(/not a valid date/i);
  });

  it('drops the unused end so only one is ever stored', async () => {
    const byCount = RecurrenceService.normaliseRule({
      frequency: 'monthly',
      interval: 3,
      count: 4,
    } as any);
    expect(byCount.until).toBeUndefined();
    expect(byCount).toEqual({ frequency: 'monthly', interval: 3, count: 4 });
  });
});

describe('booking a series through the real create path', () => {
  it('creates the parent and its occurrences', async () => {
    const ctx = await seedWorkspace();

    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });

    expect(parent.recurrenceRule?.count).toBe(4);
    expect(parent.recurrenceParentId).toBeNull();

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(children).toHaveLength(3);

    // Each a week after the last, at the same local time.
    const expectedMinutes = zonedParts(parent.startAt, ctx.timezone)!.minutesOfDay;
    children.forEach((child, i) => {
      expect(zonedParts(child.startAt, ctx.timezone)!.minutesOfDay).toBe(expectedMinutes);
      expect(child.recurrenceParentId!.toString()).toBe(parent._id.toString());
      expect(child.startAt.getTime()).toBeGreaterThan(
        i === 0 ? parent.startAt.getTime() : children[i - 1].startAt.getTime()
      );
    });
  });

  it('stores the rule on the parent only', async () => {
    /**
     * One home for the rule. Copying it onto every occurrence would mean a change to the
     * plan had to be written to every row, and a partial write would leave two occurrences
     * of one series disagreeing about what the series is.
     */
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 3 });

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(children).toHaveLength(2);
    children.forEach((child) => expect(child.recurrenceRule).toBeNull());
  });

  it('copies the assignment onto every occurrence', async () => {
    const ctx = await seedWorkspace();
    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Dana Reyes');

    const parent = await bookSeries(
      ctx,
      { frequency: 'weekly', interval: 1, count: 3 },
      { technicianId: tech._id }
    );

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(children).toHaveLength(2);
    children.forEach((child) => {
      expect(child.technicianId!.toString()).toBe(tech._id.toString());
      expect(child.technicianName).toBe('Dana Reyes');
    });
  });

  it('does not point every occurrence at the lead', async () => {
    /**
     * A lead is converted once. Pointing every visit at it would re-fire lead activity on
     * each one, so a year of quarterly visits would look like four separate conversions in
     * the pipeline.
     *
     * The series has to actually *have* a lead for this to mean anything — asserting
     * `leadId: null` on a parent that never had one passes whether the field is copied or
     * not, which is how this test first went green without testing anything.
     */
    const ctx = await seedWorkspace();
    const lead = await Lead.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      title: 'Wants a maintenance plan',
      status: 'new',
    });

    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      leadId: lead._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
      recurrence: { frequency: 'weekly', interval: 1, count: 3 },
    } as any);

    // `createAppointment` returns the document with `leadId` populated.
    expect((parent.leadId as any)._id.toString()).toBe(lead._id.toString());

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(children).toHaveLength(2);
    children.forEach((child) => expect(child.leadId).toBeNull());

    // And the lead records one conversion, not three.
    const reloaded = await Lead.findById(lead._id).lean();
    expect(
      reloaded!.activities.filter((a: any) => a.type === 'appointment_scheduled')
    ).toHaveLength(1);
  });

  it('stops at the until date and marks the series complete', async () => {
    const ctx = await seedWorkspace();
    const until = localAhead(3 + 14, 9 * 60, ctx.timezone);

    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, until });

    // Day 3, 10 and 17 — the 24th is past `until`.
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(children).toHaveLength(2);
    children.forEach((child) =>
      expect(child.startAt.getTime()).toBeLessThanOrEqual(until.getTime())
    );

    /**
     * Completion, for the `until` branch as well as the `count` one. Both are ways a plan
     * can end and both have to be recorded, or the top-up job keeps taking the booking lock
     * for a plan that finished months ago.
     */
    const stored = await Appointment.findById(parent._id);
    expect(stored!.recurrenceCompletedAt).toBeTruthy();
    expect((await RecurrenceService.topUpSeries()).examined).toBe(0);
  });

  it('marks a count-bounded series complete once its visits exist', async () => {
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });

    const stored = await Appointment.findById(parent._id);
    expect(stored!.recurrenceCompletedAt).toBeTruthy();
  });

  it('does not mark a series complete when it merely hit the horizon', async () => {
    // Stopping because the plan ended is final; stopping because 120 days is as far as we
    // look is not, and confusing the two would truncate every long plan permanently.
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 200 });

    const stored = await Appointment.findById(parent._id);
    expect(stored!.recurrenceCompletedAt).toBeNull();
  });

  it('stops at the horizon and records how far it got', async () => {
    /**
     * A long plan is materialised to the horizon rather than in full — writing three years
     * of weekly visits eagerly buries the calendar in work nobody has committed to. The
     * watermark is what lets the top-up job resume without re-deriving what already exists.
     */
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 200 });

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    const horizon = Date.now() + RecurrenceService.HORIZON_DAYS * 86_400_000;

    expect(children.length).toBeGreaterThan(10);
    expect(children.length).toBeLessThan(200);
    children.forEach((child) => expect(child.startAt.getTime()).toBeLessThanOrEqual(horizon));

    const stored = await Appointment.findById(parent._id);
    expect(stored!.recurrenceGeneratedThrough).toBeTruthy();
    expect(stored!.recurrenceGeneratedThrough!.getTime()).toBe(
      children[children.length - 1].startAt.getTime()
    );
  });

  it('refuses a malformed rule before writing anything', async () => {
    const ctx = await seedWorkspace();

    await expect(
      bookSeries(ctx, { frequency: 'weekly', interval: 1 })
    ).rejects.toThrow(/needs an end/i);

    expect(await Appointment.countDocuments({ businessId: ctx.shop.businessId })).toBe(0);
  });

  it('leaves a one-off booking with no recurrence fields set', async () => {
    const ctx = await seedWorkspace();

    const one = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    expect(one.recurrenceRule).toBeNull();
    expect(one.recurrenceParentId).toBeNull();
    expect(one.recurrenceGeneratedThrough).toBeNull();
    expect(await Appointment.countDocuments({ businessId: ctx.shop.businessId })).toBe(1);
  });
});

describe('an occurrence that cannot be booked is skipped, not forced', () => {
  it('skips the visits that fall on a closed day and creates the rest', async () => {
    /**
     * The central decision. A monthly plan on the 15th lands on a Sunday twice a year, and
     * a business closed on Sundays is not going to do that visit. Failing the whole plan
     * because of it is useless; creating it anyway is booking work nobody will do.
     *
     * Monthly rather than weekly on purpose: every occurrence of a *weekly* series falls on
     * the same weekday, so closing that day would skip all of them and the test would not
     * distinguish "skips the closed ones" from "skips everything".
     */
    const ctx = await seedWorkspace();

    const firstStart = localAhead(3, 9 * 60, ctx.timezone);
    const rule = { frequency: 'monthly' as const, interval: 1 };

    // Work out which weekdays a year of monthly visits would land on, and close one that
    // some — but not all — of them hit.
    const weekdays = Array.from({ length: 4 }, (_, i) =>
      zonedParts(
        RecurrenceService.occurrenceAt(firstStart, rule, i, ctx.timezone)!,
        ctx.timezone
      )!.weekday
    );

    const closedDay = weekdays.slice(1).find((d) => weekdays.filter((w) => w === d).length < 4)!;
    const expectedSkips = weekdays.slice(1).filter((d) => d === closedDay).length;
    expect(expectedSkips).toBeGreaterThan(0);

    await Business.findByIdAndUpdate(ctx.shop.businessId, {
      businessHours: ALL_DAYS.map((day) => ({
        day,
        isOpen: day !== closedDay,
        openTime: '00:00',
        closeTime: '23:59',
      })),
    });

    const parent = await bookSeries(ctx, { ...rule, count: 4 });
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);

    // Three would-be occurrences after the parent, less the ones on the closed day.
    expect(children).toHaveLength(3 - expectedSkips);
    children.forEach((child) =>
      expect(zonedParts(child.startAt, ctx.timezone)!.weekday).not.toBe(closedDay)
    );
  });

  it('reports a closed day as the reason it was skipped', async () => {
    const ctx = await seedWorkspace();
    const firstStart = localAhead(3, 9 * 60, ctx.timezone);
    const rule = { frequency: 'monthly' as const, interval: 1 };

    const secondWeekday = zonedParts(
      RecurrenceService.occurrenceAt(firstStart, rule, 1, ctx.timezone)!,
      ctx.timezone
    )!.weekday;
    const firstWeekday = zonedParts(firstStart, ctx.timezone)!.weekday;

    // Only meaningful when the two differ, which for a monthly series they almost always do.
    if (secondWeekday === firstWeekday) return;

    await Business.findByIdAndUpdate(ctx.shop.businessId, {
      businessHours: ALL_DAYS.map((day) => ({
        day,
        isOpen: day !== secondWeekday,
        openTime: '00:00',
        closeTime: '23:59',
      })),
    });

    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: firstStart.toISOString(),
    } as any);

    parent.recurrenceRule = { ...rule, count: 3 } as any;
    await parent.save();

    const result = await RecurrenceService.materialise(ctx.shop.businessId, parent._id);

    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.skipped[0].reason).toMatch(/opening hours/i);
  });

  it('skips an occurrence whose technician is already booked and reports it', async () => {
    const ctx = await seedWorkspace();
    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Dana Reyes');

    // Block the technician at the time the second visit would land.
    const secondVisit = localAhead(3 + 7, 9 * 60, ctx.timezone);
    await Appointment.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      serviceId: ctx.service._id,
      technicianId: tech._id,
      technicianName: 'Dana Reyes',
      startAt: secondVisit,
      endAt: new Date(secondVisit.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      timezone: ctx.timezone,
      address: '1 Test St',
    });

    const parent = await bookSeries(
      ctx,
      { frequency: 'weekly', interval: 1, count: 4 },
      { technicianId: tech._id }
    );

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    const starts = children.map((c) => c.startAt.getTime());

    // Visit two skipped; visits three and four created.
    expect(starts).not.toContain(secondVisit.getTime());
    expect(children).toHaveLength(2);
  });

  it('names the skipped dates and why', async () => {
    const ctx = await seedWorkspace();
    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Dana Reyes');

    const clash = localAhead(3 + 7, 9 * 60, ctx.timezone);
    await Appointment.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      serviceId: ctx.service._id,
      technicianId: tech._id,
      technicianName: 'Dana Reyes',
      startAt: clash,
      endAt: new Date(clash.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      timezone: ctx.timezone,
      address: '1 Test St',
    });

    // The parent is created without generating, then materialised directly so the report
    // is visible — the create path swallows it because a failed week must not fail a
    // confirmed first visit.
    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
      technicianId: tech._id.toString(),
    } as any);

    parent.recurrenceRule = { frequency: 'weekly', interval: 1, count: 4 } as any;
    await parent.save();

    const result = await RecurrenceService.materialise(ctx.shop.businessId, parent._id);

    expect(result.created).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].startAt.getTime()).toBe(clash.getTime());
    expect(result.skipped[0].reason).toMatch(/Dana Reyes/);
  });
});

describe('materialising is idempotent', () => {
  it('creates nothing on a second pass', async () => {
    // The top-up job runs on a schedule and must be safe to run as often as it likes.
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });

    const before = await Appointment.countDocuments({ businessId: ctx.shop.businessId });
    const again = await RecurrenceService.materialise(ctx.shop.businessId, parent._id);

    expect(again.created).toBe(0);
    expect(await Appointment.countDocuments({ businessId: ctx.shop.businessId })).toBe(before);
  });

  it('does not refill a gap left by a cancelled occurrence', async () => {
    /**
     * The watermark, rather than deriving progress from the occurrences themselves. A
     * cancelled visit is a decision someone made; re-creating it on the next tick would
     * undo that decision every twelve hours.
     */
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });

    const children = await occurrencesOf(ctx.shop.businessId, parent._id);
    children[0].status = 'cancelled';
    await children[0].save();

    const again = await RecurrenceService.materialise(ctx.shop.businessId, parent._id);
    expect(again.created).toBe(0);

    const after = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(after).toHaveLength(3);
    expect(after.filter((a) => a.status === 'cancelled')).toHaveLength(1);
  });

  it('extends the window when the horizon moves', async () => {
    const ctx = await seedWorkspace();

    // Materialised to a deliberately short horizon first.
    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    parent.recurrenceRule = { frequency: 'weekly', interval: 1, count: 12 } as any;
    await parent.save();

    const near = await RecurrenceService.materialise(ctx.shop.businessId, parent._id, {
      horizonDays: 20,
    });
    expect(near.created).toBe(2);

    const far = await RecurrenceService.materialise(ctx.shop.businessId, parent._id, {
      horizonDays: 90,
    });
    expect(far.created).toBeGreaterThan(0);

    const total = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(total.length).toBe(2 + far.created);
    // No duplicates: every start is distinct.
    expect(new Set(total.map((a) => a.startAt.getTime())).size).toBe(total.length);
  });

  it('refuses to materialise an appointment that is not a series', async () => {
    const ctx = await seedWorkspace();
    const one = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    await expect(
      RecurrenceService.materialise(ctx.shop.businessId, one._id)
    ).rejects.toThrow(/not part of a repeating series/i);
  });

  it('will not materialise another business’s series', async () => {
    const mine = await seedWorkspace();
    const theirs = await seedWorkspace();
    const parent = await bookSeries(theirs, { frequency: 'weekly', interval: 1, count: 4 });

    await expect(
      RecurrenceService.materialise(mine.shop.businessId, parent._id)
    ).rejects.toThrow(/not found/i);
  });
});

describe('the top-up job', () => {
  it('extends a series whose window is running short', async () => {
    const ctx = await seedWorkspace();

    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    parent.recurrenceRule = { frequency: 'weekly', interval: 1, count: 30 } as any;
    await parent.save();
    await RecurrenceService.materialise(ctx.shop.businessId, parent._id, { horizonDays: 20 });

    const before = await occurrencesOf(ctx.shop.businessId, parent._id);

    const result = await RecurrenceService.topUpSeries();

    expect(result.created).toBeGreaterThan(0);
    const after = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('does not even look at a series that is already complete', async () => {
    /**
     * Asserted on `examined`, not `created`.
     *
     * Dropping the watermark clause from the query produces the same occurrences — a
     * finished series generates nothing either way — so `created` cannot tell the
     * difference. What changes is that every completed plan a business has ever run takes
     * the per-business booking lock twice a day, competing with live bookings. A guard
     * whose only effect is on cost still needs the cost to be visible.
     */
    const ctx = await seedWorkspace();
    await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });

    const result = await RecurrenceService.topUpSeries();
    expect(result.created).toBe(0);
    expect(result.examined).toBe(0);
  });

  it('keeps generating after the first visit alone is cancelled', async () => {
    /**
     * Cancelling one visit is not ending the plan — `cancelSeries` is, and it clears the
     * rule. A customer who cancels next Tuesday still has a maintenance plan, so a filter
     * on the parent's own status would have made "skip one visit" silently stop the next
     * year of them.
     */
    const ctx = await seedWorkspace();

    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    parent.recurrenceRule = { frequency: 'weekly', interval: 1, count: 30 } as any;
    await parent.save();
    await RecurrenceService.materialise(ctx.shop.businessId, parent._id, { horizonDays: 20 });

    // Cancel only the first visit, through the single-occurrence path.
    await AppointmentService.cancelAppointment(
      ctx.shop.businessId,
      parent._id.toString(),
      'Customer away that week'
    );

    const before = await Appointment.countDocuments({ recurrenceParentId: parent._id });
    const result = await RecurrenceService.topUpSeries();

    expect(result.examined).toBe(1);
    expect(result.created).toBeGreaterThan(0);
    expect(await Appointment.countDocuments({ recurrenceParentId: parent._id })).toBeGreaterThan(
      before
    );

    // And ending the plan properly does stop it.
    await RecurrenceService.cancelSeries(ctx.shop.businessId, parent._id);
    expect((await RecurrenceService.topUpSeries()).examined).toBe(0);
  });

  it('does not treat the occurrences as series of their own', async () => {
    /**
     * Children carry no rule, so the query's `recurrenceRule: { $ne: null }` is what keeps
     * them out. Without it a four-visit plan becomes four candidates, each taking the lock
     * and each refused — invisible in the output, and four times the work.
     */
    const ctx = await seedWorkspace();

    const parent = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    // A rule with room left to generate, so the parent itself is a legitimate candidate.
    parent.recurrenceRule = { frequency: 'weekly', interval: 1, count: 30 } as any;
    await parent.save();
    await RecurrenceService.materialise(ctx.shop.businessId, parent._id, { horizonDays: 20 });

    expect(
      await Appointment.countDocuments({ recurrenceParentId: parent._id })
    ).toBeGreaterThan(1);

    /**
     * An ordinary one-off booking too.
     *
     * `recurrenceParentId: null` already excludes the occurrences, so that clause alone
     * made this test pass while `recurrenceRule: { $ne: null }` did nothing observable.
     * What that clause actually keeps out is *non-recurring* appointments — which have a
     * null parent, a null watermark and no completion date, and would otherwise every one
     * of them become a candidate that takes the booking lock twice a day.
     */
    await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(4, 14 * 60, ctx.timezone).toISOString(),
    } as any);

    const result = await RecurrenceService.topUpSeries();
    expect(result.examined).toBe(1);
  });
});

describe('ending a series', () => {
  const seedFourWeekly = async () => {
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });
    return { ctx, parent };
  };

  it('cancels the remaining visits and stops the series', async () => {
    const { ctx, parent } = await seedFourWeekly();

    const result = await RecurrenceService.cancelSeries(ctx.shop.businessId, parent._id);

    expect(result.cancelled).toBe(4);
    expect(result.parentId).toBe(parent._id.toString());

    const all = await Appointment.find({ businessId: ctx.shop.businessId });
    expect(all.every((a) => a.status === 'cancelled')).toBe(true);

    /**
     * The rule is cleared, or the top-up job would helpfully re-create everything just
     * cancelled on its next tick.
     */
    const stored = await Appointment.findById(parent._id);
    expect(stored!.recurrenceRule).toBeNull();

    const topUp = await RecurrenceService.topUpSeries();
    expect(topUp.created).toBe(0);
  });

  it('can be triggered from any occurrence, not just the parent', async () => {
    const { ctx, parent } = await seedFourWeekly();
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);

    const result = await RecurrenceService.cancelSeries(ctx.shop.businessId, children[1]._id);
    expect(result.parentId).toBe(parent._id.toString());
  });

  it('ends the series from a chosen date, leaving earlier visits alone', async () => {
    // "Stop after the March visit" is a real instruction and not the same as "cancel it all".
    const { ctx, parent } = await seedFourWeekly();
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);

    const result = await RecurrenceService.cancelSeries(ctx.shop.businessId, parent._id, {
      from: children[1].startAt,
    });

    expect(result.cancelled).toBe(2);

    const reloaded = await Appointment.find({ businessId: ctx.shop.businessId }).sort({
      startAt: 1,
    });
    expect(reloaded.map((a) => a.status)).toEqual([
      'scheduled',
      'scheduled',
      'cancelled',
      'cancelled',
    ]);
  });

  it('does not rewrite a completed visit', async () => {
    /**
     * A completed visit is a record of work done and an invoice raised. Cancelling it
     * retroactively would make the invoice reference an appointment that says it never
     * happened.
     */
    const { ctx, parent } = await seedFourWeekly();
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);

    children[0].status = 'completed';
    await children[0].save();

    await RecurrenceService.cancelSeries(ctx.shop.businessId, parent._id, {
      from: new Date(0),
    });

    const stillDone = await Appointment.findById(children[0]._id);
    expect(stillDone!.status).toBe('completed');
  });

  it('records a reason on each cancelled visit', async () => {
    const { ctx, parent } = await seedFourWeekly();

    await RecurrenceService.cancelSeries(ctx.shop.businessId, parent._id, {
      reason: 'Customer sold the property',
    });

    const all = await Appointment.find({ businessId: ctx.shop.businessId });
    expect(all.every((a) => a.cancellationReason === 'Customer sold the property')).toBe(true);
  });

  it('refuses when the appointment is not part of a series', async () => {
    const ctx = await seedWorkspace();
    const one = await AppointmentService.createAppointment(ctx.shop.businessId, {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    } as any);

    await expect(
      RecurrenceService.cancelSeries(ctx.shop.businessId, one._id)
    ).rejects.toThrow(/not part of a repeating series/i);
  });

  it('will not touch another business’s series', async () => {
    const mine = await seedWorkspace();
    const theirs = await seedWorkspace();
    const parent = await bookSeries(theirs, { frequency: 'weekly', interval: 1, count: 4 });

    await expect(
      RecurrenceService.cancelSeries(mine.shop.businessId, parent._id)
    ).rejects.toThrow(/not found/i);

    const untouched = await Appointment.find({ businessId: theirs.shop.businessId });
    expect(untouched.every((a) => a.status === 'scheduled')).toBe(true);
  });
});

describe('one occurrence can be moved without disturbing the rest', () => {
  it('reschedules a single visit only', async () => {
    /**
     * Edit-one is simply the existing reschedule path: an occurrence is a real
     * appointment, so nothing special is needed. Asserted because "does moving one visit
     * move the series" is the first question anyone asks of a recurring calendar.
     */
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);

    const target = new Date(children[0].startAt.getTime() + 3 * 60 * 60 * 1000);
    await AppointmentService.rescheduleAppointment(ctx.shop.businessId, children[0]._id.toString(), {
      startAt: target.toISOString(),
    } as any);

    const reloaded = await occurrencesOf(ctx.shop.businessId, parent._id);
    expect(reloaded[0].startAt.getTime()).toBe(target.getTime());
    expect(reloaded[0].recurrenceParentId!.toString()).toBe(parent._id.toString());

    // The others are untouched.
    expect(reloaded[1].startAt.getTime()).toBe(children[1].startAt.getTime());
    expect(reloaded[2].startAt.getTime()).toBe(children[2].startAt.getTime());
  });

  it('does not re-create a moved visit on the next top-up', async () => {
    // The watermark again: the slot the visit vacated must not be refilled.
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });
    const children = await occurrencesOf(ctx.shop.businessId, parent._id);

    await AppointmentService.rescheduleAppointment(ctx.shop.businessId, children[0]._id.toString(), {
      startAt: new Date(children[0].startAt.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    } as any);

    await RecurrenceService.topUpSeries();

    expect(
      await Appointment.countDocuments({
        businessId: ctx.shop.businessId,
        recurrenceParentId: parent._id,
      })
    ).toBe(3);
  });
});

describe('the series endpoints', () => {
  const seedViaApi = async (): Promise<{ shop: Workspace; parentId: string }> => {
    const ctx = await seedWorkspace();
    const parent = await bookSeries(ctx, { frequency: 'weekly', interval: 1, count: 4 });
    return { shop: ctx.shop, parentId: parent._id.toString() };
  };

  it('lists a whole series, parent first', async () => {
    const { shop, parentId } = await seedViaApi();

    const res = await asUser(shop.ownerToken).get(`/api/appointments/${parentId}/series`);

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(4);
    expect(res.body.appointments[0]._id).toBe(parentId);
  });

  it('lists the whole series when asked from one of the occurrences', async () => {
    /**
     * Asking from a child is the normal case — a dispatcher clicks the visit in front of
     * them, not the first one in the series. Only testing it from the parent left the
     * parent resolution untested, because on the parent `recurrenceParentId` is null and
     * `?? target._id` gives the same answer either way.
     */
    const { shop, parentId } = await seedViaApi();
    const children = await Appointment.find({ recurrenceParentId: parentId }).sort({ startAt: 1 });

    const res = await asUser(shop.ownerToken).get(
      `/api/appointments/${children[1]._id}/series`
    );

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(4);
    expect(res.body.appointments[0]._id).toBe(parentId);
  });

  it('ends a series over HTTP', async () => {
    const { shop, parentId } = await seedViaApi();

    const res = await asUser(shop.ownerToken)
      .post(`/api/appointments/${parentId}/cancel-series`)
      .send({ reason: 'Plan ended' });

    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(4);
  });

  it('refuses an over-long series cancellation reason', async () => {
    const { shop, parentId } = await seedViaApi();

    const res = await asUser(shop.ownerToken)
      .post(`/api/appointments/${parentId}/cancel-series`)
      .send({ reason: 'z'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('will not list another business’s series', async () => {
    const other = await createWorkspace();
    const { parentId } = await seedViaApi();

    const res = await asUser(other.ownerToken).get(`/api/appointments/${parentId}/series`);
    expect(res.status).toBe(404);
  });

  it('accepts a recurrence rule over HTTP and rejects an endless one', async () => {
    const ctx = await seedWorkspace();
    const base = {
      customerId: ctx.customer._id.toString(),
      serviceId: ctx.service._id.toString(),
      startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
    };

    const endless = await asUser(ctx.shop.ownerToken)
      .post('/api/appointments')
      .send({ ...base, recurrence: { frequency: 'weekly', interval: 1 } });

    expect(endless.status).toBe(400);
    expect(endless.body.message ?? endless.body.error).toMatch(/needs an end/i);

    const ok = await asUser(ctx.shop.ownerToken)
      .post('/api/appointments')
      .send({ ...base, recurrence: { frequency: 'weekly', interval: 1, count: 3 } });

    expect(ok.status).toBe(201);
    expect(
      await Appointment.countDocuments({ businessId: ctx.shop.businessId })
    ).toBe(3);
  });

  it('rejects a frequency the schema does not know before it reaches the service', async () => {
    const ctx = await seedWorkspace();

    const res = await asUser(ctx.shop.ownerToken)
      .post('/api/appointments')
      .send({
        customerId: ctx.customer._id.toString(),
        serviceId: ctx.service._id.toString(),
        startAt: localAhead(3, 9 * 60, ctx.timezone).toISOString(),
        recurrence: { frequency: 'daily', interval: 1, count: 3 },
      });

    expect(res.status).toBe(400);
    expect(res.body.fields?.['recurrence.frequency']).toBeTruthy();
  });
});

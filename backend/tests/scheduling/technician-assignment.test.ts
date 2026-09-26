import { describe, expect, it } from 'vitest';
import { Appointment } from '../../src/models/appointment.model';
import { Business } from '../../src/models/business.model';
import { Customer } from '../../src/models/customer.model';
import { Service } from '../../src/models/service.model';
import { ServiceZone } from '../../src/models/service-zone.model';
import { Technician } from '../../src/models/technician.model';
import { AppointmentService } from '../../src/services/appointment.service';
import { TechnicianDispatchService } from '../../src/services/technician-dispatch.service';
import { zonedWallClockToUtc, zonedDateKey } from '../../src/utils/format';
import { asUser } from '../helpers/agent';
import {
  createCustomerRecord,
  createServiceRecord,
  createTechnicianRecord,
  createWorkspace,
} from '../helpers/factories';

/**
 * Day 20: assignment as a first-class action.
 *
 * `findOptimalTechnician` existed with exactly one caller — an unvalidated
 * `POST /api/dispatch/match-tech` that nothing in the product invoked — so its result
 * reached nobody and its defects were invisible. It ignored `Technician.status`, decided
 * who was busy by matching `technicianName` as a *string* rather than reading
 * `technicianId`, bounded its day with the server's midnight instead of the business's,
 * let a skill match overwrite the availability decision, and claimed "Transit buffer
 * verified" in a branch where no availability check had run.
 */

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TZ = 'America/Chicago';

const seedShop = async () => {
  const shop = await createWorkspace({ timezone: TZ });
  await Business.findByIdAndUpdate(shop.businessId, {
    timezone: TZ,
    businessHours: ALL_DAYS.map((day) => ({
      day,
      isOpen: true,
      openTime: '00:00',
      closeTime: '23:59',
    })),
  });
  const [service, customer] = await Promise.all([
    createServiceRecord(shop.businessId),
    createCustomerRecord(shop.businessId),
  ]);
  return { shop, service, customer };
};

/** A local wall-clock instant N days ahead. */
const localAhead = (daysAhead: number, minutesOfDay: number): Date => {
  const key = zonedDateKey(new Date(Date.now() + daysAhead * 86_400_000), TZ);
  const [y, m, d] = key.split('-').map(Number);
  return zonedWallClockToUtc(y, m, d, minutesOfDay, TZ);
};

const book = (
  ctx: Awaited<ReturnType<typeof seedShop>>,
  technicianId: any,
  startAt: Date,
  options: { technicianName?: string; minutes?: number; status?: string } = {}
) =>
  Appointment.create({
    businessId: ctx.shop.businessId,
    customerId: ctx.customer._id,
    serviceId: ctx.service._id,
    technicianId,
    technicianName: options.technicianName,
    startAt,
    endAt: new Date(startAt.getTime() + (options.minutes ?? 60) * 60 * 1000),
    status: options.status ?? 'scheduled',
    timezone: TZ,
    address: '1 Test St',
  });

describe('the matcher will not suggest somebody who is busy', () => {
  it('reads technicianId, not the denormalised name', async () => {
    /**
     * The defect that made the availability scan useless. Appointments carry
     * `technicianId`; the scan joined on `technicianName` as a string, so a job assigned by
     * id whose name field was absent — which is every job booked through a path that only
     * sets the id — was invisible, and the matcher happily suggested someone already booked.
     */
    const ctx = await seedShop();
    const [alpha, beta] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Alpha'),
      createTechnicianRecord(ctx.shop.businessId, 'Beta'),
    ]);

    const slot = localAhead(3, 10 * 60);

    // Assigned by id with **no** technicianName, exactly as the string join could not see.
    await book(ctx, alpha._id, slot);

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: slot,
      endAt: new Date(slot.getTime() + 60 * 60 * 1000),
    });

    expect(match.suggested?.technicianId).toBe(beta._id.toString());

    const alphaCandidate = match.candidates.find(
      (c) => c.technicianId === alpha._id.toString()
    )!;
    expect(alphaCandidate.busy).toBe(true);
    expect(alphaCandidate.eligible).toBe(false);
  });

  it('suggests nobody, and says so, when the whole crew is booked', async () => {
    const ctx = await seedShop();
    const techs = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Alpha'),
      createTechnicianRecord(ctx.shop.businessId, 'Beta'),
    ]);

    const slot = localAhead(3, 10 * 60);
    for (const tech of techs) await book(ctx, tech._id, slot);

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: slot,
    });

    expect(match.suggested).toBeNull();
    expect(match.reason).toMatch(/already booked at that time/i);
    // The list still comes back, so a dispatcher can see who to bump.
    expect(match.candidates).toHaveLength(2);
  });

  it('treats back-to-back jobs as free, matching the booking path', async () => {
    // Half-open, the same rule `checkSlotConflictDetailed` uses. A matcher that disagreed
    // with the booking path would suggest people it then refuses.
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');

    const earlier = localAhead(3, 9 * 60);
    await book(ctx, alpha._id, earlier);

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: new Date(earlier.getTime() + 60 * 60 * 1000),
      endAt: new Date(earlier.getTime() + 120 * 60 * 1000),
    });

    expect(match.suggested?.technicianId).toBe(alpha._id.toString());
  });

  it('ignores cancelled work when deciding who is busy', async () => {
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');

    const slot = localAhead(3, 10 * 60);
    await book(ctx, alpha._id, slot, { status: 'cancelled' });

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: slot,
    });

    expect(match.suggested?.technicianId).toBe(alpha._id.toString());
  });

  it('counts nobody as busy when no window was given', async () => {
    /**
     * Honest degradation. Without a window there is nothing to be busy *for*, so the
     * suggestion is made on zone and skill alone — and `reason` omits any availability
     * claim rather than asserting one.
     */
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');
    await book(ctx, alpha._id, localAhead(3, 10 * 60));

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {});

    expect(match.suggested?.technicianId).toBe(alpha._id.toString());
    expect(match.candidates[0].busy).toBe(false);
    expect(match.reason).not.toMatch(/booked|that day/i);
  });
});

describe('the matcher respects technician status', () => {
  it('never suggests an off-duty technician', async () => {
    // `status` was ignored entirely: only `active` was filtered, so somebody marked
    // off duty was as valid a pick as anyone on shift.
    const ctx = await seedShop();
    const [off, on] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Aaron Off'),
      createTechnicianRecord(ctx.shop.businessId, 'Zoe On'),
    ]);
    off.status = 'off_duty';
    await off.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: localAhead(3, 10 * 60),
    });

    // Alphabetically Aaron would win; being off duty removes them from the roster entirely.
    expect(match.candidates.map((c) => c.name)).toEqual(['Zoe On']);
    expect(match.suggested?.technicianId).toBe(on._id.toString());
  });

  it('still suggests a technician who is on a job right now', async () => {
    /**
     * A deliberate distinction. `status` is a statement about *this moment*; the booking
     * being filled is usually days away, so excluding `on_job` would rule out the right
     * person for Thursday because they are busy on Tuesday. Real unavailability is decided
     * from the diary, which is exact, rather than from a flag someone forgot to flip.
     */
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');
    alpha.status = 'on_job';
    await alpha.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: localAhead(3, 10 * 60),
    });

    expect(match.suggested?.technicianId).toBe(alpha._id.toString());
  });

  it('distinguishes an empty roster from an entirely off-duty one', async () => {
    const empty = await seedShop();
    expect(
      (await TechnicianDispatchService.findOptimalTechnician(empty.shop.businessId, {})).reason
    ).toMatch(/No technicians configured/i);

    const ctx = await seedShop();
    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');
    tech.status = 'off_duty';
    await tech.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {});
    expect(match.suggested).toBeNull();
    expect(match.reason).toMatch(/off duty or deactivated/i);
  });

  it('never suggests a deactivated technician', async () => {
    const ctx = await seedShop();
    const [gone, here] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Aaron Gone'),
      createTechnicianRecord(ctx.shop.businessId, 'Zoe Here'),
    ]);
    gone.active = false;
    await gone.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {});
    expect(match.candidates.map((c) => c.name)).toEqual(['Zoe Here']);
    expect(match.suggested?.technicianId).toBe(here._id.toString());
  });

  it('never suggests another business’s technician', async () => {
    const mine = await seedShop();
    const theirs = await seedShop();
    await createTechnicianRecord(theirs.shop.businessId, 'Their Tech');

    const match = await TechnicianDispatchService.findOptimalTechnician(mine.shop.businessId, {});
    expect(match.candidates).toHaveLength(0);
    expect(match.suggested).toBeNull();
  });
});

describe('the zone ranks candidates, it no longer gates them', () => {
  it('prefers a technician assigned to the zone covering the ZIP', async () => {
    const ctx = await seedShop();
    const [inZone, outZone] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Zoe InZone'),
      createTechnicianRecord(ctx.shop.businessId, 'Aaron OutZone'),
    ]);

    await ServiceZone.create({
      businessId: ctx.shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      assignedTechnicianIds: [inZone._id],
    });

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      zipCode: '75001',
      startAt: localAhead(3, 10 * 60),
    });

    // Alphabetically Aaron would come first; the zone is what moves Zoe ahead.
    expect(match.suggested?.technicianId).toBe(inZone._id.toString());
    expect(match.suggested?.inZone).toBe(true);
    expect(match.reason).toMatch(/covers North/);
  });

  it('falls outside the zone rather than suggesting nobody', async () => {
    /**
     * The old version restricted candidates to the zone's roster and only fell back to
     * everyone when that roster was *empty*. So a zone with one assigned technician became
     * unbookable the moment that person was busy — the whole ZIP, for the rest of the day.
     */
    const ctx = await seedShop();
    const [inZone, outZone] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'InZone'),
      createTechnicianRecord(ctx.shop.businessId, 'OutZone'),
    ]);

    await ServiceZone.create({
      businessId: ctx.shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      assignedTechnicianIds: [inZone._id],
    });

    const slot = localAhead(3, 10 * 60);
    await book(ctx, inZone._id, slot);

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      zipCode: '75001',
      startAt: slot,
    });

    expect(match.suggested?.technicianId).toBe(outZone._id.toString());
    expect(match.suggested?.inZone).toBe(false);
    // And it says so, rather than implying zone coverage it does not have.
    expect(match.reason).toMatch(/outside North/);
  });

  it('makes no zone claim when the ZIP matches nothing', async () => {
    const ctx = await seedShop();
    await createTechnicianRecord(ctx.shop.businessId, 'Alpha');

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      zipCode: '99999',
      startAt: localAhead(3, 10 * 60),
    });

    expect(match.matchedZone).toBeNull();
    expect(match.reason).not.toMatch(/covers|outside/i);
  });
});

describe('skills rank rather than exclude, and match exactly', () => {
  it('prefers a technician holding the tag', async () => {
    const ctx = await seedShop();
    const [generalist, specialist] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Aaron Generalist'),
      createTechnicianRecord(ctx.shop.businessId, 'Zoe Specialist'),
    ]);
    specialist.skills = ['ac_repair', 'compressor'];
    await specialist.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      requiredSkill: 'compressor',
      startAt: localAhead(3, 10 * 60),
    });

    expect(match.suggested?.technicianId).toBe(specialist._id.toString());
    expect(match.reason).toMatch(/is tagged compressor/);
  });

  it('still suggests somebody when nobody holds the tag, and admits it', async () => {
    /**
     * A one-technician business tagged only `diagnostics` still has to be able to book a
     * compressor job. Excluding on skill would leave the owner with no suggestion and no
     * explanation; ranking on it leaves them with a suggestion and an honest caveat.
     */
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      requiredSkill: 'compressor',
      startAt: localAhead(3, 10 * 60),
    });

    expect(match.suggested?.technicianId).toBe(alpha._id.toString());
    expect(match.suggested?.hasSkill).toBe(false);
    expect(match.reason).toMatch(/not tagged compressor — nobody available is/);
  });

  it('matches a tag exactly, not by substring', async () => {
    /**
     * The old comparison was two-way: `req.includes(skill) || skill.includes(req)`. So a
     * technician tagged `ac` matched a request for `ac_repair`, a request for
     * `"no ac_repair"` matched a technician tagged `ac_repair`, and a one-letter tag
     * matched everything. A certification match that loose is worse than none, because a
     * dispatcher believes it.
     */
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');
    alpha.skills = ['ac'];
    await alpha.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      requiredSkill: 'ac_repair',
      startAt: localAhead(3, 10 * 60),
    });

    expect(match.suggested?.hasSkill).toBe(false);
  });

  it('matches a tag case-insensitively', async () => {
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');
    alpha.skills = ['AC_Repair'];
    await alpha.save();

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      requiredSkill: '  ac_repair  ',
      startAt: localAhead(3, 10 * 60),
    });

    expect(match.suggested?.hasSkill).toBe(true);
  });

  it('reports hasSkill as null when no skill was asked for', async () => {
    // `false` would read as "does not hold it", which is a different claim from "nobody
    // asked". The reason string omits any skill clause in this case too.
    const ctx = await seedShop();
    await createTechnicianRecord(ctx.shop.businessId, 'Alpha');

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {});
    expect(match.suggested?.hasSkill).toBeNull();
    expect(match.reason).not.toMatch(/tagged/);
  });

  it('never lets a skill match override availability', async () => {
    /**
     * The old order applied the skill match *after* the availability scan and overwrote its
     * choice, so a certified but already-booked technician beat an available one. Eligibility
     * is now the first sort key, so it cannot be outranked.
     */
    const ctx = await seedShop();
    const [certifiedBusy, uncertifiedFree] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Certified Busy'),
      createTechnicianRecord(ctx.shop.businessId, 'Uncertified Free'),
    ]);
    certifiedBusy.skills = ['compressor'];
    await certifiedBusy.save();

    const slot = localAhead(3, 10 * 60);
    await book(ctx, certifiedBusy._id, slot);

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      requiredSkill: 'compressor',
      startAt: slot,
    });

    expect(match.suggested?.technicianId).toBe(uncertifiedFree._id.toString());
  });
});

describe('work is spread across the crew', () => {
  it('prefers the technician with fewer jobs that day', async () => {
    /**
     * The old default was `candidateTechs[0]` on an unsorted query — whoever happened to be
     * inserted first, every time, so one person collected the whole day.
     */
    const ctx = await seedShop();
    const [aaron, zoe] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Aaron Loaded'),
      createTechnicianRecord(ctx.shop.businessId, 'Zoe Light'),
    ]);

    // Aaron already has two jobs that local day, at times that do not clash with the slot.
    await book(ctx, aaron._id, localAhead(3, 8 * 60));
    await book(ctx, aaron._id, localAhead(3, 13 * 60));

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: localAhead(3, 16 * 60),
    });

    // Alphabetically Aaron wins; the load is what moves Zoe ahead.
    expect(match.suggested?.technicianId).toBe(zoe._id.toString());
    expect(match.candidates.find((c) => c.name === 'Aaron Loaded')!.jobsThatDay).toBe(2);
    expect(match.reason).toMatch(/nothing else booked that day/);
  });

  it('counts the day in the business timezone, not the server’s', async () => {
    /**
     * The old window was `setHours(0,0,0,0)` on the server's clock. For a Chicago business
     * on a UTC host that runs 19:00 the previous evening to 19:00, so an 8 PM job counted
     * towards the wrong day's load and a 6 AM job against neither.
     */
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');

    // 22:00 local, which is 03:00 UTC the *next* calendar day.
    const lateLocal = localAhead(3, 22 * 60);
    await book(ctx, alpha._id, lateLocal);

    const match = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: localAhead(3, 9 * 60),
    });

    // Same local day, so the late job counts.
    expect(match.candidates[0].jobsThatDay).toBe(1);

    // And it does not count towards the following local day.
    const nextDay = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: localAhead(4, 9 * 60),
    });
    expect(nextDay.candidates[0].jobsThatDay).toBe(0);
  });

  it('is deterministic for identical candidates', async () => {
    // Same inputs, same suggestion. The old version depended on insertion order with no
    // sort, so the answer could move for no visible reason.
    const ctx = await seedShop();
    await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Bravo'),
      createTechnicianRecord(ctx.shop.businessId, 'Alpha'),
      createTechnicianRecord(ctx.shop.businessId, 'Charlie'),
    ]);

    const slot = localAhead(3, 10 * 60);
    const first = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: slot,
    });
    const second = await TechnicianDispatchService.findOptimalTechnician(ctx.shop.businessId, {
      startAt: slot,
    });

    expect(first.suggested?.name).toBe('Alpha');
    expect(second.suggested?.name).toBe('Alpha');
    expect(first.candidates.map((c) => c.name)).toEqual(second.candidates.map((c) => c.name));
  });
});

describe('the match endpoint', () => {
  it('derives the ZIP and skill from a customer and service', async () => {
    /**
     * The booking form knows a customer and a service long before a ZIP or a tag. Deriving
     * them server-side means the ZIP used to pick a technician is the same one on the
     * customer record that the travel fee reads — two places that must not disagree.
     */
    const ctx = await seedShop();
    const inZone = await createTechnicianRecord(ctx.shop.businessId, 'Zoe InZone');
    await createTechnicianRecord(ctx.shop.businessId, 'Aaron OutZone');

    // The factory customer lives at 75001.
    await ServiceZone.create({
      businessId: ctx.shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      assignedTechnicianIds: [inZone._id],
    });

    const res = await asUser(ctx.shop.ownerToken)
      .post('/api/dispatch/match-tech')
      .send({
        customerId: ctx.customer._id.toString(),
        serviceId: ctx.service._id.toString(),
        startAt: localAhead(3, 10 * 60).toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.matchedZone?.name).toBe('North');
    expect(res.body.suggested?.technicianId).toBe(inZone._id.toString());
  });

  it('lets an explicit ZIP win over the customer’s', async () => {
    const ctx = await seedShop();
    const northTech = await createTechnicianRecord(ctx.shop.businessId, 'North Tech');
    await ServiceZone.create({
      businessId: ctx.shop.businessId,
      name: 'South',
      zipCodes: ['75001'],
      assignedTechnicianIds: [northTech._id],
    });
    await ServiceZone.create({
      businessId: ctx.shop.businessId,
      name: 'Far',
      zipCodes: ['75099'],
    });

    const res = await asUser(ctx.shop.ownerToken)
      .post('/api/dispatch/match-tech')
      .send({ customerId: ctx.customer._id.toString(), zipCode: '75099' });

    expect(res.status).toBe(200);
    expect(res.body.matchedZone?.name).toBe('Far');
  });

  it('refuses a malformed ZIP', async () => {
    const ctx = await seedShop();
    const res = await asUser(ctx.shop.ownerToken)
      .post('/api/dispatch/match-tech')
      .send({ zipCode: 'north side' });

    expect(res.status).toBe(400);
    expect(res.body.fields?.zipCode).toBeTruthy();
  });

  it('refuses an inverted window', async () => {
    const ctx = await seedShop();
    const startAt = localAhead(3, 10 * 60);

    const res = await asUser(ctx.shop.ownerToken)
      .post('/api/dispatch/match-tech')
      .send({
        startAt: startAt.toISOString(),
        endAt: new Date(startAt.getTime() - 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it('will not read another business’s customer for the ZIP', async () => {
    const mine = await seedShop();
    const theirs = await seedShop();
    await createTechnicianRecord(mine.shop.businessId, 'Mine');
    await ServiceZone.create({
      businessId: mine.shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
    });

    const res = await asUser(mine.shop.ownerToken)
      .post('/api/dispatch/match-tech')
      .send({ customerId: theirs.customer._id.toString() });

    expect(res.status).toBe(200);
    // No ZIP resolved, so no zone claimed.
    expect(res.body.matchedZone).toBeNull();
  });
});

describe('reassigning a job re-checks the new technician’s diary', () => {
  /**
   * The conflict check ran on create and on reschedule and not on update — so the one
   * operation that changes *who does the work* never asked whether they were free. Moving a
   * job onto an already-booked technician through `PUT /api/appointments/:id` simply
   * succeeded, and that is the path the booking modal's edit mode uses.
   */
  const seedTwoJobs = async () => {
    const ctx = await seedShop();
    const [alpha, beta] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Alpha Jones'),
      createTechnicianRecord(ctx.shop.businessId, 'Beta Smith'),
    ]);

    const slot = localAhead(3, 10 * 60);
    const alphasJob = await book(ctx, alpha._id, slot, { technicianName: 'Alpha Jones' });
    const betasJob = await book(ctx, beta._id, slot, { technicianName: 'Beta Smith' });

    return { ctx, alpha, beta, alphasJob, betasJob };
  };

  it('refuses a reassignment onto a technician already booked at that time', async () => {
    const { ctx, alpha, beta, betasJob } = await seedTwoJobs();

    await expect(
      AppointmentService.updateAppointment(ctx.shop.businessId, betasJob._id.toString(), {
        technicianId: alpha._id.toString(),
      } as any)
    ).rejects.toThrow(/Alpha Jones/);

    // And nothing moved: the job is still Beta's.
    const unchanged = await Appointment.findById(betasJob._id);
    expect(unchanged!.technicianId!.toString()).toBe(beta._id.toString());
    expect(unchanged!.technicianName).toBe('Beta Smith');
  });

  it('allows a reassignment onto someone who is free', async () => {
    const ctx = await seedShop();
    const [alpha, beta] = await Promise.all([
      createTechnicianRecord(ctx.shop.businessId, 'Alpha'),
      createTechnicianRecord(ctx.shop.businessId, 'Beta'),
    ]);

    const job = await book(ctx, alpha._id, localAhead(3, 10 * 60), { technicianName: 'Alpha' });

    const moved = await AppointmentService.updateAppointment(
      ctx.shop.businessId,
      job._id.toString(),
      { technicianId: beta._id.toString() } as any
    );

    expect((moved.technicianId as any)._id?.toString() ?? moved.technicianId!.toString()).toBe(
      beta._id.toString()
    );
  });

  it('does not treat a job as conflicting with itself on an unchanged save', async () => {
    /**
     * The check only fires when the assignment actually changes. Re-saving the edit form
     * without touching the picker must not fail because the job overlaps itself.
     */
    const ctx = await seedShop();
    const alpha = await createTechnicianRecord(ctx.shop.businessId, 'Alpha');
    const job = await book(ctx, alpha._id, localAhead(3, 10 * 60), { technicianName: 'Alpha' });

    const saved = await AppointmentService.updateAppointment(
      ctx.shop.businessId,
      job._id.toString(),
      { technicianId: alpha._id.toString(), internalNotes: 'Bring the long ladder' } as any
    );

    expect(saved.internalNotes).toBe('Bring the long ladder');
  });

  it('allows unassigning a job regardless of who else is busy', async () => {
    // Unassigning frees capacity rather than consuming it, so it cannot conflict.
    const { ctx, betasJob } = await seedTwoJobs();

    const cleared = await AppointmentService.updateAppointment(
      ctx.shop.businessId,
      betasJob._id.toString(),
      { technicianId: null } as any
    );

    expect(cleared.technicianId ?? null).toBeNull();
  });
});

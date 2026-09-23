import { describe, expect, it } from 'vitest';
import { Appointment } from '../../src/models/appointment.model';
import { asUser } from '../helpers/agent';
import { AppointmentService } from '../../src/services/appointment.service';
import { Service } from '../../src/models/service.model';
import {
  createCustomerRecord,
  createStaff,
  createTechnicianRecord,
  createWorkspace,
} from '../helpers/factories';

/**
 * Technician assignment.
 *
 * `Appointment.technicianId` was declared on the schema and read by the field
 * app's job scoping, but no code path ever wrote it — booking copied only the
 * free-text `technicianName`, and there was no UI field at all. Every appointment
 * therefore carried `technicianId: null`, and the scoping filter
 * (`$or: [{ technicianId }, { technicianId: null }]`) treats null as visible.
 *
 * The consequence was that the per-technician scoping shipped earlier was inert:
 * its own tests passed because fixtures set `technicianId` directly, which proved
 * the filter worked, not that anything populated it. These tests close that gap
 * by going through the real booking path.
 */

const bookThrough = async (
  businessId: string,
  extra: Record<string, unknown> = {}
) => {
  const [customer, service] = await Promise.all([
    createCustomerRecord(businessId),
    Service.create({
      businessId,
      name: 'AC Repair',
      category: 'Cooling',
      durationMinutes: 60,
      startingPrice: 200,
      status: 'active',
    }),
  ]);

  return AppointmentService.createAppointment(businessId, {
    customerId: customer._id.toString(),
    serviceId: service._id.toString(),
    startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    ...extra,
  } as any);
};

describe('booking writes technicianId', () => {
  it('persists the assignment and derives the display name', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Jordan Reyes');

    const created = await bookThrough(shop.businessId, {
      technicianId: tech._id.toString(),
    });

    // The regression: this used to be null on every appointment ever created.
    const stored = await Appointment.findById(created._id);
    expect(stored?.technicianId?.toString()).toBe(tech._id.toString());
    // Name is derived from the record, not trusted from the caller.
    expect(stored?.technicianName).toBe('Jordan Reyes');
  });

  it('derives the name from the record even when the caller sends a different one', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Real Name');

    const created = await bookThrough(shop.businessId, {
      technicianId: tech._id.toString(),
      technicianName: 'Someone Else',
    });

    // The id is the source of truth; letting the name disagree is how the
    // denormalised copy drifts away from what the field app scopes on.
    const stored = await Appointment.findById(created._id);
    expect(stored?.technicianName).toBe('Real Name');
  });

  it('leaves the job unassigned when no technician is given', async () => {
    const shop = await createWorkspace();
    const created = await bookThrough(shop.businessId);

    const stored = await Appointment.findById(created._id);
    expect(stored?.technicianId ?? null).toBeNull();
  });

  it('refuses a technician from another business', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const betaTech = await createTechnicianRecord(beta.businessId, 'Beta Tech');

    await expect(
      bookThrough(alpha.businessId, { technicianId: betaTech._id.toString() })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await Appointment.countDocuments({})).toBe(0);
  });

  it('refuses a deactivated technician', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Retired Tech');
    tech.active = false;
    await tech.save();

    await expect(
      bookThrough(shop.businessId, { technicianId: tech._id.toString() })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('still accepts a name alone, for a business with no technician records', async () => {
    const shop = await createWorkspace();
    const created = await bookThrough(shop.businessId, {
      technicianName: 'Contractor Dave',
    });

    const stored = await Appointment.findById(created._id);
    expect(stored?.technicianName).toBe('Contractor Dave');
    expect(stored?.technicianId ?? null).toBeNull();
  });
});

describe('reassignment through the API', () => {
  it('assigns an unassigned job', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Late Assignment');
    const created = await bookThrough(shop.businessId);

    const res = await asUser(shop.ownerToken)
      .put(`/api/appointments/${created._id.toString()}`)
      .send({ technicianId: tech._id.toString() });

    expect(res.status).toBe(200);
    const stored = await Appointment.findById(created._id);
    expect(stored?.technicianId?.toString()).toBe(tech._id.toString());
    expect(stored?.technicianName).toBe('Late Assignment');
  });

  it('unassigns when sent null', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Temporary');
    const created = await bookThrough(shop.businessId, {
      technicianId: tech._id.toString(),
    });

    const res = await asUser(shop.ownerToken)
      .put(`/api/appointments/${created._id.toString()}`)
      .send({ technicianId: null });

    expect(res.status).toBe(200);
    const stored = await Appointment.findById(created._id);
    expect(stored?.technicianId ?? null).toBeNull();
  });

  it('refuses reassignment to another business’s technician', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const betaTech = await createTechnicianRecord(beta.businessId, 'Beta Tech');
    const created = await bookThrough(alpha.businessId);

    const res = await asUser(alpha.ownerToken)
      .put(`/api/appointments/${created._id.toString()}`)
      .send({ technicianId: betaTech._id.toString() });

    expect(res.status).toBe(404);
    expect((await Appointment.findById(created._id))?.technicianId ?? null).toBeNull();
  });

  it('rejects a malformed technicianId before any lookup', async () => {
    const shop = await createWorkspace();
    const created = await bookThrough(shop.businessId);

    const res = await asUser(shop.ownerToken)
      .put(`/api/appointments/${created._id.toString()}`)
      .send({ technicianId: 'not-an-object-id' });

    // The PUT route had no schema at all before this fix.
    expect(res.status).toBe(400);
  });

  it('rejects an empty update body', async () => {
    const shop = await createWorkspace();
    const created = await bookThrough(shop.businessId);

    const res = await asUser(shop.ownerToken)
      .put(`/api/appointments/${created._id.toString()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

/**
 * The payoff. These go through the real booking path rather than setting
 * `technicianId` in a fixture, so they fail if assignment stops being written.
 */
describe('field app scoping now actually narrows', () => {
  it('hides a colleague’s assigned job from a technician', async () => {
    const shop = await createWorkspace();
    const [mine, theirs] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Mine'),
      createTechnicianRecord(shop.businessId, 'Theirs'),
    ]);

    const myJob = await bookThrough(shop.businessId, {
      technicianId: mine._id.toString(),
    });
    // Booked an hour later so it does not collide with the first slot.
    const theirCustomer = await createCustomerRecord(shop.businessId);
    const theirService = await Service.create({
      businessId: shop.businessId,
      name: 'Heating Repair',
      category: 'Heating',
      durationMinutes: 60,
      startingPrice: 300,
      status: 'active',
    });
    const theirJob = await AppointmentService.createAppointment(shop.businessId, {
      customerId: theirCustomer._id.toString(),
      serviceId: theirService._id.toString(),
      startAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      technicianId: theirs._id.toString(),
    } as any);

    const tech = await createStaff(shop.businessId, 'technician', {
      technicianId: mine._id,
    });

    const res = await asUser(tech.token).get('/api/worker/jobs/today');
    expect(res.status).toBe(200);

    const ids = (res.body.jobs || []).map((j: any) => j._id.toString());
    expect(ids).toContain(myJob._id.toString());
    // Before the fix both jobs had technicianId: null, so this assertion failed.
    expect(ids).not.toContain(theirJob._id.toString());
  });

  it('refuses a mutation on a colleague’s assigned job', async () => {
    const shop = await createWorkspace();
    const [mine, theirs] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Mine'),
      createTechnicianRecord(shop.businessId, 'Theirs'),
    ]);

    const theirJob = await bookThrough(shop.businessId, {
      technicianId: theirs._id.toString(),
    });

    const tech = await createStaff(shop.businessId, 'technician', {
      technicianId: mine._id,
    });

    const res = await asUser(tech.token)
      .patch(`/api/worker/jobs/${theirJob._id.toString()}/status`)
      .send({ status: 'completed' });

    expect(res.status).toBe(404);
    expect((await Appointment.findById(theirJob._id))?.status).toBe('scheduled');
  });
});

describe('filtering the board by technician', () => {
  it('filters on the id rather than the name', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Filterable');
    const assigned = await bookThrough(shop.businessId, {
      technicianId: tech._id.toString(),
    });

    const res = await asUser(shop.ownerToken).get(
      `/api/appointments?technicianId=${tech._id.toString()}`
    );

    expect(res.status).toBe(200);
    const ids = (res.body.appointments || []).map((a: any) => a._id.toString());
    expect(ids).toEqual([assigned._id.toString()]);
  });
});

import { describe, expect, it } from 'vitest';
import { Appointment } from '../../src/models/appointment.model';
import { Invoice } from '../../src/models/invoice.model';
import { asAnon, asUser } from '../helpers/agent';
import {
  createAppointment,
  createStaff,
  createTechnicianRecord,
  createWorkspace,
} from '../helpers/factories';

/**
 * Worker endpoints: tenant and per-technician scoping.
 *
 * This is the path a QA pass found a critical hole in. The three job-mutating
 * handlers resolved no businessId at all and the service used an unscoped
 * `Appointment.findById`, so any signed-in account could drive another business's
 * job: change its status, read the customer's name, phone and email back out of
 * the response, and raise a real invoice with a live payment link in that
 * business's name.
 *
 * These tests exist so that regression cannot return silently.
 */
describe('worker endpoints — cross-tenant isolation', () => {
  it('refuses to read, mutate or invoice another business’s job', async () => {
    const alpha = await createWorkspace({ name: 'Alpha Air' });
    const beta = await createWorkspace({ name: 'Beta Boilers' });

    const alphaJob = await createAppointment(alpha.businessId);
    const jobId = alphaJob._id.toString();

    // Beta's owner is fully authenticated — the question is only whether the
    // server scopes by tenant.
    const beta$ = () => asUser(beta.ownerToken);

    const status = await beta$()
      .patch(`/api/worker/jobs/${jobId}/status`)
      .send({ status: 'en_route' });

    const execution = await beta$()
      .patch(`/api/worker/jobs/${jobId}/execution`)
      .send({ internalNotes: 'injected by another tenant' });

    const complete = await beta$()
      .post(`/api/worker/jobs/${jobId}/complete`)
      .send({ additionalLaborHours: 1, laborRate: 150 });

    // 404 rather than 403 on purpose: confirming the id exists but belongs to
    // someone else is itself a disclosure.
    expect(status.status).toBe(404);
    expect(execution.status).toBe(404);
    expect(complete.status).toBe(404);

    // The decisive assertion. A 404 response would be cosmetic if the write had
    // already landed.
    const reloaded = await Appointment.findById(jobId);
    expect(reloaded?.status).toBe('scheduled');
    expect((reloaded as any)?.internalNotes).toBeFalsy();

    // And no invoice was raised in either workspace.
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  it('allows the owning business to do the same operations', async () => {
    const alpha = await createWorkspace();
    const job = await createAppointment(alpha.businessId);

    const res = await asUser(alpha.ownerToken)
      .patch(`/api/worker/jobs/${job._id.toString()}/status`)
      .send({ status: 'en_route' });

    expect(res.status).toBe(200);
    const reloaded = await Appointment.findById(job._id);
    expect(reloaded?.status).toBe('en_route');
  });

  it('rejects unauthenticated callers before any tenant logic runs', async () => {
    const alpha = await createWorkspace();
    const job = await createAppointment(alpha.businessId);

    const res = await asAnon()
      .patch(`/api/worker/jobs/${job._id.toString()}/status`)
      .send({ status: 'en_route' });

    expect(res.status).toBe(401);
  });

  it('does not leak another business’s technician roster', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();

    await createTechnicianRecord(alpha.businessId, 'Alpha Tech');
    await createTechnicianRecord(beta.businessId, 'Beta Tech');

    const res = await asUser(alpha.ownerToken).get('/api/worker/technicians');

    expect(res.status).toBe(200);
    const names = (res.body.technicians || []).map((t: any) => t.name);
    expect(names).toEqual(['Alpha Tech']);
  });
});

/**
 * Per-technician scoping.
 *
 * Business scoping alone still lets one technician act on a colleague's job.
 * Before staff accounts existed this was unobservable, because the worker PWA
 * ran on the owner's session and the "logged-in technician" was a dropdown.
 */
describe('worker endpoints — technician accounts see only their own work', () => {
  it('ignores a technicianId query parameter for technician accounts', async () => {
    const shop = await createWorkspace();
    const [mine, theirs] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Mine'),
      createTechnicianRecord(shop.businessId, 'Theirs'),
    ]);

    const myJob = await createAppointment(shop.businessId, { technicianId: mine._id });
    const theirJob = await createAppointment(shop.businessId, { technicianId: theirs._id });

    const tech = await createStaff(shop.businessId, 'technician', { technicianId: mine._id });

    // Asking for the colleague's jobs explicitly.
    const res = await asUser(tech.token).get(
      `/api/worker/jobs/today?technicianId=${theirs._id.toString()}`
    );

    expect(res.status).toBe(200);
    const ids = (res.body.jobs || []).map((j: any) => j._id.toString());
    expect(ids).toContain(myJob._id.toString());
    expect(ids).not.toContain(theirJob._id.toString());
  });

  it('refuses to mutate a colleague’s job', async () => {
    const shop = await createWorkspace();
    const [mine, theirs] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Mine'),
      createTechnicianRecord(shop.businessId, 'Theirs'),
    ]);

    const theirJob = await createAppointment(shop.businessId, { technicianId: theirs._id });
    const tech = await createStaff(shop.businessId, 'technician', { technicianId: mine._id });

    const res = await asUser(tech.token)
      .patch(`/api/worker/jobs/${theirJob._id.toString()}/status`)
      .send({ status: 'completed' });

    expect(res.status).toBe(404);
    expect((await Appointment.findById(theirJob._id))?.status).toBe('scheduled');
  });

  it('refuses to mutate a colleague’s job even when naming them explicitly', async () => {
    // The read path accepts a technicianId parameter for owners and dispatchers.
    // The mutation path must never honour it, or a technician could name a
    // colleague and edit their jobs. A mutation check found this gap: without
    // this case, reintroducing the parameter on writes went undetected.
    const shop = await createWorkspace();
    const [mine, theirs] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Mine'),
      createTechnicianRecord(shop.businessId, 'Theirs'),
    ]);

    const theirJob = await createAppointment(shop.businessId, { technicianId: theirs._id });
    const tech = await createStaff(shop.businessId, 'technician', { technicianId: mine._id });
    const theirId = theirs._id.toString();

    const status = await asUser(tech.token)
      .patch(`/api/worker/jobs/${theirJob._id.toString()}/status?technicianId=${theirId}`)
      .send({ status: 'completed' });

    const execution = await asUser(tech.token)
      .patch(`/api/worker/jobs/${theirJob._id.toString()}/execution?technicianId=${theirId}`)
      .send({ internalNotes: 'edited by a colleague' });

    const complete = await asUser(tech.token)
      .post(`/api/worker/jobs/${theirJob._id.toString()}/complete?technicianId=${theirId}`)
      .send({ additionalLaborHours: 1, laborRate: 150 });

    expect(status.status).toBe(404);
    expect(execution.status).toBe(404);
    expect(complete.status).toBe(404);

    const reloaded = await Appointment.findById(theirJob._id);
    expect(reloaded?.status).toBe('scheduled');
    expect((reloaded as any)?.internalNotes).toBeFalsy();
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  it('lets a technician act on their own job and on an unassigned one', async () => {
    const shop = await createWorkspace();
    const mine = await createTechnicianRecord(shop.businessId, 'Mine');

    const ownJob = await createAppointment(shop.businessId, { technicianId: mine._id });
    // Unassigned work stays reachable on purpose — the schedule shows it so it
    // can be picked up, and a job nobody may touch is not a useful state.
    const unassigned = await createAppointment(shop.businessId, { technicianId: null });

    const tech = await createStaff(shop.businessId, 'technician', { technicianId: mine._id });

    const own = await asUser(tech.token)
      .patch(`/api/worker/jobs/${ownJob._id.toString()}/status`)
      .send({ status: 'arrived' });
    const free = await asUser(tech.token)
      .patch(`/api/worker/jobs/${unassigned._id.toString()}/status`)
      .send({ status: 'arrived' });

    expect(own.status).toBe(200);
    expect(free.status).toBe(200);
  });

  it('shows a technician only their own record in the roster', async () => {
    const shop = await createWorkspace();
    const [mine] = await Promise.all([
      createTechnicianRecord(shop.businessId, 'Mine'),
      createTechnicianRecord(shop.businessId, 'Colleague'),
    ]);

    const tech = await createStaff(shop.businessId, 'technician', { technicianId: mine._id });
    const res = await asUser(tech.token).get('/api/worker/technicians');

    expect(res.status).toBe(200);
    expect((res.body.technicians || []).map((t: any) => t.name)).toEqual(['Mine']);
  });

  it('refuses rather than showing the whole board when the account has no technician record', async () => {
    const shop = await createWorkspace();
    await createAppointment(shop.businessId);

    // A technician invited before their dispatch record was created.
    const orphan = await createStaff(shop.businessId, 'technician', { technicianId: null });

    const res = await asUser(orphan.token).get('/api/worker/jobs/today');

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not linked to a technician record/i);
  });

  it('lets a dispatcher filter the board by any technician', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId, 'Any Tech');
    const job = await createAppointment(shop.businessId, { technicianId: tech._id });

    const dispatcher = await createStaff(shop.businessId, 'dispatcher');

    const res = await asUser(dispatcher.token).get(
      `/api/worker/jobs/today?technicianId=${tech._id.toString()}`
    );

    expect(res.status).toBe(200);
    expect((res.body.jobs || []).map((j: any) => j._id.toString())).toContain(
      job._id.toString()
    );
  });
});

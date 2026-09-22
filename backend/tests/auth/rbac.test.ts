import { describe, expect, it } from 'vitest';
import { asAnon, asUser } from '../helpers/agent';
import { User } from '../../src/models/user.model';
import { Business } from '../../src/models/business.model';
import {
  createStaff,
  createUser,
  createWorkspace,
  tokenFor,
} from '../helpers/factories';

/**
 * Tenant-level RBAC.
 *
 * The problem this exists to solve: a contractor's dispatcher and technicians had
 * to share the owner's login, which meant anyone who could mark a job complete
 * could also open the Stripe billing portal, change the subscription and read the
 * company's payment details.
 *
 * Two separate role axes are under test. `user.role` ('user' | 'admin') is
 * PLATFORM scope — BlueCollar AI staff. `user.businessRole` ('owner' |
 * 'dispatcher' | 'technician') is TENANT scope. Conflating them is how privilege
 * escalation bugs get written, so both are asserted independently.
 */

describe('billing is owner-only', () => {
  it('lets the owner read their subscription', async () => {
    const shop = await createWorkspace();
    const res = await asUser(shop.ownerToken).get('/api/billing/subscription');
    expect(res.status).toBe(200);
  });

  it.each([
    ['dispatcher' as const],
    ['technician' as const],
  ])('refuses %s access to the subscription', async (role) => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, role);

    const res = await asUser(staff.token).get('/api/billing/subscription');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  it.each([
    ['dispatcher' as const],
    ['technician' as const],
  ])('refuses %s the Stripe billing portal', async (role) => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, role);

    const res = await asUser(staff.token).post('/api/billing/portal').send({});
    expect(res.status).toBe(403);
  });

  it.each([
    ['dispatcher' as const],
    ['technician' as const],
  ])('refuses %s a checkout session', async (role) => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, role);

    const res = await asUser(staff.token)
      .post('/api/billing/checkout')
      .send({ tier: 'enterprise', interval: 'month' });

    expect(res.status).toBe(403);
  });

  it('still requires authentication at all', async () => {
    const res = await asAnon().get('/api/billing/subscription');
    expect(res.status).toBe(401);
  });
});

describe('business profile — readable by members, writable by the owner', () => {
  it('lets a dispatcher read the workspace', async () => {
    // Before membership resolution existed this returned null for staff, which
    // the frontend reads as "onboarding unfinished" and would bounce a staff
    // member into the owner's setup wizard.
    const shop = await createWorkspace({ name: 'Readable Shop' });
    const staff = await createStaff(shop.businessId, 'dispatcher');

    const res = await asUser(staff.token).get('/api/business/me');

    expect(res.status).toBe(200);
    expect(res.body.business?.name).toBe('Readable Shop');
  });

  it('refuses a dispatcher editing the company profile', async () => {
    const shop = await createWorkspace({ name: 'Original Name' });
    const staff = await createStaff(shop.businessId, 'dispatcher');

    const res = await asUser(staff.token)
      .patch('/api/business/me')
      .send({ name: 'Renamed By Staff' });

    expect(res.status).toBe(403);
    const reloaded = await Business.findById(shop.businessId);
    expect(reloaded?.name).toBe('Original Name');
  });

  it('does not let a staff member create a second workspace of their own', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'technician');

    // The owner-scoped upsert would otherwise find no business for this user and
    // cheerfully create one with them as its owner.
    const res = await asUser(staff.token)
      .post('/api/business')
      .send({ name: 'Technician Side Business' });

    expect(res.status).toBe(403);
    expect(await Business.countDocuments({})).toBe(1);
  });
});

describe('team management is owner-only', () => {
  it('lets the owner list members', async () => {
    const shop = await createWorkspace();
    await createStaff(shop.businessId, 'dispatcher');

    const res = await asUser(shop.ownerToken).get('/api/team/members');

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
  });

  it.each([
    ['dispatcher' as const],
    ['technician' as const],
  ])('refuses %s listing members', async (role) => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, role);

    const res = await asUser(staff.token).get('/api/team/members');
    expect(res.status).toBe(403);
  });

  it('refuses a dispatcher inviting anyone', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'dispatcher');

    const res = await asUser(staff.token)
      .post('/api/team/invites')
      .send({ email: 'accomplice@example.com', businessRole: 'dispatcher' });

    expect(res.status).toBe(403);
  });

  it('refuses a technician promoting themselves', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'technician');

    const res = await asUser(staff.token)
      .patch(`/api/team/members/${staff.user._id.toString()}`)
      .send({ businessRole: 'owner' });

    expect(res.status).toBe(403);

    const reloaded = await User.findById(staff.user._id);
    expect(reloaded?.businessRole).toBe('technician');
  });

  it('does not let one workspace read another’s members', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    await createStaff(beta.businessId, 'dispatcher', { email: 'beta-staff@example.com' });

    const res = await asUser(alpha.ownerToken).get('/api/team/members');

    expect(res.status).toBe(200);
    const emails = (res.body.members || []).map((m: any) => m.email);
    expect(emails).toEqual([alpha.owner.email]);
  });

  it('does not let one owner modify another workspace’s member', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const betaStaff = await createStaff(beta.businessId, 'dispatcher');

    const res = await asUser(alpha.ownerToken)
      .patch(`/api/team/members/${betaStaff.user._id.toString()}`)
      .send({ isActive: false });

    // 404 not 403: confirming the account exists in a workspace the caller cannot
    // see is itself a disclosure.
    expect(res.status).toBe(404);
    expect((await User.findById(betaStaff.user._id))?.isActive).toBe(true);
  });

  it('refuses to modify or remove the owner', async () => {
    const shop = await createWorkspace();
    const ownerId = shop.owner._id.toString();

    const demote = await asUser(shop.ownerToken)
      .patch(`/api/team/members/${ownerId}`)
      .send({ businessRole: 'dispatcher' });
    const remove = await asUser(shop.ownerToken).delete(`/api/team/members/${ownerId}`);

    // Self-edit is blocked first: an owner who could demote themselves would lock
    // the workspace out of its own billing with no way back.
    expect(demote.status).toBe(400);
    expect(remove.status).toBe(400);
    expect((await User.findById(ownerId))?.businessRole).toBe('owner');
  });
});

describe('platform-operator role is separate from workspace role', () => {
  it('does not grant a workspace owner access to platform endpoints', async () => {
    const shop = await createWorkspace();

    // Owning a business is not the same as being BlueCollar AI staff.
    const res = await asUser(shop.ownerToken).get('/api/demo-requests');

    expect([401, 403]).toContain(res.status);
  });

  it('does not grant a platform admin a workspace', async () => {
    const admin = await createUser({ email: 'ops@bluecollar.ai', role: 'admin' });

    // A platform admin belongs to no workspace, so tenant endpoints must not
    // silently resolve one for them.
    const res = await asUser(tokenFor(admin)).get('/api/team/members');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/business profile/i);
  });
});

describe('membership resolution', () => {
  it('backfills an owner who predates the businessId field', async () => {
    // Legacy shape: Business.ownerId points at the user, but the user has no
    // businessId. The resolver must fill it in from the authoritative ownership
    // row rather than treating them as workspace-less.
    const owner = await createUser({ email: 'legacy-owner@example.com' });
    const business = await Business.create({
      ownerId: owner._id,
      name: 'Legacy Shop',
      businessType: 'HVAC',
      onboardingStatus: 'completed',
      onboardingStep: 'completed',
    });

    expect(owner.businessId).toBeNull();

    const res = await asUser(tokenFor(owner)).get('/api/team/members');
    expect(res.status).toBe(200);

    const reloaded = await User.findById(owner._id);
    expect(reloaded?.businessId?.toString()).toBe(business._id.toString());
    expect(reloaded?.businessRole).toBe('owner');
  });

  it('tells an owner with no workspace to finish onboarding', async () => {
    const fresh = await createUser({ email: 'not-onboarded@example.com' });

    const res = await asUser(tokenFor(fresh)).get('/api/appointments');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/business profile/i);
  });

  it('rejects a deactivated member immediately', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'dispatcher');

    await User.updateOne({ _id: staff.user._id }, { $set: { isActive: false } });

    // Role and membership are read from the database on every request rather than
    // trusted from the token, so this takes effect at once instead of whenever
    // the access token expires.
    const res = await asUser(staff.token).get('/api/business/me');
    expect(res.status).toBe(401);
  });

  it('applies a demotion on the very next request', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'dispatcher');

    // Still a dispatcher: can read the workspace.
    expect((await asUser(staff.token).get('/api/business/me')).status).toBe(200);

    await User.updateOne(
      { _id: staff.user._id },
      { $set: { businessRole: 'technician' } }
    );

    // The same token now carries technician authority, without being reissued.
    const res = await asUser(staff.token).get('/api/worker/jobs/today');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not linked to a technician record/i);
  });
});

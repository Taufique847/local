import { describe, expect, it, vi, beforeEach } from 'vitest';
import { asAnon, asUser } from '../helpers/agent';
import { User } from '../../src/models/user.model';
import { StaffInvite } from '../../src/models/staff-invite.model';
import { EmailService } from '../../src/services/email.service';
import {
  createStaff,
  createTechnicianRecord,
  createWorkspace,
} from '../helpers/factories';

/**
 * Staff invitations.
 *
 * The invitation token is what lets someone create an account inside a workspace
 * they do not yet belong to, so it is the one place a stranger can be granted
 * tenant access. Everything here is about making sure that grant is exactly as
 * wide as intended and no wider.
 */

let sentEmails: Array<{ to: string; subject: string; text: string }>;

beforeEach(() => {
  sentEmails = [];
  vi.spyOn(EmailService, 'send').mockImplementation(async (message: any) => {
    sentEmails.push(message);
    return { id: 'stubbed' };
  });
});

const inviteTokenFromEmail = (): string => {
  const match = sentEmails[sentEmails.length - 1]?.text.match(/accept-invite\?token=([^\s]+)/);
  if (!match) throw new Error('No invite link was emailed');
  return decodeURIComponent(match[1]);
};

const invite = (ownerToken: string, body: Record<string, unknown>) =>
  asUser(ownerToken).post('/api/team/invites').send(body);

describe('creating invitations', () => {
  it('emails a dispatcher invitation', async () => {
    const shop = await createWorkspace({ name: 'Invite Shop' });

    const res = await invite(shop.ownerToken, {
      email: 'newhire@example.com',
      name: 'New Hire',
      businessRole: 'dispatcher',
    });

    expect(res.status).toBe(201);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('newhire@example.com');
    expect(sentEmails[0].subject).toContain('Invite Shop');
  });

  it('refuses to create a second owner', async () => {
    // A second owner could remove the first, so ownership transfer is
    // deliberately not an invite-shaped operation.
    const shop = await createWorkspace();

    const res = await invite(shop.ownerToken, {
      email: 'coowner@example.com',
      businessRole: 'owner',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only have one owner/i);
    expect(await StaffInvite.countDocuments({})).toBe(0);
  });

  it('refuses an address that already has an account', async () => {
    const shop = await createWorkspace();
    const existing = await createStaff(shop.businessId, 'dispatcher', {
      email: 'already@example.com',
    });
    expect(existing.user).toBeTruthy();

    const res = await invite(shop.ownerToken, {
      email: 'already@example.com',
      businessRole: 'technician',
    });

    expect(res.status).toBe(409);
  });

  it('refuses to bind an invite to another workspace’s technician record', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const betaTech = await createTechnicianRecord(beta.businessId, 'Beta Tech');

    const res = await invite(alpha.ownerToken, {
      email: 'crosslink@example.com',
      businessRole: 'technician',
      technicianId: betaTech._id.toString(),
    });

    expect(res.status).toBe(404);
    expect(await StaffInvite.countDocuments({})).toBe(0);
  });

  it('creates nothing when the invitation cannot be emailed', async () => {
    // Keeping a row whose email never arrived produces an invitation the owner can
    // see but nobody can accept, and re-inviting would then collide with it.
    const shop = await createWorkspace();
    vi.spyOn(EmailService, 'send').mockRejectedValue(new Error('provider down'));

    const res = await invite(shop.ownerToken, {
      email: 'never-arrives@example.com',
      businessRole: 'dispatcher',
    });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await StaffInvite.countDocuments({})).toBe(0);
  });

  it('supersedes an earlier invitation to the same address', async () => {
    const shop = await createWorkspace();

    await invite(shop.ownerToken, { email: 'twice@example.com', businessRole: 'dispatcher' });
    const firstToken = inviteTokenFromEmail();

    await invite(shop.ownerToken, { email: 'twice@example.com', businessRole: 'technician' });
    const secondToken = inviteTokenFromEmail();

    expect(secondToken).not.toBe(firstToken);

    const stale = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token: firstToken, name: 'Too Late', password: 'a-valid-password' });
    expect(stale.status).toBe(400);
  });
});

describe('accepting invitations', () => {
  const sendInvite = async (
    ownerToken: string,
    body: Record<string, unknown>
  ): Promise<string> => {
    const res = await invite(ownerToken, body);
    expect(res.status).toBe(201);
    return inviteTokenFromEmail();
  };

  it('creates a member bound to the inviting workspace and signs them in', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'accepts@example.com',
      businessRole: 'dispatcher',
    });

    const res = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token, name: 'Accepting Person', password: 'a-valid-password' });

    expect(res.status).toBe(201);
    expect(res.body.user?.businessRole).toBe('dispatcher');
    expect(res.body.user?.businessId).toBe(shop.businessId);

    // Signed in, so the response set the session cookies.
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toMatch(/auth_token=/);

    const created = await User.findOne({ email: 'accepts@example.com' });
    expect(created?.businessId?.toString()).toBe(shop.businessId);
    // Possession of a token sent only to that address is the same proof a
    // verification email asks for, so they are not made to do it twice.
    expect(created?.emailVerifiedAt).toBeTruthy();
    // Platform role stays 'user' — a workspace invite must never confer
    // BlueCollar-AI-operator privileges.
    expect(created?.role).toBe('user');
  });

  it('ignores any email supplied by the invitee', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'intended@example.com',
      businessRole: 'dispatcher',
    });

    await asAnon().post('/api/team/invites/accept').send({
      token,
      name: 'Redirector',
      password: 'a-valid-password',
      email: 'attacker@example.com',
    });

    expect(await User.findOne({ email: 'attacker@example.com' })).toBeNull();
    expect(await User.findOne({ email: 'intended@example.com' })).toBeTruthy();
  });

  it('ignores a role supplied by the invitee', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'modest@example.com',
      businessRole: 'technician',
    });

    await asAnon().post('/api/team/invites/accept').send({
      token,
      name: 'Ambitious Person',
      password: 'a-valid-password',
      businessRole: 'owner',
    });

    const created = await User.findOne({ email: 'modest@example.com' });
    expect(created?.businessRole).toBe('technician');
  });

  it('is single use', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'oneshot@example.com',
      businessRole: 'dispatcher',
    });

    const first = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token, name: 'First Person', password: 'a-valid-password' });
    const second = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token, name: 'Second Person', password: 'a-valid-password' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(400);
    expect(await User.countDocuments({ email: 'oneshot@example.com' })).toBe(1);
  });

  it('rejects a revoked invitation', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'revoked@example.com',
      businessRole: 'dispatcher',
    });

    const list = await asUser(shop.ownerToken).get('/api/team/invites');
    const inviteId = list.body.invites[0].id;
    expect((await asUser(shop.ownerToken).delete(`/api/team/invites/${inviteId}`)).status).toBe(200);

    const res = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token, name: 'Revoked Person', password: 'a-valid-password' });

    expect(res.status).toBe(400);
    expect(await User.findOne({ email: 'revoked@example.com' })).toBeNull();
  });

  it('rejects an expired invitation', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'lapsed@example.com',
      businessRole: 'dispatcher',
    });

    await StaffInvite.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token, name: 'Lapsed Person', password: 'a-valid-password' });

    expect(res.status).toBe(400);
  });

  it('rejects a forged token', async () => {
    const res = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token: 'z'.repeat(64), name: 'Forger', password: 'a-valid-password' });

    expect(res.status).toBe(400);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('peeks without consuming, so reloading the page does not burn the invite', async () => {
    const shop = await createWorkspace({ name: 'Peek Shop' });
    const token = await sendInvite(shop.ownerToken, {
      email: 'peeker@example.com',
      businessRole: 'technician',
    });

    const first = await asAnon().get(`/api/team/invites/peek?token=${encodeURIComponent(token)}`);
    const second = await asAnon().get(`/api/team/invites/peek?token=${encodeURIComponent(token)}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.invite.businessName).toBe('Peek Shop');
    expect(first.body.invite.email).toBe('peeker@example.com');

    const accept = await asAnon()
      .post('/api/team/invites/accept')
      .send({ token, name: 'Peeker Person', password: 'a-valid-password' });
    expect(accept.status).toBe(201);
  });

  it('does not leak the workspace id when peeking', async () => {
    const shop = await createWorkspace();
    const token = await sendInvite(shop.ownerToken, {
      email: 'minimal@example.com',
      businessRole: 'dispatcher',
    });

    const res = await asAnon().get(`/api/team/invites/peek?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(shop.businessId);
  });
});

describe('removing and suspending members', () => {
  it('signs a suspended member out immediately', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'dispatcher');

    expect((await asUser(staff.token).get('/api/business/me')).status).toBe(200);

    const res = await asUser(shop.ownerToken)
      .patch(`/api/team/members/${staff.user._id.toString()}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);

    expect((await asUser(staff.token).get('/api/business/me')).status).toBe(401);
  });

  it('detaches a removed member from the workspace', async () => {
    const shop = await createWorkspace();
    const staff = await createStaff(shop.businessId, 'technician');

    const res = await asUser(shop.ownerToken).delete(
      `/api/team/members/${staff.user._id.toString()}`
    );
    expect(res.status).toBe(200);

    // The row is kept and detached rather than deleted, because audit trails
    // elsewhere reference the id.
    const reloaded = await User.findById(staff.user._id);
    expect(reloaded).toBeTruthy();
    expect(reloaded?.businessId).toBeNull();
    expect(reloaded?.businessRole).toBeNull();
    expect(reloaded?.isActive).toBe(false);
  });

  it('drops the technician link when the role changes away from technician', async () => {
    const shop = await createWorkspace();
    const tech = await createTechnicianRecord(shop.businessId);
    const staff = await createStaff(shop.businessId, 'technician', {
      technicianId: tech._id,
    });

    await asUser(shop.ownerToken)
      .patch(`/api/team/members/${staff.user._id.toString()}`)
      .send({ businessRole: 'dispatcher' });

    // Otherwise the field app would scope a dispatcher to one person's jobs.
    const reloaded = await User.findById(staff.user._id);
    expect(reloaded?.businessRole).toBe('dispatcher');
    expect(reloaded?.technicianId).toBeNull();
  });
});

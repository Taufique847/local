import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { asAnon, asUser } from '../helpers/agent';
import { User } from '../../src/models/user.model';
import { PasswordReset } from '../../src/models/password-reset.model';
import { RefreshToken } from '../../src/models/refresh-token.model';
import { EmailService } from '../../src/services/email.service';
import { hashRefreshToken } from '../../src/utils/token';
import { PASSWORD, createUser, tokenFor } from '../helpers/factories';

/**
 * Password recovery.
 *
 * Until now there was no recovery path at all: a user who forgot their password
 * was permanently locked out of their own business.
 *
 * EmailService is stubbed rather than configured, because these tests are about
 * the token lifecycle and the enumeration behaviour, not about Resend. The stub
 * also captures the emailed link, which is the only place the raw token exists —
 * the database stores a SHA-256 of it.
 */

let sentEmails: Array<{ to: string; subject: string; text: string }>;

const captureEmails = () => {
  sentEmails = [];
  return vi.spyOn(EmailService, 'send').mockImplementation(async (message: any) => {
    sentEmails.push(message);
    return { id: 'stubbed' };
  });
};

/** Pulls the raw token out of the link in the captured email. */
const tokenFromEmail = (): string => {
  const match = sentEmails[sentEmails.length - 1]?.text.match(
    /reset-password\?token=([^\s]+)/
  );
  if (!match) throw new Error('No reset link was emailed');
  return decodeURIComponent(match[1]);
};

beforeEach(() => {
  captureEmails();
});

describe('POST /api/auth/forgot-password', () => {
  it('emails a link to a registered address', async () => {
    const user = await createUser({ email: 'locked-out@example.com' });

    const res = await asAnon()
      .post('/api/auth/forgot-password')
      .send({ email: 'locked-out@example.com' });

    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('locked-out@example.com');
    expect(await PasswordReset.countDocuments({ userId: user._id })).toBe(1);
  });

  it('answers identically for an unregistered address and sends nothing', async () => {
    // An endpoint that reported "no such account" would be a free membership
    // oracle for anyone holding a list of email addresses.
    const known = await asAnon()
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(sentEmails).toHaveLength(0);
    expect(await PasswordReset.countDocuments({})).toBe(0);
  });

  it('gives a byte-identical response for registered and unregistered addresses', async () => {
    await createUser({ email: 'real@example.com' });

    const real = await asAnon()
      .post('/api/auth/forgot-password')
      .send({ email: 'real@example.com' });
    const fake = await asAnon()
      .post('/api/auth/forgot-password')
      .send({ email: 'fake@example.com' });

    expect(real.status).toBe(fake.status);
    expect(real.body).toEqual(fake.body);
  });

  it('never stores the usable token', async () => {
    await createUser({ email: 'hashed@example.com' });
    await asAnon().post('/api/auth/forgot-password').send({ email: 'hashed@example.com' });

    const raw = tokenFromEmail();
    const record = await PasswordReset.findOne({});

    expect(record?.tokenHash).toBe(hashRefreshToken(raw));
    expect(record?.tokenHash).not.toBe(raw);
  });

  it('invalidates an earlier link when a new one is requested', async () => {
    await createUser({ email: 'twice@example.com' });

    await asAnon().post('/api/auth/forgot-password').send({ email: 'twice@example.com' });
    const firstToken = tokenFromEmail();

    await asAnon().post('/api/auth/forgot-password').send({ email: 'twice@example.com' });
    const secondToken = tokenFromEmail();
    expect(secondToken).not.toBe(firstToken);

    const stale = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token: firstToken, password: 'a-brand-new-password' });
    expect(stale.status).toBe(400);

    const fresh = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token: secondToken, password: 'a-brand-new-password' });
    expect(fresh.status).toBe(200);
  });

  it('still answers 200 when the email provider fails', async () => {
    // Propagating the provider error would restore the enumeration oracle: a
    // registered address would fail loudly while an unknown one returned 200.
    await createUser({ email: 'provider-down@example.com' });
    vi.spyOn(EmailService, 'send').mockRejectedValue(new Error('provider exploded'));

    const res = await asAnon()
      .post('/api/auth/forgot-password')
      .send({ email: 'provider-down@example.com' });

    expect(res.status).toBe(200);
  });

  it('rejects a malformed email before doing any work', async () => {
    const res = await asAnon().post('/api/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  const requestReset = async (email: string) => {
    await asAnon().post('/api/auth/forgot-password').send({ email });
    return tokenFromEmail();
  };

  it('changes the password and lets the new one log in', async () => {
    const user = await createUser({ email: 'resetme@example.com' });
    const token = await requestReset('resetme@example.com');

    const res = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'my-new-passphrase' });

    expect(res.status).toBe(200);

    const reloaded = await User.findById(user._id).select('+passwordHash');
    expect(await bcrypt.compare('my-new-passphrase', reloaded!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(PASSWORD, reloaded!.passwordHash)).toBe(false);

    const login = await asAnon()
      .post('/api/auth/login')
      .send({ email: 'resetme@example.com', password: 'my-new-passphrase' });
    expect(login.status).toBe(200);
  });

  it('is single use', async () => {
    await createUser({ email: 'once@example.com' });
    const token = await requestReset('once@example.com');

    const first = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'first-new-password' });
    const second = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'second-new-password' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });

  it('rejects an expired link', async () => {
    const user = await createUser({ email: 'expired@example.com' });
    const token = await requestReset('expired@example.com');

    await PasswordReset.updateOne(
      { userId: user._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'too-late-for-this' });

    expect(res.status).toBe(400);
  });

  it('rejects an unknown token with the same message as an expired one', async () => {
    const res = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token: 'x'.repeat(64), password: 'does-not-matter-here' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it('stops working if the account email changed after the link was issued', async () => {
    const user = await createUser({ email: 'old-address@example.com' });
    const token = await requestReset('old-address@example.com');

    // Proving control of the old address says nothing about the new one.
    await User.updateOne({ _id: user._id }, { $set: { email: 'new-address@example.com' } });

    const res = await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'should-not-apply' });

    expect(res.status).toBe(400);
  });

  it('revokes every existing session', async () => {
    const user = await createUser({ email: 'sessions@example.com' });

    // A live session, as an attacker who already got in would have.
    const login = await asAnon()
      .post('/api/auth/login')
      .send({ email: 'sessions@example.com', password: PASSWORD });
    expect(login.status).toBe(200);

    // One live refresh token now exists. `revokedAt` is absent rather than null
    // on an active row, so the check uses $exists.
    expect(
      await RefreshToken.countDocuments({ userId: user._id, revokedAt: { $exists: false } })
    ).toBe(1);

    const before = await User.findById(user._id);
    const staleAccessToken = tokenFor(before);
    expect((await asUser(staleAccessToken).get('/api/auth/me')).status).toBe(200);

    const token = await requestReset('sessions@example.com');
    await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'kick-everyone-out' });

    // tokenVersion was bumped, so the previously valid access token is dead.
    const res = await asUser(staleAccessToken).get('/api/auth/me');
    expect(res.status).toBe(401);

    const live = await RefreshToken.countDocuments({
      userId: user._id,
      revokedAt: { $exists: false },
    });
    expect(live).toBe(0);
  });

  it('rejects a password below the minimum length', async () => {
    await createUser({ email: 'weak@example.com' });
    const token = await requestReset('weak@example.com');

    const res = await asAnon().post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('verifies the address as a side effect', async () => {
    // Otherwise an unverified account could reset its password and still be
    // unable to log in when REQUIRE_EMAIL_VERIFICATION is on.
    const user = await createUser({ email: 'unverified@example.com', emailVerified: false });
    expect(user.emailVerifiedAt).toBeNull();

    const token = await requestReset('unverified@example.com');
    await asAnon()
      .post('/api/auth/reset-password')
      .send({ token, password: 'now-i-am-verified' });

    expect((await User.findById(user._id))?.emailVerifiedAt).toBeTruthy();
  });
});

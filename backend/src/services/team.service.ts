import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { StaffInvite } from '../models/staff-invite.model';
import { Technician } from '../models/technician.model';
import { Business } from '../models/business.model';
import { RefreshToken } from '../models/refresh-token.model';
import { EmailService } from './email.service';
import {
  BusinessRole,
  BUSINESS_ROLES,
  StaffInviteDTO,
  StaffInviteStatus,
  TeamMemberDTO,
  IUser,
} from '../types/auth.types';
import { AppError } from '../types';
import { generateRefreshToken, hashRefreshToken } from '../utils/token';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'team' });

/** Same bcrypt cost the signup path uses. Kept in sync deliberately. */
const BCRYPT_ROUNDS = 12;

export class TeamService {
  private static readonly INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  /** Guards against an invite list growing without bound on a free trial. */
  private static readonly MAX_PENDING_INVITES = 25;

  private static inviteStatus(invite: {
    consumedAt?: Date;
    revokedAt?: Date;
    expiresAt: Date;
  }): StaffInviteStatus {
    if (invite.consumedAt) return 'accepted';
    if (invite.revokedAt) return 'revoked';
    if (invite.expiresAt.getTime() <= Date.now()) return 'expired';
    return 'pending';
  }

  private static memberDto(user: IUser, callerId: string): TeamMemberDTO {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      businessRole: (user.businessRole as BusinessRole) || 'owner',
      technicianId: user.technicianId ? user.technicianId.toString() : null,
      isActive: user.isActive,
      emailVerified: Boolean(user.emailVerifiedAt),
      isSelf: user._id.toString() === callerId,
      createdAt: user.createdAt,
    };
  }

  public static async listMembers(
    businessId: string,
    callerId: string
  ): Promise<TeamMemberDTO[]> {
    const users = await User.find({ businessId }).sort({ createdAt: 1 });
    return users.map((u) => this.memberDto(u, callerId));
  }

  public static async listInvites(businessId: string): Promise<StaffInviteDTO[]> {
    const invites = await StaffInvite.find({ businessId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate<{ invitedByUserId: { name?: string } }>('invitedByUserId', 'name');

    return invites.map((i) => ({
      id: i._id.toString(),
      email: i.email,
      name: i.name,
      businessRole: i.businessRole,
      status: this.inviteStatus(i),
      technicianId: i.technicianId ? i.technicianId.toString() : null,
      invitedByName: (i.invitedByUserId as any)?.name,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));
  }

  /**
   * Creates an invitation and emails the link.
   *
   * Note the ordering: the invite row is written first and the email is sent
   * second, and a send failure deletes the row. The alternative — keeping a row
   * whose email never arrived — produces an invitation the owner can see in the
   * UI but nobody can ever accept, and re-inviting would then collide with it.
   */
  public static async createInvite(
    businessId: string,
    invitedByUserId: string,
    input: { email?: string; name?: string; businessRole?: string; technicianId?: string }
  ): Promise<{ invite: StaffInviteDTO; emailSent: boolean }> {
    const email = (input.email || '').toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('A valid email address is required to send an invitation.', 400);
    }

    const businessRole = (input.businessRole || '').trim() as BusinessRole;
    if (!BUSINESS_ROLES.includes(businessRole)) {
      throw new AppError(
        `Role must be one of: ${BUSINESS_ROLES.join(', ')}.`,
        400
      );
    }

    // A second owner would be able to remove the first, so ownership transfer is
    // deliberately not an invite-shaped operation.
    if (businessRole === 'owner') {
      throw new AppError(
        'A workspace can only have one owner. Invite a dispatcher or a technician instead.',
        400
      );
    }

    // Email is globally unique on User, so an address already in use cannot
    // become a second account. Saying so plainly is fine here: the caller is an
    // authenticated owner, not an anonymous visitor, so this is not an
    // enumeration oracle.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.businessId?.toString() === businessId) {
        throw new AppError('That person is already part of your team.', 409);
      }
      throw new AppError(
        'An account with that email address already exists, so it cannot be invited.',
        409
      );
    }

    const pendingCount = await StaffInvite.countDocuments({
      businessId,
      consumedAt: { $exists: false },
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (pendingCount >= this.MAX_PENDING_INVITES) {
      throw new AppError(
        `You already have ${this.MAX_PENDING_INVITES} invitations outstanding. Revoke one before sending another.`,
        409
      );
    }

    let technicianId: Types.ObjectId | null = null;
    if (input.technicianId) {
      if (!Types.ObjectId.isValid(input.technicianId)) {
        throw new AppError('That technician record could not be found.', 400);
      }
      // Scoped to the workspace: without this an owner could bind their new
      // staff account to another company's technician record.
      const tech = await Technician.findOne({
        _id: input.technicianId,
        businessId,
      }).select('_id');
      if (!tech) {
        throw new AppError('That technician record could not be found.', 404);
      }
      technicianId = tech._id;
    }

    // Supersede any outstanding invite for this address so only the newest link
    // works — the same reason verification emails invalidate their predecessors.
    await StaffInvite.updateMany(
      {
        businessId,
        email,
        consumedAt: { $exists: false },
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } }
    );

    const rawToken = generateRefreshToken();

    const invite = await StaffInvite.create({
      businessId,
      tokenHash: hashRefreshToken(rawToken),
      email,
      name: input.name?.trim() || undefined,
      businessRole,
      technicianId,
      invitedByUserId,
      expiresAt: new Date(Date.now() + this.INVITE_TTL_MS),
    });

    const business = await Business.findById(businessId).select('name').lean();
    const businessName = business?.name || 'your team';
    const link = `${config.frontendUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;

    try {
      await EmailService.send({
        to: email,
        subject: `You have been invited to join ${businessName}`,
        text: [
          input.name?.trim() ? `Hi ${input.name.trim()},` : 'Hello,',
          '',
          `You have been invited to join ${businessName} on BlueCollar AI as a ${businessRole}.`,
          '',
          'Set up your account here:',
          link,
          '',
          'This invitation expires in 7 days.',
        ].join('\n'),
      });
    } catch (err: any) {
      // Roll back rather than leave an unacceptable invitation behind.
      await StaffInvite.deleteOne({ _id: invite._id });
      log.error('staff_invite_email_failed', {
        businessId,
        email,
        reason: err?.message,
      });
      throw new AppError(
        'The invitation could not be emailed, so it was not created. Check the email settings and try again.',
        err?.statusCode === 503 ? 503 : 502
      );
    }

    log.info('staff_invite_created', { businessId, email, businessRole });

    return {
      invite: {
        id: invite._id.toString(),
        email: invite.email,
        name: invite.name,
        businessRole: invite.businessRole,
        status: 'pending',
        technicianId: technicianId ? technicianId.toString() : null,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
      emailSent: true,
    };
  }

  public static async revokeInvite(businessId: string, inviteId: string): Promise<void> {
    if (!Types.ObjectId.isValid(inviteId)) {
      throw new AppError('Invitation not found.', 404);
    }

    // Scoped by businessId so one workspace cannot revoke another's invitations.
    const result = await StaffInvite.updateOne(
      {
        _id: inviteId,
        businessId,
        consumedAt: { $exists: false },
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      throw new AppError('Invitation not found, or it has already been used.', 404);
    }

    log.info('staff_invite_revoked', { businessId, inviteId });
  }

  /**
   * Reads an invitation without consuming it, so the acceptance page can show
   * who invited whom before asking for a password.
   *
   * Returns only what the invitee already knows or needs: their own address, the
   * role, and the workspace name. Not the inviter's email, not the workspace id.
   */
  public static async peekInvite(rawToken: string): Promise<{
    email: string;
    name?: string;
    businessRole: BusinessRole;
    businessName: string;
  }> {
    const invite = await this.findUsableInvite(rawToken);
    const business = await Business.findById(invite.businessId).select('name').lean();

    return {
      email: invite.email,
      name: invite.name,
      businessRole: invite.businessRole,
      businessName: business?.name || 'this workspace',
    };
  }

  private static async findUsableInvite(rawToken: string) {
    if (!rawToken) {
      throw new AppError('This invitation link is invalid.', 400);
    }

    const invite = await StaffInvite.findOne({ tokenHash: hashRefreshToken(rawToken) });

    // One message for every failure mode, so the response cannot be used to
    // distinguish "never existed" from "already used".
    if (
      !invite ||
      invite.consumedAt ||
      invite.revokedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      throw new AppError('This invitation link is invalid or has expired.', 400);
    }

    return invite;
  }

  /**
   * Turns an invitation into a real account.
   *
   * The created user is marked email-verified: possession of a token that was
   * only ever sent to that address is the same proof a verification email asks
   * for, and making them verify twice would be pure friction.
   */
  public static async acceptInvite(input: {
    token?: string;
    name?: string;
    password?: string;
  }): Promise<IUser> {
    const invite = await this.findUsableInvite(input.token || '');

    const name = (input.name || invite.name || '').trim();
    if (!name) {
      throw new AppError('Your name is required.', 400);
    }
    if (!input.password || input.password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    // Re-checked at acceptance, not just at invite time: the address may have
    // been registered in the days since the invitation was sent.
    const existing = await User.findOne({ email: invite.email });
    if (existing) {
      throw new AppError(
        'An account with this email address already exists. Please log in instead.',
        409
      );
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await User.create({
      name,
      email: invite.email,
      passwordHash,
      role: 'user',
      businessId: invite.businessId,
      businessRole: invite.businessRole,
      technicianId: invite.technicianId || null,
      isActive: true,
      emailVerifiedAt: new Date(),
    });

    invite.consumedAt = new Date();
    await invite.save();

    log.info('staff_invite_accepted', {
      businessId: invite.businessId.toString(),
      userId: user._id.toString(),
      businessRole: invite.businessRole,
    });

    return user;
  }

  /**
   * Changes a member's role, or activates/deactivates them.
   *
   * Every mutation is scoped by businessId AND refuses to touch the owner or the
   * caller themselves. An owner who could demote themselves would lock the
   * workspace out of its own billing with no way back.
   */
  public static async updateMember(
    businessId: string,
    callerId: string,
    memberId: string,
    changes: { businessRole?: string; isActive?: boolean }
  ): Promise<TeamMemberDTO> {
    if (!Types.ObjectId.isValid(memberId)) {
      throw new AppError('Team member not found.', 404);
    }

    if (memberId === callerId) {
      throw new AppError('You cannot change your own role or access.', 400);
    }

    const member = await User.findOne({ _id: memberId, businessId });
    if (!member) {
      // 404 rather than 403: confirming the account exists in a workspace the
      // caller cannot see is itself a disclosure.
      throw new AppError('Team member not found.', 404);
    }

    if (member.businessRole === 'owner') {
      throw new AppError('The workspace owner cannot be modified.', 403);
    }

    if (changes.businessRole !== undefined) {
      const next = changes.businessRole as BusinessRole;
      if (!BUSINESS_ROLES.includes(next)) {
        throw new AppError(`Role must be one of: ${BUSINESS_ROLES.join(', ')}.`, 400);
      }
      if (next === 'owner') {
        throw new AppError('Ownership cannot be reassigned here.', 400);
      }
      // Dropping the technician link when they stop being a technician keeps the
      // worker PWA from scoping a dispatcher to one person's jobs.
      if (next !== 'technician') {
        member.technicianId = null;
      }
      member.businessRole = next;
    }

    if (changes.isActive !== undefined) {
      member.isActive = Boolean(changes.isActive);
    }

    await member.save();

    // Deactivation and demotion both have to take effect immediately, not when
    // the member's current access token happens to expire.
    if (changes.isActive === false || changes.businessRole !== undefined) {
      await Promise.all([
        RefreshToken.updateMany(
          { userId: member._id, revokedAt: { $exists: false } },
          { $set: { revokedAt: new Date() } }
        ),
        User.updateOne({ _id: member._id }, { $inc: { tokenVersion: 1 } }),
      ]);
      log.info('team_member_sessions_revoked', {
        businessId,
        memberId,
        reason: changes.isActive === false ? 'deactivated' : 'role_changed',
      });
    }

    log.info('team_member_updated', { businessId, memberId, changes });

    return this.memberDto(member, callerId);
  }

  /**
   * Removes a member from the workspace.
   *
   * The User row is kept and detached rather than deleted, because audit trails
   * elsewhere reference the id. A detached, deactivated account cannot log in
   * and belongs to no workspace.
   */
  public static async removeMember(
    businessId: string,
    callerId: string,
    memberId: string
  ): Promise<void> {
    if (!Types.ObjectId.isValid(memberId)) {
      throw new AppError('Team member not found.', 404);
    }

    if (memberId === callerId) {
      throw new AppError('You cannot remove yourself from the workspace.', 400);
    }

    const member = await User.findOne({ _id: memberId, businessId });
    if (!member) {
      throw new AppError('Team member not found.', 404);
    }
    if (member.businessRole === 'owner') {
      throw new AppError('The workspace owner cannot be removed.', 403);
    }

    member.isActive = false;
    member.businessId = null;
    member.businessRole = null;
    member.technicianId = null;
    await member.save();

    await Promise.all([
      RefreshToken.updateMany(
        { userId: member._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      ),
      User.updateOne({ _id: member._id }, { $inc: { tokenVersion: 1 } }),
    ]);

    log.info('team_member_removed', { businessId, memberId });
  }
}

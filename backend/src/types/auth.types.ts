import { Request } from 'express';
import { Document, Types } from 'mongoose';

/**
 * PLATFORM scope. 'admin' means BlueCollar AI staff, not a contractor who
 * happens to own their account. Deliberately unrelated to `BusinessRole`.
 */
export type UserRole = 'user' | 'admin';

/**
 * TENANT scope — what this user may do inside one contractor's workspace.
 *
 * Kept separate from `UserRole` because the two answer different questions.
 * Collapsing them would mean a contractor's dispatcher had to be represented as
 * some value of a platform-privilege enum, which is how privilege escalation
 * bugs get written.
 *
 * - owner      — full access, including billing and team management.
 * - dispatcher — day-to-day operations, but never billing.
 * - technician — only their own assigned jobs.
 */
export type BusinessRole = 'owner' | 'dispatcher' | 'technician';

export const BUSINESS_ROLES: readonly BusinessRole[] = ['owner', 'dispatcher', 'technician'];

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  /**
   * Workspace this user belongs to.
   *
   * Optional because an owner signs up before any Business exists — onboarding
   * creates it later — and because platform admins belong to no workspace. For
   * staff it is mandatory and set at invite-accept time: it is the only thing
   * tying them to a tenant, since `Business.ownerId` points at the owner alone.
   */
  businessId?: Types.ObjectId | null;
  /** Undefined only for platform admins and pre-onboarding owners. */
  businessRole?: BusinessRole | null;
  /**
   * Links a technician user to their dispatch record, so the worker PWA can show
   * one person their own jobs instead of a technician picker.
   */
  technicianId?: Types.ObjectId | null;
  /** Null until the user proves control of their email address. */
  emailVerifiedAt?: Date | null;
  /** Incremented to revoke all outstanding access tokens for this user. */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Null for platform admins and for owners who have not onboarded yet. */
  businessId?: string | null;
  businessRole?: BusinessRole | null;
  /** Set only for technician users. */
  technicianId?: string | null;
  /** Lets the UI prompt for verification without a second request. */
  emailVerified: boolean;
  createdAt?: string | Date;
}

/**
 * Note what is deliberately absent: `businessId` and `businessRole`.
 *
 * `authMiddleware` already loads the User document on every request, so the
 * workspace and role are read fresh from the database rather than trusted from
 * the token. That means demoting a dispatcher or removing someone from a
 * workspace takes effect on their very next request instead of whenever their
 * access token happens to expire.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  /**
   * Token version at issue time. Compared against the user's current value on
   * every request, so bumping it revokes tokens that have not yet expired.
   */
  tv?: number;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: UserDTO;
}

export interface AuthenticatedRequest extends Request {
  user?: UserDTO;
}

/** Request carrying a resolved workspace, produced by `attachBusinessContext`. */
export interface BusinessScopedRequest extends AuthenticatedRequest {
  /**
   * The workspace this request acts on, resolved server-side from the session.
   * Never read from the request body or query — that is what tenant isolation
   * depends on.
   */
  businessId?: string;
  businessRole?: BusinessRole;
}

export type StaffInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface StaffInviteDTO {
  id: string;
  email: string;
  name?: string;
  businessRole: BusinessRole;
  status: StaffInviteStatus;
  technicianId?: string | null;
  invitedByName?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string;
  businessRole: BusinessRole;
  technicianId?: string | null;
  isActive: boolean;
  emailVerified: boolean;
  /** True for the row representing the caller, so the UI can disable self-edits. */
  isSelf: boolean;
  createdAt?: string | Date;
}

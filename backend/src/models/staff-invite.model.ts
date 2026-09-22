import { Schema, model, Document, Types } from 'mongoose';
import { BusinessRole } from '../types/auth.types';

export interface IStaffInvite extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  /**
   * SHA-256 of the token that was emailed. Storing the hash means a database
   * leak cannot be turned into a set of usable invitations into other people's
   * workspaces.
   */
  tokenHash: string;
  /**
   * Address the invite was sent to, captured at issue time. Acceptance requires
   * the new account to use this exact address, so a forwarded invite cannot be
   * redeemed under a different identity.
   */
  email: string;
  /** Prefilled on the acceptance form; the invitee can correct it. */
  name?: string;
  businessRole: BusinessRole;
  /** Optional link to an existing dispatch record for technician invites. */
  technicianId?: Types.ObjectId | null;
  invitedByUserId: Types.ObjectId;
  expiresAt: Date;
  consumedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
}

const staffInviteSchema = new Schema<IStaffInvite>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    businessRole: {
      type: String,
      enum: ['owner', 'dispatcher', 'technician'],
      required: true,
    },
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Technician',
      default: null,
    },
    invitedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
    },
    revokedAt: {
      type: Date,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** Listing pending invites for a workspace is the common read. */
staffInviteSchema.index({ businessId: 1, email: 1 });

/**
 * Kept well past expiry rather than reaped immediately, so the team screen can
 * still show that an invitation was sent and lapsed instead of silently losing
 * the record.
 */
staffInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const StaffInvite = model<IStaffInvite>('StaffInvite', staffInviteSchema);

import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types/auth.types';

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Do not return passwordHash in queries by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    /**
     * Workspace membership.
     *
     * For an owner this duplicates `Business.ownerId` and is backfilled the
     * first time they are seen after onboarding. For staff it is the ONLY link
     * to a tenant, because `Business.ownerId` names exactly one person.
     *
     * Nullable by necessity: signup creates a User before any Business exists.
     */
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
      index: true,
    },
    businessRole: {
      type: String,
      enum: ['owner', 'dispatcher', 'technician'],
      default: null,
    },
    /** Set for technician users so the worker PWA can scope to one person. */
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Technician',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /**
     * Set once the user has proven control of their email address.
     *
     * Kept as a timestamp rather than a boolean so it doubles as an audit trail.
     * Null means unverified; whether that blocks login is governed by
     * REQUIRE_EMAIL_VERIFICATION.
     */
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    /**
     * Bumping this invalidates every access token already issued to the user.
     *
     * Access tokens are stateless, so logout previously only deleted the cookie
     * — the token itself stayed valid for its full lifetime. This gives a way to
     * actually revoke: sign the current version into the token and reject any
     * token carrying an older one.
     */
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Team listings and the invite duplicate-check both query by workspace, and the
 * workspace's owner is looked up by role.
 */
userSchema.index({ businessId: 1, businessRole: 1 });

// Method to verify candidate password against hashed password
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = model<IUser>('User', userSchema);

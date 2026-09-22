import { Schema, model, Document, Types } from 'mongoose';

export interface IPasswordReset extends Document {
  userId: Types.ObjectId;
  /**
   * SHA-256 of the token that was emailed. A password reset token is a full
   * account takeover if leaked, so the database never holds the usable value.
   */
  tokenHash: string;
  /**
   * Address the link was sent to, captured at issue time. If the account's email
   * changes before the link is used, proving control of the old address says
   * nothing about the current one — so the token stops working.
   */
  email: string;
  expiresAt: Date;
  consumedAt?: Date;
  /** Kept for the security-notification email and for abuse investigation. */
  requestedByIp?: string;
  createdAt: Date;
}

const passwordResetSchema = new Schema<IPasswordReset>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
    },
    requestedByIp: {
      type: String,
      trim: true,
      maxlength: 64,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * Reaped an hour past expiry. Shorter retention than email verification because
 * these are higher-value secrets and there is no reason to keep spent ones.
 */
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema);

import { Schema, model, Document, Types } from 'mongoose';

export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  /**
   * SHA-256 of the token value. The raw token is only ever in the client's
   * cookie, so a database leak does not hand over live sessions.
   */
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  /** Hash of the token issued in this one's place, for rotation auditing. */
  replacedByHash?: string;
  createdByIp?: string;
  userAgent?: string;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
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
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
    },
    replacedByHash: {
      type: String,
    },
    createdByIp: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 400,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * Rows are kept for a grace period past expiry rather than deleted immediately,
 * so presenting an already-rotated token is still recognisable as reuse — the
 * signal that a refresh token was stolen.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);

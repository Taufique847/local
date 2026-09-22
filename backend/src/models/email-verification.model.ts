import { Schema, model, Document, Types } from 'mongoose';

export interface IEmailVerification extends Document {
  userId: Types.ObjectId;
  /**
   * SHA-256 of the token that was emailed. Storing the hash means a database
   * leak does not hand over the ability to verify other people's addresses.
   */
  tokenHash: string;
  /** The address being proven, captured at issue time so changing it invalidates the link. */
  email: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

const emailVerificationSchema = new Schema<IEmailVerification>(
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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Expired links are worthless; let MongoDB reap them.
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const EmailVerification = model<IEmailVerification>(
  'EmailVerification',
  emailVerificationSchema
);

import { Schema, model, Document } from 'mongoose';

export interface IDistributedLock extends Document {
  /** Lock name, e.g. `booking:<businessId>` or `job:review_surveys`. */
  key: string;
  /** Identifies the holder so only the holder can release it. */
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Mutual exclusion across processes, backed by MongoDB.
 *
 * Deliberately not Redis: the deployment already requires MongoDB and nothing
 * else, and adding a second datastore to coordinate two low-frequency
 * operations is not a trade worth making yet.
 *
 * Correctness relies on the unique index on `key`. An attempt to take a lock
 * that is already held raises a duplicate key error, which the service turns
 * into "not acquired".
 */
const lockSchema = new Schema<IDistributedLock>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    owner: {
      type: String,
      required: true,
    },
    acquiredAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: false }
);

/**
 * Safety net for a holder that dies without releasing. The service also treats
 * any lock whose `expiresAt` has passed as free, so expiry does not depend on
 * how promptly this background monitor fires.
 */
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DistributedLock = model<IDistributedLock>('DistributedLock', lockSchema);

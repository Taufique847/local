import { randomUUID } from 'crypto';
import { DistributedLock } from '../models/lock.model';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'lock' });

export class LockAcquisitionError extends Error {
  public readonly key: string;

  constructor(key: string) {
    super(`Could not acquire lock "${key}"`);
    this.name = 'LockAcquisitionError';
    this.key = key;
  }
}

/**
 * Cross-process mutual exclusion.
 *
 * Two problems this exists to solve:
 *
 *  - Double booking. The appointment conflict check and the insert were two
 *    separate round trips, so two callers ringing at the same moment could both
 *    see a free slot and both book it.
 *  - Duplicated scheduled work. The cron scheduler assumed it ran on exactly one
 *    instance. That was documented but never enforced, so two replicas would
 *    each send the same drip SMS — a TCPA problem as well as a double charge.
 *
 * MongoDB transactions are not an option here: the shipped compose file runs a
 * standalone mongod, and transactions require a replica set. A lock document
 * with a unique key works on both topologies.
 */
export class LockService {
  private static readonly instanceId = `${process.pid}-${randomUUID().slice(0, 8)}`;

  /**
   * Attempts to take a lock without waiting.
   *
   * Returns an owner token on success, or null when someone else holds it. A
   * lock whose `expiresAt` has passed is treated as free, so a crashed holder
   * cannot block the key forever.
   */
  public static async tryAcquire(key: string, ttlMs: number): Promise<string | null> {
    const now = new Date();
    const owner = `${this.instanceId}:${randomUUID()}`;

    try {
      await DistributedLock.findOneAndUpdate(
        { key, expiresAt: { $lte: now } },
        {
          $set: {
            key,
            owner,
            acquiredAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
        },
        { upsert: true, new: true }
      );
      return owner;
    } catch (err: any) {
      // The filter excluded a live lock, so the upsert tried to insert a second
      // document with the same unique key. That means it is genuinely held.
      if (err?.code === 11000) return null;
      throw err;
    }
  }

  /**
   * Takes a lock, retrying briefly.
   *
   * Used where a caller would rather wait a moment than fail: two simultaneous
   * bookings should queue behind each other, not reject one of them.
   */
  public static async acquire(
    key: string,
    ttlMs: number,
    options: { retries?: number; retryDelayMs?: number } = {}
  ): Promise<string | null> {
    const retries = options.retries ?? 0;
    const delay = options.retryDelayMs ?? 120;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const owner = await this.tryAcquire(key, ttlMs);
      if (owner) return owner;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /** Releases only if still held by this owner, so a timed-out holder cannot free someone else's lock. */
  public static async release(key: string, owner: string): Promise<void> {
    try {
      await DistributedLock.deleteOne({ key, owner });
    } catch (err: any) {
      // Never let cleanup failure mask the outcome of the guarded work.
      log.warn('lock_release_failed', { key, reason: err?.message });
    }
  }

  /**
   * Runs `fn` while holding `key`, releasing it afterwards even if `fn` throws.
   *
   * Throws LockAcquisitionError when the lock cannot be taken, so callers can
   * translate that into a retryable response rather than a generic 500.
   */
  public static async withLock<T>(
    key: string,
    options: { ttlMs: number; retries?: number; retryDelayMs?: number },
    fn: () => Promise<T>
  ): Promise<T> {
    const owner = await this.acquire(key, options.ttlMs, {
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
    });

    if (!owner) throw new LockAcquisitionError(key);

    try {
      return await fn();
    } finally {
      await this.release(key, owner);
    }
  }
}

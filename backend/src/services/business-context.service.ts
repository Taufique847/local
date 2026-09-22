import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { Business } from '../models/business.model';
import { BusinessRole } from '../types/auth.types';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'business-context' });

export interface ResolvedBusinessContext {
  businessId: string;
  businessRole: BusinessRole;
  /** Set only for technician users, so job queries can scope to one person. */
  technicianId: string | null;
}

/**
 * Resolves which workspace a request acts on, and with what authority.
 *
 * Why this replaces `Business.findOne({ ownerId })`:
 *
 * That lookup asks "which business does this person OWN", which answers the
 * question only for owners. Every controller used it as if it meant "which
 * business is this person part of", so a staff user would have resolved to
 * nothing and been told to complete a business profile they do not own. Staff
 * accounts are only possible once membership is read from the user rather than
 * inferred from ownership.
 *
 * The owner path is kept working through a lazy backfill rather than a migration
 * script, because the ownership row already exists and is authoritative — there
 * is no state to reconstruct, only a denormalised pointer to fill in.
 */
export class BusinessContextService {
  public static async resolve(userId: string): Promise<ResolvedBusinessContext> {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw new AppError('Account not found or has been deactivated.', 401);
    }

    // Fast path: membership already recorded on the user.
    if (user.businessId) {
      return {
        businessId: user.businessId.toString(),
        // An owner created before this field existed has a businessId only after
        // the backfill below, which always sets the role too. A missing role on a
        // user that does have a businessId therefore means legacy data, and owner
        // is the only role that could have produced it.
        businessRole: (user.businessRole as BusinessRole) || 'owner',
        technicianId: user.technicianId ? user.technicianId.toString() : null,
      };
    }

    // Owner who predates the field, or who has just finished onboarding.
    const owned = await Business.findOne({ ownerId: user._id }).select('_id');
    if (owned) {
      await User.updateOne(
        { _id: user._id },
        { $set: { businessId: owned._id, businessRole: 'owner' } }
      );
      log.info('owner_business_backfilled', {
        userId: user._id.toString(),
        businessId: owned._id.toString(),
      });

      return {
        businessId: owned._id.toString(),
        businessRole: 'owner',
        technicianId: null,
      };
    }

    // No workspace at all. For an owner this is the pre-onboarding state; the
    // message is unchanged so existing clients keep behaving the same way.
    throw new AppError('Please complete your business profile setup first', 400);
  }

  /**
   * Same resolution, but returns null instead of throwing.
   * Used by middleware that must not fail requests which legitimately have no
   * workspace yet, such as the onboarding endpoints themselves.
   */
  public static async tryResolve(userId: string): Promise<ResolvedBusinessContext | null> {
    try {
      return await this.resolve(userId);
    } catch {
      return null;
    }
  }

  /**
   * Records the owner's membership at the moment their Business is created, so
   * the backfill above is only ever needed for accounts that predate this.
   */
  public static async linkOwner(
    userId: string | Types.ObjectId,
    businessId: string | Types.ObjectId
  ): Promise<void> {
    await User.updateOne(
      { _id: userId },
      { $set: { businessId, businessRole: 'owner' } }
    );
  }
}

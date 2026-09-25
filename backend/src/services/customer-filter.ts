import { Types } from 'mongoose';
import { Equipment } from '../models/equipment.model';
import { AppError } from '../types';

export type TagMatchMode = 'any' | 'all' | 'none';

/**
 * A customer filter, in a form that can be stored and replayed.
 *
 * This shape is persisted inside `CustomerSegment`, so it is a data contract: a
 * saved segment written today has to still mean the same thing in six months.
 * Anything added here must be optional, and nothing may change meaning.
 */
export interface CustomerFilterInput {
  search?: string;
  status?: 'active' | 'inactive';
  propertyType?: 'residential' | 'commercial';
  tags?: string[];
  /**
   * How `tags` is matched. `any` is the default because it is what a list of tags
   * most obviously means, and `none` is what makes "customers we have NOT tagged as
   * maintenance plan" expressible.
   */
  tagMode?: TagMatchMode;
  minLifetimeValue?: number;
  maxLifetimeValue?: number;
  /** Last completed job on or after this date. ISO string. */
  servicedAfter?: string;
  /** Last completed job on or before this date. Also matches "never serviced". */
  servicedBefore?: string;
  /** True to match only customers with no completed job at all. */
  neverServiced?: boolean;
  /** Matched case-insensitively against active equipment on the property. */
  equipmentBrand?: string;
  /** Excluded when true, so a campaign audience can skip them up front. */
  excludeOptedOut?: boolean;
  /**
   * Excludes customers who unsubscribed from marketing email.
   *
   * Separate from `excludeOptedOut`, which is the SMS/TCPA flag. Set by email
   * campaigns only — transactional email is exempt and must not consult this.
   */
  excludeEmailOptedOut?: boolean;
  /** Only customers with an email address. Used by email campaigns. */
  requireEmail?: boolean;
}

export const TAG_MATCH_MODES: TagMatchMode[] = ['any', 'all', 'none'];

/** A regex from user input has to be escaped, or a search for "(" throws a 500. */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseDate = (value: string, field: string): Date => {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new AppError(`${field} is not a valid date.`, 400);
  }
  return date;
};

/**
 * Turns a filter into a MongoDB query for the `Customer` collection.
 *
 * Async because the equipment-brand filter needs a lookup: equipment lives in its own
 * collection, so brand has to be resolved to a set of customer ids first. That is a
 * real cost and the reason the filter is built here once rather than re-derived by
 * each caller — the list endpoint, the segment count and the campaign audience all
 * have to agree exactly, or a segment showing "42 customers" will send to 39.
 *
 * Always scoped by `businessId`, which is a parameter and not part of the stored
 * filter: a saved segment must never be able to carry another tenant's id.
 */
export const buildCustomerQuery = async (
  businessId: Types.ObjectId | string,
  filter: CustomerFilterInput = {}
): Promise<Record<string, any>> => {
  const query: Record<string, any> = { businessId };
  /**
   * `$and` rather than merging into the top level.
   *
   * Several clauses here need `$or` — a text search across four fields, and the
   * serviced-before window that also has to match "never serviced". Two `$or` keys on
   * one object silently overwrite each other, which would drop a filter without any
   * error.
   */
  const and: Array<Record<string, any>> = [];

  if (filter.status && ['active', 'inactive'].includes(filter.status)) {
    query.status = filter.status;
  }

  if (filter.propertyType && ['residential', 'commercial'].includes(filter.propertyType)) {
    query.propertyType = filter.propertyType;
  }

  if (filter.search && filter.search.trim()) {
    const regex = new RegExp(escapeRegex(filter.search.trim()), 'i');
    and.push({
      $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }],
    });
  }

  const tags = (filter.tags ?? []).map((t) => t.trim()).filter(Boolean);

  if (tags.length) {
    const mode = filter.tagMode ?? 'any';
    if (!TAG_MATCH_MODES.includes(mode)) {
      throw new AppError(`Unknown tag match mode. Expected one of: ${TAG_MATCH_MODES.join(', ')}.`, 400);
    }

    if (mode === 'any') query.tags = { $in: tags };
    if (mode === 'all') query.tags = { $all: tags };
    // `$nin` on an array field excludes a document if ANY element matches, which is
    // exactly "has none of these tags".
    if (mode === 'none') query.tags = { $nin: tags };
  }

  if (filter.minLifetimeValue !== undefined || filter.maxLifetimeValue !== undefined) {
    const range: Record<string, number> = {};
    if (filter.minLifetimeValue !== undefined) range.$gte = Number(filter.minLifetimeValue);
    if (filter.maxLifetimeValue !== undefined) range.$lte = Number(filter.maxLifetimeValue);

    if (Object.values(range).some((v) => !Number.isFinite(v))) {
      throw new AppError('Lifetime value bounds must be numbers.', 400);
    }
    query.lifetimeValue = range;
  }

  /**
   * "Never serviced" is its own filter, not a side effect of a date range.
   *
   * A customer with `lastServiceAt: null` is genuinely different from one serviced
   * two years ago, and a win-back campaign usually wants both — so
   * `servicedBefore` includes nulls, while `neverServiced` narrows to only them.
   */
  if (filter.neverServiced) {
    and.push({ $or: [{ lastServiceAt: null }, { lastServiceAt: { $exists: false } }] });
  } else {
    if (filter.servicedAfter) {
      query.lastServiceAt = {
        ...(query.lastServiceAt ?? {}),
        $gte: parseDate(filter.servicedAfter, 'servicedAfter'),
      };
    }

    if (filter.servicedBefore) {
      const before = parseDate(filter.servicedBefore, 'servicedBefore');
      // Includes never-serviced customers, who are the most overdue of all.
      and.push({
        $or: [
          { lastServiceAt: { $lte: before } },
          { lastServiceAt: null },
          { lastServiceAt: { $exists: false } },
        ],
      });
    }
  }

  if (filter.equipmentBrand && filter.equipmentBrand.trim()) {
    const brandRegex = new RegExp(`^${escapeRegex(filter.equipmentBrand.trim())}$`, 'i');

    /**
     * `businessId` here is an index and cost measure, not the tenant boundary.
     *
     * Dropping it is behaviour-neutral: the resulting ids are intersected with a
     * `Customer` query that is itself scoped by `businessId`, so another tenant's
     * customer can never survive the join. It stays because without it this scans
     * every business's equipment to build a list that is then mostly discarded, and
     * because a guard that is correct for one reason should not depend on a caller
     * elsewhere staying correct for another.
     */
    const customerIds = await Equipment.distinct('customerId', {
      businessId,
      brand: brandRegex,
      active: true,
    });

    /**
     * An empty result becomes an impossible clause, not a dropped filter.
     *
     * Omitting the clause when nothing matched would silently widen the segment to
     * every customer — the difference between "no customers have a Carrier unit" and
     * "all of them do".
     */
    query._id = customerIds.length ? { $in: customerIds } : { $in: [] };
  }

  if (filter.excludeOptedOut) {
    query.isOptedOut = { $ne: true };
  }

  if (filter.excludeEmailOptedOut) {
    query.emailOptedOut = { $ne: true };
  }

  if (filter.requireEmail) {
    and.push({ email: { $exists: true, $nin: [null, ''] } });
  }

  if (and.length) query.$and = and;

  return query;
};

/** Strips anything not part of the stored contract, so junk cannot be persisted. */
export const sanitiseCustomerFilter = (input: any): CustomerFilterInput => {
  const out: CustomerFilterInput = {};
  if (typeof input !== 'object' || input === null) return out;

  if (typeof input.search === 'string' && input.search.trim()) out.search = input.search.trim();
  if (input.status === 'active' || input.status === 'inactive') out.status = input.status;
  if (input.propertyType === 'residential' || input.propertyType === 'commercial') {
    out.propertyType = input.propertyType;
  }

  if (Array.isArray(input.tags)) {
    const tags = input.tags
      .filter((t: unknown) => typeof t === 'string')
      .map((t: string) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (tags.length) out.tags = tags;
  }

  if (TAG_MATCH_MODES.includes(input.tagMode)) out.tagMode = input.tagMode;

  for (const key of ['minLifetimeValue', 'maxLifetimeValue'] as const) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') {
      const value = Number(input[key]);
      if (!Number.isFinite(value) || value < 0) {
        throw new AppError(`${key} must be a number of dollars, zero or more.`, 400);
      }
      out[key] = value;
    }
  }

  for (const key of ['servicedAfter', 'servicedBefore'] as const) {
    if (typeof input[key] === 'string' && input[key].trim()) {
      // Validated here so a bad date is rejected at save time rather than surfacing
      // the first time the segment is counted.
      parseDate(input[key], key);
      out[key] = input[key];
    }
  }

  if (input.neverServiced === true) out.neverServiced = true;
  if (typeof input.equipmentBrand === 'string' && input.equipmentBrand.trim()) {
    out.equipmentBrand = input.equipmentBrand.trim();
  }
  /**
   * `excludeOptedOut`, `excludeEmailOptedOut` and `requireEmail` are deliberately NOT
   * carried through here.
   *
   * They are send-time concerns, not part of what a segment *is*. The campaign sender
   * adds whichever apply to the channel it is about to use, and it passes that composed
   * object straight to `buildCustomerQuery`. Persisting them inside a stored segment
   * would mean a segment's headline count silently reflected a consent rule that has
   * nothing to do with its definition — and the count is shown next to a send button.
   *
   * They were briefly accepted here and it made no difference to any behaviour, which is
   * how it came to light: a mutation removing them survived, because nothing could reach
   * them. `buildCustomerQuery` still understands all three — it has to, since the
   * campaign sender passes them — they just cannot be *stored*.
   */

  return out;
};

/** True when a filter would match every customer in the business. */
export const isEmptyFilter = (filter: CustomerFilterInput): boolean =>
  Object.keys(sanitiseCustomerFilter(filter)).length === 0;

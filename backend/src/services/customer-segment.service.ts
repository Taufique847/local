import { Types } from 'mongoose';
import { CustomerSegment, ICustomerSegment } from '../models/customer-segment.model';
import { Customer } from '../models/customer.model';
import { NotificationService } from './notification.service';
import {
  CustomerFilterInput,
  buildCustomerQuery,
  sanitiseCustomerFilter,
  isEmptyFilter,
} from './customer-filter';
import { MessageChannel } from '../types/communication.types';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'segments' });

export interface SegmentWithCount {
  id: string;
  name: string;
  description?: string;
  filter: CustomerFilterInput;
  /** Recomputed on every read. Never cached — see the model for why. */
  count: number;
  lastCampaignAt?: Date | null;
  createdAt: Date;
}

export interface CampaignResult {
  /** Customers the segment matched. */
  audience: number;
  sent: number;
  /** Deliberately not contacted: opted out, no phone, no email. */
  skipped: number;
  failed: number;
  /** Populated when `dryRun` was set. Nothing was sent. */
  dryRun: boolean;
  /** Counts by machine-readable reason, so an operator can see why. */
  reasons: Record<string, number>;
}

export class CustomerSegmentService {
  /**
   * The upper bound on one campaign.
   *
   * Not a technical limit — it is a blast-radius limit. A mistyped filter that matches
   * every customer in the database should fail loudly rather than send five thousand
   * texts, and a business that genuinely needs to reach more than this should be
   * doing it deliberately in batches.
   */
  private static readonly MAX_CAMPAIGN_RECIPIENTS = 500;

  public static async list(
    businessId: Types.ObjectId | string
  ): Promise<SegmentWithCount[]> {
    const segments = await CustomerSegment.find({ businessId }).sort({ name: 1 });

    /**
     * Counts resolved in parallel, each through the same query builder the list
     * endpoint uses. If these two ever disagree, a segment's headline number and the
     * customers it actually contains have diverged.
     */
    const counts = await Promise.all(
      segments.map(async (segment) => {
        try {
          const query = await buildCustomerQuery(businessId, segment.filter);
          return await Customer.countDocuments(query);
        } catch (err: any) {
          // A saved filter that no longer resolves must not break the whole page.
          log.error('segment_count_failed', {
            segmentId: String(segment._id),
            reason: err?.message,
          });
          return 0;
        }
      })
    );

    return segments.map((segment, index) => this.toDTO(segment, counts[index]));
  }

  public static async create(
    businessId: Types.ObjectId | string,
    input: { name: string; description?: string; filter: unknown; createdBy?: string }
  ): Promise<SegmentWithCount> {
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('Give the segment a name.', 400);

    const filter = sanitiseCustomerFilter(input.filter);

    /**
     * An empty filter is refused.
     *
     * A segment matching every customer, sitting next to a send button, is a
     * loaded gun. "Everyone" is what the unfiltered customers list is for.
     */
    if (isEmptyFilter(filter)) {
      throw new AppError(
        'That segment has no filters, so it would match every customer. Add at least one condition.',
        400
      );
    }

    try {
      const segment = await CustomerSegment.create({
        businessId,
        name,
        description: input.description?.trim(),
        filter,
        createdBy: input.createdBy,
      });

      const count = await this.count(businessId, filter);
      return this.toDTO(segment, count);
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new AppError(`You already have a segment called "${name}".`, 409);
      }
      throw err;
    }
  }

  public static async update(
    businessId: Types.ObjectId | string,
    segmentId: string,
    input: { name?: string; description?: string; filter?: unknown }
  ): Promise<SegmentWithCount> {
    if (!Types.ObjectId.isValid(segmentId)) {
      throw new AppError('Segment not found', 404);
    }

    const segment = await CustomerSegment.findOne({ _id: segmentId, businessId });
    if (!segment) throw new AppError('Segment not found', 404);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new AppError('Give the segment a name.', 400);
      segment.name = name;
    }

    if (input.description !== undefined) segment.description = input.description.trim();

    if (input.filter !== undefined) {
      const filter = sanitiseCustomerFilter(input.filter);
      if (isEmptyFilter(filter)) {
        throw new AppError(
          'That segment has no filters, so it would match every customer. Add at least one condition.',
          400
        );
      }
      segment.filter = filter;
    }

    try {
      await segment.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new AppError(`You already have a segment called "${segment.name}".`, 409);
      }
      throw err;
    }

    return this.toDTO(segment, await this.count(businessId, segment.filter));
  }

  public static async remove(
    businessId: Types.ObjectId | string,
    segmentId: string
  ): Promise<void> {
    if (!Types.ObjectId.isValid(segmentId)) {
      throw new AppError('Segment not found', 404);
    }
    const result = await CustomerSegment.deleteOne({ _id: segmentId, businessId });
    if (!result.deletedCount) throw new AppError('Segment not found', 404);
  }

  /** How many customers a filter currently matches. */
  public static async count(
    businessId: Types.ObjectId | string,
    filter: CustomerFilterInput
  ): Promise<number> {
    const query = await buildCustomerQuery(businessId, filter);
    return Customer.countDocuments(query);
  }

  /** A page of the customers a segment matches, for previewing the audience. */
  public static async preview(
    businessId: Types.ObjectId | string,
    segmentId: string,
    limit = 25
  ): Promise<{ count: number; customers: any[] }> {
    const segment = await this.requireSegment(businessId, segmentId);
    const query = await buildCustomerQuery(businessId, segment.filter);

    const [count, customers] = await Promise.all([
      Customer.countDocuments(query),
      Customer.find(query)
        .select('firstName lastName phone email tags lifetimeValue lastServiceAt isOptedOut')
        .sort({ lifetimeValue: -1 })
        .limit(Math.min(100, Math.max(1, limit)))
        .lean(),
    ]);

    return { count, customers };
  }

  /**
   * Sends one message to everyone in a segment.
   *
   * Goes through `NotificationService` per recipient rather than a bulk API, which is
   * the point: that path enforces quiet hours, the SMS opt-out and the per-business
   * channel settings for every single customer. A bulk sender that assembles its own
   * recipient list is how a marketing blast reaches someone who texted STOP.
   *
   * Never throws for a single recipient's failure — one bad phone number must not
   * abandon the other ninety-nine — and returns per-reason counts so an operator can
   * see who was skipped and why.
   */
  public static async sendCampaign(
    businessId: Types.ObjectId | string,
    segmentId: string,
    input: {
      channel: MessageChannel;
      body: string;
      subject?: string;
      dryRun?: boolean;
    }
  ): Promise<CampaignResult> {
    const segment = await this.requireSegment(businessId, segmentId);

    const body = (input.body ?? '').trim();
    if (!body) throw new AppError('Write the message you want to send.', 400);

    if (input.channel === 'sms' && body.length > 1600) {
      throw new AppError(
        `That message is ${body.length} characters. The limit for a text is 1600.`,
        400
      );
    }

    /**
     * A marketing text must carry an opt-out notice.
     *
     * The transactional templates ship with one; this body is typed fresh by an
     * operator, and a bulk send with no way out is the clearest TCPA exposure in the
     * product. Refused rather than silently appended, because appending could push the
     * message over a segment boundary and change what the customer sees.
     */
    if (input.channel === 'sms' && !/stop/i.test(body)) {
      throw new AppError(
        'A campaign text must tell people how to opt out. Include the word STOP — for example: "Reply STOP to unsubscribe."',
        400
      );
    }

    if (input.channel === 'email' && !input.subject?.trim()) {
      throw new AppError('Give the email a subject line.', 400);
    }

    /**
     * The audience is narrowed by the channel before anything is counted.
     *
     * An email campaign to a segment of 200 where 40 have no address is a campaign to
     * 160, and the operator should see 160 before they press send — not discover it
     * from the skipped count afterwards.
     */
    const audienceFilter: CustomerFilterInput = {
      ...segment.filter,
      ...(input.channel === 'sms' ? { excludeOptedOut: true } : {}),
      /**
       * Email campaigns exclude anyone who unsubscribed, and require an address.
       *
       * `excludeEmailOptedOut` is the CAN-SPAM flag and is deliberately NOT
       * `excludeOptedOut` — that one is TCPA and is set by an SMS `STOP`. A customer who
       * stopped texts has not asked to stop receiving email, and treating one as the
       * other would silently shrink every email audience.
       */
      ...(input.channel === 'email' ? { requireEmail: true, excludeEmailOptedOut: true } : {}),
    };

    const query = await buildCustomerQuery(businessId, audienceFilter);
    const audience = await Customer.countDocuments(query);

    if (audience > this.MAX_CAMPAIGN_RECIPIENTS) {
      throw new AppError(
        `This segment matches ${audience} customers, which is over the ${this.MAX_CAMPAIGN_RECIPIENTS} limit for one campaign. Narrow the segment first.`,
        400
      );
    }

    const result: CampaignResult = {
      audience,
      sent: 0,
      skipped: 0,
      failed: 0,
      dryRun: Boolean(input.dryRun),
      reasons: {},
    };

    if (input.dryRun) return result;

    const recipients = await Customer.find(query).select('_id').lean();

    for (const recipient of recipients) {
      try {
        const outcome = await NotificationService.send(
          businessId,
          // Ad-hoc copy, so it is logged as `custom` rather than misfiled under a
          // transactional type it is not.
          'custom',
          { customerId: String(recipient._id) },
          {},
          {
            channels: input.channel,
            bodyOverride: body,
            subjectOverride: input.subject,
            /**
             * This is the only caller that sets it. It adds the unsubscribe link and
             * headers on email, and makes the send honour `Customer.emailOptedOut` —
             * neither of which a transactional message should do.
             */
            marketing: true,
            /**
             * Quiet hours are NOT bypassed.
             *
             * Every transactional send in the product bypasses them because the
             * customer just asked for something. A marketing campaign is the exact
             * opposite — it is a cold contact, and the 8pm–9am window is what it
             * exists for.
             */
          }
        );

        const channelResult = outcome.results.find((r) => r.channel === input.channel);

        if (channelResult?.status === 'sent') {
          result.sent++;
        } else if (channelResult?.status === 'failed') {
          result.failed++;
          this.tally(result, channelResult.reason ?? 'send_error');
        } else {
          result.skipped++;
          this.tally(result, channelResult?.reason ?? 'skipped');
        }
      } catch (err: any) {
        result.failed++;
        this.tally(result, 'unexpected_error');
        log.error('campaign_recipient_failed', {
          businessId: String(businessId),
          customerId: String(recipient._id),
          reason: err?.message,
        });
      }
    }

    segment.lastCampaignAt = new Date();
    await segment.save();

    log.info('campaign_sent', {
      businessId: String(businessId),
      segmentId: String(segment._id),
      channel: input.channel,
      ...result,
    });

    return result;
  }

  private static tally(result: CampaignResult, reason: string): void {
    result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
  }

  private static async requireSegment(
    businessId: Types.ObjectId | string,
    segmentId: string
  ): Promise<ICustomerSegment> {
    if (!Types.ObjectId.isValid(segmentId)) {
      throw new AppError('Segment not found', 404);
    }
    const segment = await CustomerSegment.findOne({ _id: segmentId, businessId });
    if (!segment) throw new AppError('Segment not found', 404);
    return segment;
  }

  private static toDTO(segment: ICustomerSegment, count: number): SegmentWithCount {
    return {
      id: String(segment._id),
      name: segment.name,
      description: segment.description,
      filter: segment.filter,
      count,
      lastCampaignAt: segment.lastCampaignAt,
      createdAt: segment.createdAt,
    };
  }
}

import { DemoRequest, IDemoRequest } from '../models/demo-request.model';
import { DemoRequestInput } from '../validation/schemas';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'demo-request' });

export class DemoRequestService {
  /**
   * Persists a marketing-site demo request.
   *
   * Repeat submissions from the same email within 30 minutes update the
   * existing record instead of creating duplicates — people commonly double
   * submit, and a sales inbox full of dupes is worse than none.
   */
  public static async create(
    input: DemoRequestInput,
    meta: { ipAddress?: string; userAgent?: string; referrer?: string }
  ): Promise<{ demoRequest: IDemoRequest; deduped: boolean }> {
    const recentCutoff = new Date(Date.now() - 30 * 60 * 1000);

    const existing = await DemoRequest.findOne({
      email: input.email,
      createdAt: { $gte: recentCutoff },
    }).sort({ createdAt: -1 });

    const payload = {
      fullName: input.fullName,
      businessName: input.businessName,
      trade: input.trade,
      phone: input.phone,
      email: input.email,
      monthlyCalls: input.monthlyCalls,
      sourcePath: input.sourcePath,
      referrer: meta.referrer?.slice(0, 500),
      ipAddress: meta.ipAddress?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 400),
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      log.info('demo_request_deduped', { email: input.email, id: existing._id.toString() });
      return { demoRequest: existing, deduped: true };
    }

    const demoRequest = await DemoRequest.create(payload);
    log.info('demo_request_created', {
      id: demoRequest._id.toString(),
      trade: input.trade,
      monthlyCalls: input.monthlyCalls,
      businessName: input.businessName,
    });

    return { demoRequest, deduped: false };
  }

  public static async list(filter: { status?: string; limit?: number } = {}): Promise<{
    demoRequests: IDemoRequest[];
    total: number;
  }> {
    const query: any = {};
    if (filter.status && filter.status !== 'all') query.status = filter.status;

    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const [demoRequests, total] = await Promise.all([
      DemoRequest.find(query).sort({ createdAt: -1 }).limit(limit),
      DemoRequest.countDocuments(query),
    ]);

    return { demoRequests, total };
  }
}

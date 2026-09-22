import { Types } from 'mongoose';
import { DocumentCounter, CounterScope } from '../models/document-counter.model';
import { Invoice } from '../models/invoice.model';
import { Estimate } from '../models/estimate.model';

const PREFIX: Record<CounterScope, string> = {
  invoice: 'INV',
  estimate: 'EST',
};

/**
 * Allocates customer-facing document numbers.
 *
 * Replaces `countDocuments() + 1001`, which was a read-then-write: two
 * simultaneous creations both saw the same count and produced the same number,
 * and deleting a document caused the next one to reuse a number a customer had
 * already been sent.
 */
export class DocumentNumberService {
  /**
   * Returns the next number for a business, e.g. `INV-1001`.
   *
   * On first use the counter is seeded from the number of existing documents, so
   * businesses with history do not restart at 1001 and collide with numbers
   * already issued.
   */
  public static async next(
    businessId: Types.ObjectId | string,
    scope: CounterScope
  ): Promise<string> {
    const existing = await DocumentCounter.findOne({ businessId, scope });

    if (!existing) {
      const model = scope === 'invoice' ? Invoice : Estimate;
      const alreadyIssued = await model.countDocuments({ businessId });

      // upsert rather than create: a concurrent caller may have seeded it first,
      // in which case $setOnInsert is ignored and we simply increment theirs.
      await DocumentCounter.updateOne(
        { businessId, scope },
        { $setOnInsert: { businessId, scope, seq: 1000 + alreadyIssued } },
        { upsert: true }
      );
    }

    const counter = await DocumentCounter.findOneAndUpdate(
      { businessId, scope },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    return `${PREFIX[scope]}-${counter!.seq}`;
  }
}

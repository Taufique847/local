/**
 * Backfills `Customer.lifetimeValue` and `Customer.lastServiceAt`.
 *
 *   npm run backfill:customer-rollups            # dry run, reports only
 *   npm run backfill:customer-rollups -- --apply # writes
 *
 * Both fields are now maintained going forward — lifetime value in
 * `InvoiceService.applyPayment`, last service date on the two completion paths — but
 * neither was ever written before, so every existing customer reads 0 and null. A
 * "customers worth over $500" segment would be empty and a win-back segment would
 * match everybody.
 *
 * Computed from the records that are the source of truth: `amountPaid` across the
 * customer's invoices, and the latest completed appointment's start time. Recomputed
 * absolutely rather than incremented, so running it twice is safe.
 *
 * Dry run is the default. This rewrites a money figure on every customer record, and
 * "what would change" has to be answerable first.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database';
import { Customer } from '../models/customer.model';
import { Invoice } from '../models/invoice.model';
import { Appointment } from '../models/appointment.model';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'backfill-customer-rollups' });

const APPLY = process.argv.includes('--apply');

const run = async (): Promise<void> => {
  await connectDB();

  /**
   * Aggregated per customer rather than queried per customer.
   *
   * One pass over invoices and one over appointments, instead of two round trips for
   * each of potentially thousands of customers.
   */
  const paidByCustomer = await Invoice.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
    { $match: { amountPaid: { $gt: 0 } } },
    { $group: { _id: '$customerId', paid: { $sum: '$amountPaid' } } },
  ]);

  const lastServiceByCustomer = await Appointment.aggregate<{
    _id: mongoose.Types.ObjectId;
    lastServiceAt: Date;
  }>([
    { $match: { status: 'completed' } },
    { $group: { _id: '$customerId', lastServiceAt: { $max: '$startAt' } } },
  ]);

  const paidMap = new Map(paidByCustomer.map((row) => [String(row._id), row.paid]));
  const serviceMap = new Map(lastServiceByCustomer.map((row) => [String(row._id), row.lastServiceAt]));

  const customerIds = new Set([...paidMap.keys(), ...serviceMap.keys()]);

  const counters = {
    candidates: customerIds.size,
    lifetimeValueUpdated: 0,
    lastServiceUpdated: 0,
    alreadyCorrect: 0,
    missingCustomer: 0,
  };

  log.info('backfill_scan', {
    invoiceGroups: paidByCustomer.length,
    appointmentGroups: lastServiceByCustomer.length,
    customers: customerIds.size,
    mode: APPLY ? 'apply' : 'dry-run',
  });

  for (const customerId of customerIds) {
    const customer = await Customer.findById(customerId).select('lifetimeValue lastServiceAt');

    // An invoice or appointment whose customer has since been deleted.
    if (!customer) {
      counters.missingCustomer++;
      continue;
    }

    const updates: Record<string, unknown> = {};

    const paid = paidMap.get(customerId);
    if (paid !== undefined) {
      // Rounded to cents. Summing floats produces values like 419.99999999999994.
      const rounded = Math.round(paid * 100) / 100;
      if ((customer.lifetimeValue ?? 0) !== rounded) {
        updates.lifetimeValue = rounded;
        counters.lifetimeValueUpdated++;
      }
    }

    const lastService = serviceMap.get(customerId);
    if (lastService) {
      const current = customer.lastServiceAt ? customer.lastServiceAt.getTime() : null;
      if (current !== lastService.getTime()) {
        updates.lastServiceAt = lastService;
        counters.lastServiceUpdated++;
      }
    }

    if (!Object.keys(updates).length) {
      counters.alreadyCorrect++;
      continue;
    }

    if (APPLY) {
      await Customer.updateOne({ _id: customerId }, { $set: updates });
    }
  }

  log.info('backfill_complete', { mode: APPLY ? 'apply' : 'dry-run', ...counters });

  if (!APPLY) {
    log.warn('backfill_dry_run', {
      note: 'Nothing was written. Re-run with --apply once the numbers above look right.',
    });
  }

  await disconnectDB();
};

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error('backfill_failed', { err });
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });

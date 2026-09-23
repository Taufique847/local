/**
 * Backfills `Appointment.technicianId` from the free-text `technicianName`.
 *
 * Why this exists: `technicianId` was declared on the schema and read by the
 * field app's job scoping, but no code path ever wrote it. Every existing
 * appointment therefore carries `technicianId: null`, and the scoping filter
 * (`$or: [{ technicianId }, { technicianId: null }]`) treats null as visible —
 * so a technician saw the whole board.
 *
 * New appointments are written correctly as of the accompanying fix. This closes
 * the gap for rows that already exist.
 *
 * Matching is per business, case-insensitive, on the exact trimmed name. It is
 * deliberately conservative:
 *   - a name matching no technician is left alone
 *   - a name matching MORE than one technician is left alone and reported,
 *     because guessing which colleague owns a job is worse than leaving it
 *     unassigned
 *
 * Run:  npx tsx src/scripts/backfill-technician-ids.ts [--apply]
 *
 * Defaults to a dry run. Nothing is written without --apply.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database';
import { Appointment } from '../models/appointment.model';
import { Technician } from '../models/technician.model';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'backfill-technician-ids' });

const apply = process.argv.includes('--apply');

const run = async (): Promise<void> => {
  await connectDB();

  const candidates = await Appointment.find({
    technicianId: null,
    technicianName: { $nin: [null, ''] },
  }).select('_id businessId technicianName');

  log.info('backfill_scan_complete', {
    unassignedWithName: candidates.length,
    mode: apply ? 'apply' : 'dry-run',
  });

  // One roster lookup per business rather than per appointment.
  const rostersByBusiness = new Map<string, Array<{ _id: mongoose.Types.ObjectId; name: string }>>();

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const apt of candidates) {
    const businessKey = apt.businessId.toString();

    if (!rostersByBusiness.has(businessKey)) {
      const roster = await Technician.find({ businessId: apt.businessId })
        .select('_id name')
        .lean();
      rostersByBusiness.set(
        businessKey,
        roster.map((t: any) => ({ _id: t._id, name: t.name }))
      );
    }

    const roster = rostersByBusiness.get(businessKey) || [];
    const target = (apt.technicianName || '').trim().toLowerCase();
    const hits = roster.filter((t) => t.name.trim().toLowerCase() === target);

    if (hits.length === 1) {
      matched++;
      if (apply) {
        await Appointment.updateOne(
          { _id: apt._id },
          { $set: { technicianId: hits[0]._id } }
        );
      }
      continue;
    }

    if (hits.length > 1) {
      ambiguous++;
      log.warn('backfill_ambiguous_name', {
        appointmentId: apt._id.toString(),
        businessId: businessKey,
        technicianName: apt.technicianName,
        candidates: hits.length,
      });
      continue;
    }

    unmatched++;
    log.debug('backfill_no_matching_technician', {
      appointmentId: apt._id.toString(),
      technicianName: apt.technicianName,
    });
  }

  // Rows with no name at all cannot be backfilled by any rule; they are reported
  // so the size of the manual remainder is known rather than assumed.
  const stillUnassigned = await Appointment.countDocuments({
    technicianId: null,
    $or: [{ technicianName: null }, { technicianName: '' }],
  });

  log.info('backfill_complete', {
    mode: apply ? 'apply' : 'dry-run',
    matched,
    ambiguous,
    unmatchedName: unmatched,
    noNameAtAll: stillUnassigned,
  });

  if (!apply && matched > 0) {
    log.warn('backfill_dry_run', {
      message: `Dry run. Re-run with --apply to write ${matched} assignment(s).`,
    });
  }

  await disconnectDB();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('backfill_failed', { err });
    process.exit(1);
  });

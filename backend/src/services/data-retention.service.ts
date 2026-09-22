import { Types } from 'mongoose';
import { CallLog } from '../models/call-log.model';
import { CommunicationLog } from '../models/communication-log.model';
import { LeadRecovery } from '../models/lead-recovery.model';
import { Customer } from '../models/customer.model';
import { Appointment } from '../models/appointment.model';
import { Invoice } from '../models/invoice.model';
import { Estimate } from '../models/estimate.model';
import { AppError } from '../types';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'retention' });

/** Marker left in place of redacted free text, so the gap is explicit. */
const REDACTED = '[redacted by retention policy]';

export interface RetentionSweepResult {
  enabled: boolean;
  retentionDays: number;
  callsRedacted: number;
  messagesRedacted: number;
  recoveriesRedacted: number;
}

export interface ErasureResult {
  customerId: string;
  appointmentsAnonymised: number;
  invoicesAnonymised: number;
  estimatesAnonymised: number;
  callsRedacted: number;
  messagesRedacted: number;
}

/**
 * Retention and erasure for personal data.
 *
 * Two separate obligations:
 *
 *  - Retention. Full call transcripts and SMS bodies were kept forever. They
 *    contain names, home addresses, equipment details and whatever else a
 *    caller happened to say. Holding that indefinitely is both a liability and,
 *    in several jurisdictions, unlawful without a stated purpose.
 *  - Erasure. A homeowner asking a contractor to delete their data had no
 *    mechanism behind it at all.
 *
 * Both redact rather than delete rows. Financial and operational history has to
 * survive — a business must be able to account for an invoice it raised — so the
 * identifying content is removed while the record and its amounts remain.
 */
export class DataRetentionService {
  /**
   * Redacts free text older than the configured window.
   *
   * Disabled unless DATA_RETENTION_DAYS is set. Defaulting this on would start
   * quietly destroying existing customer records the first time the new build
   * ran, which is not a decision this code gets to make for an operator.
   */
  public static async runRetentionSweep(): Promise<RetentionSweepResult> {
    const retentionDays = config.dataRetentionDays;

    if (!retentionDays || retentionDays <= 0) {
      return {
        enabled: false,
        retentionDays: 0,
        callsRedacted: 0,
        messagesRedacted: 0,
        recoveriesRedacted: 0,
      };
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    /**
     * Transcript, notes and summary go; metrics, outcome and duration stay, so
     * reporting and cost history survive the redaction.
     */
    const calls = await CallLog.updateMany(
      {
        startedAt: { $lt: cutoff },
        $or: [{ transcript: { $ne: [] } }, { notes: { $nin: [null, '', REDACTED] } }],
      },
      {
        $set: {
          transcript: [],
          notes: REDACTED,
          summary: REDACTED,
        },
      }
    );

    const messages = await CommunicationLog.updateMany(
      { createdAt: { $lt: cutoff }, body: { $ne: REDACTED } },
      { $set: { body: REDACTED } }
    );

    const recoveries = await LeadRecovery.updateMany(
      { createdAt: { $lt: cutoff }, 'messages.0': { $exists: true } },
      { $set: { messages: [] } }
    );

    const result: RetentionSweepResult = {
      enabled: true,
      retentionDays,
      callsRedacted: calls.modifiedCount ?? 0,
      messagesRedacted: messages.modifiedCount ?? 0,
      recoveriesRedacted: recoveries.modifiedCount ?? 0,
    };

    if (result.callsRedacted || result.messagesRedacted || result.recoveriesRedacted) {
      log.info('retention_sweep_completed', { ...result });
    }

    return result;
  }

  /**
   * Erases one customer's personal data on request.
   *
   * Scoped by businessId so a contractor can only erase their own customers.
   *
   * What is kept and why: appointment times, invoice numbers and amounts remain,
   * because the contractor needs them for their accounts and tax records. What
   * is removed: name, phone, email, addresses, notes, and any free text in calls
   * or messages that could identify the person.
   */
  public static async erasePersonalData(
    businessId: Types.ObjectId | string,
    customerId: string
  ): Promise<ErasureResult> {
    const customer = await Customer.findOne({ _id: customerId, businessId });
    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    const originalPhone = customer.phone;

    // Redact the customer record itself. The phone is replaced with a stable
    // placeholder rather than removed, because it is a required field and other
    // lookups join on it.
    customer.firstName = 'Erased';
    customer.lastName = 'Customer';
    customer.phone = `erased:${customer._id.toString()}`;
    customer.email = undefined;
    customer.address = undefined as any;
    customer.serviceAddresses = [] as any;
    customer.notes = REDACTED;
    customer.tags = [];
    customer.status = 'inactive';
    customer.personalDataErasedAt = new Date();
    await customer.save();

    const [appointments, invoices, estimates, calls, byCustomer, byPhone] = await Promise.all([
      Appointment.updateMany(
        { businessId, customerId: customer._id },
        {
          $set: {
            address: REDACTED,
            customerNotes: REDACTED,
            internalNotes: REDACTED,
          },
        }
      ),
      Invoice.updateMany(
        { businessId, customerId: customer._id },
        { $set: { notes: REDACTED } }
      ),
      Estimate.updateMany(
        { businessId, customerId: customer._id },
        { $set: { notes: REDACTED } }
      ),
      CallLog.updateMany(
        { businessId, customerId: customer._id },
        { $set: { transcript: [], notes: REDACTED, summary: REDACTED } }
      ),
      CommunicationLog.updateMany(
        { businessId, customerId: customer._id },
        { $set: { body: REDACTED } }
      ),
      // Messages and calls recorded against the phone number before the customer
      // record existed would otherwise be missed.
      CommunicationLog.updateMany(
        { businessId, to: originalPhone },
        { $set: { body: REDACTED } }
      ),
    ]);

    await Promise.all([
      CallLog.updateMany(
        { businessId, from: originalPhone },
        { $set: { transcript: [], notes: REDACTED, summary: REDACTED } }
      ),
      LeadRecovery.updateMany(
        { businessId, callerPhone: originalPhone },
        { $set: { messages: [], customerName: 'Erased Customer' } }
      ),
    ]);

    const result: ErasureResult = {
      customerId: customer._id.toString(),
      appointmentsAnonymised: appointments.modifiedCount ?? 0,
      invoicesAnonymised: invoices.modifiedCount ?? 0,
      estimatesAnonymised: estimates.modifiedCount ?? 0,
      callsRedacted: calls.modifiedCount ?? 0,
      messagesRedacted: (byCustomer.modifiedCount ?? 0) + (byPhone.modifiedCount ?? 0),
    };

    log.info('customer_data_erased', { businessId: String(businessId), ...result });
    return result;
  }
}

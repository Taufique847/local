import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { Technician } from '../models/technician.model';
import { Customer } from '../models/customer.model';
import { Invoice } from '../models/invoice.model';
import { Service } from '../models/service.model';
import { DocumentNumberService } from './document-number.service';
import { PolicyGuardrailsService } from './policy-guardrails.service';
import { NotificationService } from './notification.service';
import { PricingService, PricingLineItem } from './pricing.service';
import { generateShareToken } from '../utils/share-token';
import { AppError } from '../types';

const DEFAULT_CHECKLIST = [
  { item: 'Arrive on site and confirm homeowner complaint', completed: false },
  { item: 'Inspect electrical disconnect & capacitor voltage', completed: false },
  { item: 'Measure suction/liquid line pressure & temperature split', completed: false },
  { item: 'Confirm customer quote approval before physical repair', completed: false },
  { item: 'Safety check, filter airflow & test cycle verification', completed: false },
  { item: 'Clean service area & explain warranty to customer', completed: false },
];

export class WorkerService {
  /**
   * Technicians belonging to a business.
   *
   * Returns an empty list when none have been added. This used to silently
   * create two invented technicians — "Dave Miller" and "Mike S. (Senior
   * Specialist)" with apexheating.com addresses and 555 phone numbers — the
   * first time the roster was read. They were real database records: the
   * dispatcher could assign jobs to them, and the assistant could promise a
   * caller that a technician who does not exist was on the way.
   */
  public static async getTechnicians(
    businessId: Types.ObjectId | string,
    options: { onlyId?: string | null } = {}
  ) {
    const query: any = { businessId, active: true };
    // Used by technician accounts, which get only their own record.
    if (options.onlyId) {
      if (!Types.ObjectId.isValid(options.onlyId)) return [];
      query._id = options.onlyId;
    }
    return Technician.find(query);
  }

  // Get active schedule for Field Worker PWA
  public static async getTodayJobs(
    businessId: Types.ObjectId | string,
    technicianId?: string
  ) {
    const query: any = { businessId };
    if (technicianId && Types.ObjectId.isValid(technicianId)) {
      query.$or = [{ technicianId }, { technicianId: null }];
    }

    const appointments = await Appointment.find(query)
      .populate('customerId', 'name phone email address')
      .populate('serviceId', 'name price durationMinutes category')
      .populate('technicianId', 'name phone')
      .sort({ startAt: 1 });

    // Ensure appointments have checklist initialized
    return appointments.map((apt) => {
      const doc = apt.toObject();
      if (!doc.checklist || doc.checklist.length === 0) {
        doc.checklist = DEFAULT_CHECKLIST;
      }
      return doc;
    });
  }

  /**
   * Loads an appointment that belongs to this business.
   *
   * The three job-mutating methods below used `Appointment.findById(id)` with no
   * tenant filter, while every other query in the codebase uses
   * `findOne({ _id, businessId })`. That let any signed-in account drive another
   * business's job by guessing or observing an appointment id: change its status,
   * read the customer's name, phone and email back out of the response, and raise
   * a real invoice with a live payment link in that business's name.
   *
   * Scoping lives here as well as in the controller so a future caller cannot
   * reintroduce the hole by forgetting to pass businessId.
   */
  private static async findOwnedAppointment(
    businessId: Types.ObjectId | string,
    appointmentId: string,
    populate = false,
    scope: { technicianId?: string | null } = {}
  ) {
    if (!Types.ObjectId.isValid(appointmentId)) {
      throw new AppError('Appointment not found', 404);
    }

    const filter: any = { _id: appointmentId, businessId };

    /**
     * Second scoping axis, for technician accounts.
     *
     * Business scoping alone stops cross-tenant access but still lets one
     * technician alter a colleague's job — change its status, overwrite its
     * checklist and photos, or complete it and raise the invoice. Unassigned jobs
     * stay reachable on purpose: the schedule shows them to technicians so they
     * can be picked up, and a job nobody may touch is not a useful state.
     */
    if (scope.technicianId) {
      if (!Types.ObjectId.isValid(scope.technicianId)) {
        throw new AppError('Appointment not found', 404);
      }
      filter.$or = [{ technicianId: scope.technicianId }, { technicianId: null }];
    }

    const query = Appointment.findOne(filter);
    if (populate) query.populate('customerId').populate('serviceId');

    const apt = await query;

    // Deliberately 404 rather than 403: confirming that an id exists but belongs
    // to someone else is itself a disclosure.
    if (!apt) throw new AppError('Appointment not found', 404);
    return apt;
  }

  // Realtime Status Stepper (scheduled -> en_route -> arrived -> in_progress -> completed)
  public static async updateJobStatus(
    businessId: Types.ObjectId | string,
    appointmentId: string,
    status: string,
    locationData?: { latitude?: number; longitude?: number; address?: string },
    scope: { technicianId?: string | null } = {}
  ) {
    const apt = await this.findOwnedAppointment(businessId, appointmentId, false, scope);

    (apt as any).status = status;

    /**
     * Location is recorded only when the device actually supplied it.
     *
     * The previous defaults dropped every technician at 32.7767,-96.797 —
     * downtown Dallas — and labelled it "Job Site Location", so a check-in with
     * no GPS was indistinguishable from a real one.
     */
    const stamp = {
      timestamp: new Date(),
      ...(typeof locationData?.latitude === 'number' ? { latitude: locationData.latitude } : {}),
      ...(typeof locationData?.longitude === 'number' ? { longitude: locationData.longitude } : {}),
      ...(locationData?.address || apt.address ? { address: locationData?.address || apt.address } : {}),
    };

    if (status === 'arrived') {
      (apt as any).checkIn = stamp;
    } else if (status === 'completed') {
      (apt as any).checkOut = stamp;
    }

    await apt.save();
    return apt;
  }

  // Save Checklist, Photos, and Parts
  public static async updateJobExecution(
    businessId: Types.ObjectId | string,
    appointmentId: string,
    data: {
      checklist?: Array<{ item: string; completed: boolean }>;
      photos?: Array<{ url: string; caption?: string; phase: 'before' | 'after' }>;
      partsUsed?: Array<{ partName: string; quantity: number; unitCost: number; totalCost: number }>;
      internalNotes?: string;
    },
    scope: { technicianId?: string | null } = {}
  ) {
    if (data.photos) {
      if (data.photos.length > 12) {
        throw new AppError('Maximum 12 photos allowed per appointment.', 400);
      }
      const totalPhotosSize = data.photos.reduce(
        (sum, photo) => sum + (photo.url ? photo.url.length : 0),
        0
      );
      // Hard payload ceiling: 6MB across all photos to prevent MongoDB BSONObjectTooLarge (16MB limit)
      if (totalPhotosSize > 6_000_000) {
        throw new AppError(
          'Total photo payload exceeds the 6MB limit to prevent database corruption. Please upload compressed images.',
          400
        );
      }
    }

    const apt = await this.findOwnedAppointment(businessId, appointmentId, false, scope);

    if (data.checklist) (apt as any).checklist = data.checklist;
    if (data.photos) (apt as any).photos = data.photos;
    if (data.partsUsed) (apt as any).partsUsed = data.partsUsed;
    if (data.internalNotes) (apt as any).internalNotes = data.internalNotes;


    await apt.save();
    return apt;
  }


  // 1-Tap Job Complete & Invoice Generation
  public static async completeJobAndGenerateInvoice(
    businessId: Types.ObjectId | string,
    appointmentId: string,
    data: {
      diagnosticFeeCredit?: number;
      additionalLaborHours?: number;
      laborRate?: number;
      notes?: string;
    },
    scope: { technicianId?: string | null } = {}
  ) {
    const apt = await this.findOwnedAppointment(businessId, appointmentId, true, scope);

    /**
     * Completing twice must not raise a second invoice.
     *
     * A technician double-tapping "complete" would otherwise bill the customer
     * again, exactly as the estimate conversion did.
     */
    const existingInvoice = await Invoice.findOne({
      businessId,
      appointmentId: apt._id,
    });
    if (existingInvoice) {
      return { appointment: apt, invoice: existingInvoice, alreadyInvoiced: true };
    }

    // Mark appointment as completed
    (apt as any).status = 'completed';
    (apt as any).checkOut = {
      timestamp: new Date(),
      address: apt.address,
    };
    await apt.save();

    /**
     * Same rollup as the dashboard completion path.
     *
     * This path sets `status` directly rather than going through
     * `AppointmentService.updateStatus`, so it does not inherit that method's
     * side effects and needs its own. `$max` guards against a technician closing an
     * older job after a newer one.
     */
    await Customer.updateOne(
      { _id: apt.customerId, businessId: apt.businessId },
      { $max: { lastServiceAt: apt.startAt } }
    ).catch((err: any) => console.warn('Could not stamp customer lastServiceAt:', err?.message));

    /**
     * Rates come from the business's own policy, not from literals in this file.
     *
     * Every number below used to be hardcoded here — $189 base, $95 labour, $89
     * diagnostic credit and an 8.25% tax rate the caller could not override. A
     * business with different pricing was billed the wrong amount on every job
     * completed from the field app, with no way to correct it.
     */
    const policy = await PolicyGuardrailsService.getPolicy(apt.businessId);

    /**
     * Line totals are not computed here.
     *
     * `PricingService.quote` derives every `total` from quantity and unit price. The
     * parts loop below used to write `part.totalCost || part.quantity * part.unitCost`,
     * which billed a stored figure that could disagree with the quantity and price
     * printed next to it on the same invoice line.
     */
    const items: PricingLineItem[] = [];

    const svc = apt.serviceId as any;

    /**
     * `startingPrice` is the field that exists.
     *
     * This read `svc.price`, which is not on the Service schema at all, so it was
     * always `undefined` and every invoice fell through to the $189 literal —
     * including for a $450 service. The bug was invisible because the fallback
     * produced a plausible-looking number.
     */
    const servicePrice =
      typeof svc?.startingPrice === 'number' ? svc.startingPrice : null;

    if (svc && servicePrice !== null) {
      items.push({
        description: svc.name || 'HVAC Standard Diagnostics & Service',
        quantity: 1,
        unitPrice: servicePrice,
      });
    } else if (svc) {
      // The service exists but carries no price. Bill the diagnostic fee, which is
      // the one figure the business has authorised, rather than inventing one.
      items.push({
        description: svc.name || 'HVAC Standard Diagnostics & Service',
        quantity: 1,
        unitPrice: policy.diagnosticFee,
      });
    } else {
      items.push({
        description: 'Standard HVAC Diagnostic & System Repair',
        quantity: 1,
        unitPrice: policy.diagnosticFee,
      });
    }

    // Add parts used (taxable tangible goods)
    if ((apt as any).partsUsed && (apt as any).partsUsed.length > 0) {
      for (const part of (apt as any).partsUsed) {
        items.push({
          description: `Part: ${part.partName}`,
          quantity: part.quantity,
          unitPrice: part.unitCost,
          taxable: true,
        });
      }
    }

    // Add extra labor if any (strictly tax-exempt residential service labor under US state tax laws)
    if (data.additionalLaborHours && data.additionalLaborHours > 0) {
      items.push({
        description: `Field Technician Labor (${data.additionalLaborHours} hrs)`,
        quantity: data.additionalLaborHours,
        unitPrice: data.laborRate ?? policy.laborRate,
        taxable: false,
      });
    }

    /**
     * Same pricing engine as the dashboard and the portal.
     *
     * The copy that lived here read `policy.taxRate` but had previously hardcoded
     * 8.25%, and it never billed the emergency fee — so the after-hours callout the
     * AI quoted on the phone was invoiced as a routine visit by the very path that
     * closes those jobs.
     */
    const { emergency, travelFee } = await PricingService.resolveJobContext(businessId, {
      priority: (apt as any).priority ?? null,
      customerId: apt.customerId,
    });

    const quote = PricingService.quote(
      {
        items,
        diagnosticFeeCredit: data.diagnosticFeeCredit ?? policy.diagnosticFee,
        emergency,
        travelFee,
      },
      policy
    );

    // Atomic counter, not countDocuments+1 — see DocumentNumberService.
    const invoiceNumber = await DocumentNumberService.next(apt.businessId, 'invoice');
    // Was `inv_${Date.now()}_${Math.random()...}` — guessable, and this token is
    // the only thing protecting a public payment page.
    const shareToken = generateShareToken('inv');

    const invoice = await Invoice.create({
      businessId: apt.businessId,
      customerId: (apt.customerId as any)?._id || apt.customerId,
      appointmentId: apt._id,
      invoiceNumber,
      title: `${apt.title || 'HVAC Service'} - Completed Field Work Order`,
      items: quote.items,
      subtotal: quote.subtotal,
      diagnosticFeeCredit: quote.diagnosticFeeCredit,
      emergencyFee: quote.emergencyFee,
      travelFee: quote.travelFee,
      taxRate: quote.taxRate,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      amountPaid: 0,
      balanceDue: quote.totalAmount,
      status: 'unpaid',
      notes: data.notes || 'Work completed on site. Diagnostic fee credited to repair total.',
      shareToken,
    });

    /**
     * The job is finished and the customer now has a bill they can actually pay.
     *
     * This was the worst of the three silent invoice paths: the technician closes
     * the work order on site and leaves, and nothing whatsoever reached the
     * homeowner — no total, no link, no receipt. Collection depended entirely on
     * the owner noticing and following up by hand.
     */
    await NotificationService.notifyInvoice(invoice, 'invoice_issued');

    return { appointment: apt, invoice };
  }
}

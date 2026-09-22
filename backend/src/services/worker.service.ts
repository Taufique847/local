import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { Technician } from '../models/technician.model';
import { Invoice } from '../models/invoice.model';
import { Service } from '../models/service.model';
import { DocumentNumberService } from './document-number.service';
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
  public static async getTechnicians(businessId: Types.ObjectId | string) {
    return Technician.find({ businessId, active: true });
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
    populate = false
  ) {
    if (!Types.ObjectId.isValid(appointmentId)) {
      throw new AppError('Appointment not found', 404);
    }

    const query = Appointment.findOne({ _id: appointmentId, businessId });
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
    locationData?: { latitude?: number; longitude?: number; address?: string }
  ) {
    const apt = await this.findOwnedAppointment(businessId, appointmentId);

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
    }
  ) {
    const apt = await this.findOwnedAppointment(businessId, appointmentId);

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
    }
  ) {
    const apt = await this.findOwnedAppointment(businessId, appointmentId, true);

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

    // Prepare line items
    const items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];

    const svc = apt.serviceId as any;
    if (svc) {
      items.push({
        description: svc.name || 'HVAC Standard Diagnostics & Service',
        quantity: 1,
        unitPrice: svc.price || 189,
        total: svc.price || 189,
      });
    } else {
      items.push({
        description: 'Standard HVAC Diagnostic & System Repair',
        quantity: 1,
        unitPrice: 189,
        total: 189,
      });
    }

    // Add parts used
    if ((apt as any).partsUsed && (apt as any).partsUsed.length > 0) {
      for (const part of (apt as any).partsUsed) {
        items.push({
          description: `Part: ${part.partName}`,
          quantity: part.quantity,
          unitPrice: part.unitCost,
          total: part.totalCost || part.quantity * part.unitCost,
        });
      }
    }

    // Add extra labor if any
    if (data.additionalLaborHours && data.additionalLaborHours > 0) {
      const rate = data.laborRate || 95;
      items.push({
        description: `Field Technician Labor (${data.additionalLaborHours} hrs)`,
        quantity: data.additionalLaborHours,
        unitPrice: rate,
        total: data.additionalLaborHours * rate,
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const diagCredit = data.diagnosticFeeCredit ?? 89; // Default $89 diagnostic fee credit
    const taxableSubtotal = Math.max(0, subtotal - diagCredit);
    const taxRate = 0.0825;
    const taxAmount = parseFloat((taxableSubtotal * taxRate).toFixed(2));
    const totalAmount = parseFloat((taxableSubtotal + taxAmount).toFixed(2));

    // Atomic counter, not countDocuments+1 — see DocumentNumberService.
    const invoiceNumber = await DocumentNumberService.next(apt.businessId, 'invoice');
    // Was `inv_${Date.now()}_${Math.random()...}` — guessable, and this token is
    // the only thing protecting a public payment page.
    const shareToken = generateShareToken('inv');

    const invoice = await Invoice.create({
      businessId: apt.businessId,
      customerId: apt.customerId,
      appointmentId: apt._id,
      invoiceNumber,
      title: `${apt.title || 'HVAC Service'} - Completed Field Work Order`,
      items,
      subtotal,
      diagnosticFeeCredit: diagCredit,
      taxRate,
      taxAmount,
      totalAmount,
      amountPaid: 0,
      balanceDue: totalAmount,
      status: 'unpaid',
      notes: data.notes || 'Work completed on site. Diagnostic fee credited to repair total.',
      shareToken,
    });

    return { appointment: apt, invoice };
  }
}

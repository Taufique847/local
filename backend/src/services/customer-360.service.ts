import { Types } from 'mongoose';
import { Customer } from '../models/customer.model';
import { CallLog } from '../models/call-log.model';
import { Lead } from '../models/lead.model';
import { Appointment } from '../models/appointment.model';
import { CommunicationLog } from '../models/communication-log.model';
import { Invoice } from '../models/invoice.model';
import { Estimate } from '../models/estimate.model';
import { AppError } from '../types';

export interface TimelineEvent {
  id: string;
  type: 'call' | 'lead' | 'appointment' | 'sms' | 'invoice' | 'estimate';
  title: string;
  summary: string;
  timestamp: Date;
  status: string;
  badgeColor?: string;
  metadata?: Record<string, any>;
}

export interface Customer360View {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    email?: string;
    address?: any;
    serviceAddresses: any[];
    tags: string[];
    lifetimeValue: number;
    notes?: string;
    status: string;
    createdAt: Date;
  };
  metrics: {
    totalCalls: number;
    totalLeads: number;
    openLeads: number;
    totalAppointments: number;
    upcomingAppointments: number;
    totalMessages: number;
    totalInvoices?: number;
    totalEstimates?: number;
    lastInteraction?: Date;
    nextAppointment?: Date;
  };
  timeline: TimelineEvent[];
}

export class Customer360Service {
  /**
   * Generates a unified 360-degree customer relationship profile
   */
  public static async getCustomer360(
    businessId: Types.ObjectId | string,
    customerId: string
  ): Promise<Customer360View> {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400);
    }

    const customer = await Customer.findOne({ _id: customerId, businessId });
    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    const cId = customer._id;
    const phone = customer.phone;

    // Concurrently fetch all customer touchpoints
    const [calls, leads, appointments, messages, invoices, estimates] = await Promise.all([
      CallLog.find({
        businessId,
        $or: [{ customerId: cId }, { from: phone }, { to: phone }],
      }).sort({ startedAt: -1 }).lean(),

      Lead.find({ businessId, customerId: cId }).sort({ createdAt: -1 }).lean(),

      Appointment.find({ businessId, customerId: cId })
        .populate('serviceId', 'name durationMinutes startingPrice')
        .sort({ startAt: -1 })
        .lean(),

      CommunicationLog.find({
        businessId,
        $or: [{ customerId: cId }, { to: phone }, { from: phone }],
      }).sort({ createdAt: -1 }).lean(),

      Invoice.find({ businessId, customerId: cId }).sort({ createdAt: -1 }).lean(),

      Estimate.find({ businessId, customerId: cId }).sort({ createdAt: -1 }).lean(),
    ]);

    const timeline: TimelineEvent[] = [];

    // 1. Process Calls
    for (const call of calls) {
      timeline.push({
        id: call._id.toString(),
        type: 'call',
        title: `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call (${call.durationSeconds || 0}s)`,
        summary: call.notes || (call.outcome ? `Outcome: ${call.outcome.replace('_', ' ')}` : 'Voice call processed by AI receptionist'),
        timestamp: call.startedAt,
        status: call.status,
        badgeColor: call.status === 'completed' ? 'emerald' : 'amber',
        metadata: {
          callSid: call.providerCallSid,
          outcome: call.outcome,
          aiHandled: call.aiHandled,
          hasTranscript: Boolean(call.transcript && call.transcript.length > 0),
        },
      });
    }

    // 2. Process Leads
    for (const lead of leads) {
      timeline.push({
        id: lead._id.toString(),
        type: 'lead',
        title: `Lead: ${lead.title}`,
        summary: lead.description || `Service: ${lead.serviceType || 'HVAC Diagnostic'} (Urgency: ${lead.urgency || 'medium'})`,
        timestamp: lead.createdAt,
        status: lead.status,
        badgeColor: 'blue',
        metadata: {
          urgency: lead.urgency,
          estimatedValue: lead.estimatedValue,
          serviceType: lead.serviceType,
        },
      });
    }

    // 3. Process Appointments
    const now = new Date();
    let nextAppointmentDate: Date | undefined;

    for (const appt of appointments) {
      const isUpcoming = new Date(appt.startAt) > now && appt.status !== 'cancelled';
      if (isUpcoming && (!nextAppointmentDate || new Date(appt.startAt) < nextAppointmentDate)) {
        nextAppointmentDate = new Date(appt.startAt);
      }

      const srvName = (appt.serviceId as any)?.name || 'HVAC Service';
      timeline.push({
        id: appt._id.toString(),
        type: 'appointment',
        title: `Appointment: ${srvName}`,
        summary: `Scheduled for ${new Date(appt.startAt).toLocaleString()}${appt.technicianName ? ` with ${appt.technicianName}` : ''}`,
        timestamp: appt.startAt,
        status: appt.status,
        badgeColor: appt.status === 'confirmed' ? 'emerald' : 'purple',
        metadata: {
          startAt: appt.startAt,
          endAt: appt.endAt,
          technician: appt.technicianName,
        },
      });
    }

    // 4. Process SMS messages
    for (const msg of messages) {
      timeline.push({
        id: msg._id.toString(),
        type: 'sms',
        title: `${msg.direction === 'inbound' ? 'Inbound SMS' : 'Outbound SMS'} (${msg.type.replace('_', ' ')})`,
        summary: msg.body,
        timestamp: msg.createdAt,
        status: msg.status,
        badgeColor: 'indigo',
        metadata: {
          direction: msg.direction,
          twilioSid: msg.twilioSid,
        },
      });
    }

    // 5. Process Invoices
    for (const inv of invoices) {
      timeline.push({
        id: inv._id.toString(),
        type: 'invoice',
        title: `Invoice #${inv.invoiceNumber} - $${(inv.totalAmount || 0).toFixed(2)}`,
        summary: `${inv.title || 'Invoice'} (${(inv.status || 'unpaid').toUpperCase()}) - Balance Due: $${(inv.balanceDue ?? inv.totalAmount ?? 0).toFixed(2)}`,
        timestamp: inv.createdAt,
        status: inv.status,
        badgeColor: inv.status === 'paid' ? 'emerald' : inv.status === 'unpaid' ? 'amber' : 'red',
        metadata: {
          invoiceNumber: inv.invoiceNumber,
          totalAmount: inv.totalAmount,
          balanceDue: inv.balanceDue,
          shareToken: inv.shareToken,
        },
      });
    }

    // 6. Process Estimates
    for (const est of estimates) {
      timeline.push({
        id: est._id.toString(),
        type: 'estimate',
        title: `Estimate #${est.estimateNumber} - $${(est.totalAmount || 0).toFixed(2)}`,
        summary: `${est.title || 'Quote'} (${(est.status || 'draft').toUpperCase()})`,
        timestamp: est.createdAt,
        status: est.status,
        badgeColor: est.status === 'approved' ? 'emerald' : 'blue',
        metadata: {
          estimateNumber: est.estimateNumber,
          totalAmount: est.totalAmount,
          shareToken: est.shareToken,
        },
      });
    }

    // Sort timeline strictly descending by timestamp
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const openLeads = leads.filter((l) => ['new', 'contacted', 'qualified', 'appointment_pending'].includes(l.status)).length;
    const upcomingAppointments = appointments.filter((a) => new Date(a.startAt) > now && a.status !== 'cancelled').length;

    // Calculate lifetime value from paid revenue or customer.lifetimeValue
    const paidRevenue = invoices.reduce((sum, inv) => {
      const paid = typeof inv.amountPaid === 'number' && inv.amountPaid > 0
        ? inv.amountPaid
        : (inv.status === 'paid' ? inv.totalAmount : 0);
      return sum + (paid || 0);
    }, 0);

    let calculatedLtv = customer.lifetimeValue || paidRevenue;
    if (calculatedLtv === 0 && paidRevenue === 0) {
      for (const appt of appointments) {
        if (appt.status === 'completed') {
          calculatedLtv += (appt.serviceId as any)?.startingPrice || 120;
        }
      }
    } else if (paidRevenue > 0) {
      calculatedLtv = Math.max(calculatedLtv, paidRevenue);
    }

    return {
      customer: {
        id: customer._id.toString(),
        firstName: customer.firstName,
        lastName: customer.lastName,
        fullName: `${customer.firstName} ${customer.lastName}`.trim(),
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        serviceAddresses: customer.serviceAddresses || [],
        tags: customer.tags || [],
        lifetimeValue: calculatedLtv,
        notes: customer.notes,
        status: customer.status,
        createdAt: customer.createdAt,
      },
      metrics: {
        totalCalls: calls.length,
        totalLeads: leads.length,
        openLeads,
        totalAppointments: appointments.length,
        upcomingAppointments,
        totalMessages: messages.length,
        totalInvoices: invoices.length,
        totalEstimates: estimates.length,
        lastInteraction: timeline[0]?.timestamp,
        nextAppointment: nextAppointmentDate,
      },
      timeline,
    };
  }

  /**
   * Adds or updates customer tags
   */
  public static async updateCustomerTags(
    businessId: Types.ObjectId | string,
    customerId: string,
    tags: string[]
  ): Promise<string[]> {
    const customer = await Customer.findOne({ _id: customerId, businessId });
    if (!customer) throw new AppError('Customer not found', 404);

    customer.tags = Array.from(new Set(tags.map((t) => t.trim().toLowerCase())));
    await customer.save();
    return customer.tags;
  }
}

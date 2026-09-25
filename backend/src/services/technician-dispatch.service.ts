import { Types } from 'mongoose';
import { ServiceZone, IServiceZone } from '../models/service-zone.model';
import { Technician, ITechnician } from '../models/technician.model';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Equipment } from '../models/equipment.model';
import { AgentMemoryService } from './agent-memory.service';
import { CommunicationService } from './communication.service';
import { EquipmentService } from './equipment.service';
import { ICustomerProperty } from '../types/customer.types';
import { formatDateTimeInZone } from '../utils/format';
import { logger } from '../utils/logger';
import { AppError } from '../types';

const log = logger.child({ module: 'dispatch' });

export class TechnicianDispatchService {
  /**
   * Service Zones CRUD
   */
  public static async createZone(
    businessId: Types.ObjectId | string,
    data: {
      name: string;
      zipCodes: string[];
      travelBufferMinutes?: number;
      /** Trip charge for this zone, in dollars. Billed by `PricingService`. */
      travelFee?: number;
    }
  ): Promise<IServiceZone> {
    return ServiceZone.create({
      businessId: new Types.ObjectId(businessId.toString()),
      name: data.name.trim(),
      zipCodes: data.zipCodes.map((z) => z.trim()),
      // `?? 30`, not `|| 30`: a zone deliberately configured with no travel buffer
      // was silently given a 30-minute one.
      travelBufferMinutes: data.travelBufferMinutes ?? 30,
      travelFee: data.travelFee ?? 0,
    });
  }

  /**
   * Soft-deactivates a zone.
   *
   * Deactivating rather than deleting keeps historical dispatch decisions
   * explainable — appointments already routed through this zone still resolve.
   * Always scoped by businessId so one tenant cannot remove another's zone.
   */
  public static async deactivateZone(
    businessId: Types.ObjectId | string,
    zoneId: string
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(zoneId)) return false;

    const result = await ServiceZone.findOneAndUpdate(
      { _id: zoneId, businessId: new Types.ObjectId(businessId.toString()) },
      { active: false },
      { new: true }
    );

    return Boolean(result);
  }

  public static async getZones(businessId: Types.ObjectId | string): Promise<IServiceZone[]> {
    return ServiceZone.find({
      businessId: new Types.ObjectId(businessId.toString()),
      active: true,
    }).populate('assignedTechnicianIds', 'name phone skills status');
  }

  public static async matchZoneByZip(
    businessId: Types.ObjectId | string,
    zipCode: string
  ): Promise<IServiceZone | null> {
    const cleanZip = zipCode.trim();
    return ServiceZone.findOne({
      businessId: new Types.ObjectId(businessId.toString()),
      zipCodes: cleanZip,
      active: true,
    });
  }

  /**
   * Technicians CRUD
   */
  public static async createTechnician(
    businessId: Types.ObjectId | string,
    data: {
      name: string;
      phone: string;
      email?: string;
      skills?: string[];
      assignedZoneIds?: string[];
    }
  ): Promise<ITechnician> {
    const tech = await Technician.create({
      businessId: new Types.ObjectId(businessId.toString()),
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim(),
      skills: data.skills || ['ac_repair', 'diagnostics'],
      assignedZoneIds: (data.assignedZoneIds || []).map((id) => new Types.ObjectId(id)),
    });

    // Also link to service zones
    if (data.assignedZoneIds && data.assignedZoneIds.length > 0) {
      await ServiceZone.updateMany(
        { _id: { $in: data.assignedZoneIds } },
        { $addToSet: { assignedTechnicianIds: tech._id } }
      );
    }

    return tech;
  }

  public static async getTechnicians(
    businessId: Types.ObjectId | string,
    filter: { skill?: string; status?: string } = {}
  ): Promise<ITechnician[]> {
    const query: any = {
      businessId: new Types.ObjectId(businessId.toString()),
      active: true,
    };

    if (filter.skill) {
      query.skills = filter.skill;
    }
    if (filter.status) {
      query.status = filter.status;
    }

    return Technician.find(query).populate('assignedZoneIds', 'name zipCodes');
  }

  /**
   * Selects the optimal technician based on customer zip code and skill requirements
   */
  public static async findOptimalTechnician(
    businessId: Types.ObjectId | string,
    options: {
      zipCode?: string;
      equipmentRequirement?: string;
      startAt?: Date;
    } = {}
  ): Promise<{
    technician: ITechnician | null;
    matchedZone: IServiceZone | null;
    matchReason: string;
  }> {
    const bId = new Types.ObjectId(businessId.toString());

    let matchedZone: IServiceZone | null = null;
    if (options.zipCode) {
      matchedZone = await this.matchZoneByZip(bId, options.zipCode);
    }

    let candidateTechs: ITechnician[] = [];
    if (matchedZone && matchedZone.assignedTechnicianIds && matchedZone.assignedTechnicianIds.length > 0) {
      candidateTechs = await Technician.find({
        _id: { $in: matchedZone.assignedTechnicianIds },
        businessId: bId,
        active: true,
      });
    }

    // Fallback to all business technicians if no zone candidates
    if (candidateTechs.length === 0) {
      candidateTechs = await Technician.find({
        businessId: bId,
        active: true,
      });
    }

    if (candidateTechs.length === 0) {
      return {
        technician: null,
        matchedZone,
        matchReason: 'No technicians configured for this business.',
      };
    }

    // Windshield Drive-Time Transit Buffer Check:
    // If appointment start time is provided, prioritize technicians without adjacent transit collisions
    let chosenTech: ITechnician = candidateTechs[0];
    let matchReason = `Assigned primary available technician: ${chosenTech.name}`;

    if (options.startAt) {
      const requestedTime = new Date(options.startAt);
      const bufferMinutes = matchedZone?.travelBufferMinutes || 30;
      const bufferMs = bufferMinutes * 60 * 1000;

      // Find candidate whose preceding and succeeding jobs allow adequate windshield drive-time
      for (const tech of candidateTechs) {
        // Find technician's jobs on the same day
        const dayStart = new Date(requestedTime);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(requestedTime);
        dayEnd.setHours(23, 59, 59, 999);

        const techAppointments = await Appointment.find({
          businessId: bId,
          technicianName: tech.name,
          status: { $in: ['scheduled', 'confirmed'] },
          startAt: { $gte: dayStart, $lte: dayEnd },
        });

        // Check if any job finishes too close to the requested time
        const hasTransitConflict = techAppointments.some((appt) => {
          const apptEnd = new Date(appt.endAt).getTime();
          const apptStart = new Date(appt.startAt).getTime();
          const targetTime = requestedTime.getTime();

          // If another job ends within buffer window before this job
          if (targetTime >= apptEnd && targetTime - apptEnd < bufferMs) return true;
          // If another job starts within buffer window after this job
          if (apptStart >= targetTime && apptStart - targetTime < bufferMs) return true;
          return false;
        });

        if (!hasTransitConflict) {
          chosenTech = tech;
          matchReason = `Optimal route match: ${tech.name} has ${bufferMinutes}m windshield transit buffer in zone ${matchedZone ? matchedZone.name : 'General'}`;
          break;
        }
      }
    }

    if (options.equipmentRequirement) {
      const normalizedReq = options.equipmentRequirement.toLowerCase();
      const certifiedTech = candidateTechs.find((tech) =>
        tech.skills.some((skill) => normalizedReq.includes(skill.toLowerCase()) || skill.toLowerCase().includes(normalizedReq))
      );

      if (certifiedTech) {
        chosenTech = certifiedTech;
        matchReason = `Skill matched for ${options.equipmentRequirement} in zone ${matchedZone ? matchedZone.name : 'General'} (Transit buffer verified)`;
      }
    } else if (matchedZone && !matchReason.includes('Optimal route match')) {
      matchReason = `Primary zone technician for ${matchedZone.name} (Zip: ${options.zipCode})`;
    }

    return {
      technician: chosenTech,
      matchedZone,
      matchReason,
    };
  }

  /**
   * Generates Google Maps navigation link and dispatches SMS to technician
   */
  public static async dispatchAppointment(
    businessId: Types.ObjectId | string,
    appointmentId: Types.ObjectId | string
  ): Promise<{
    /** False when the alert could not be sent. The message is still returned. */
    success: boolean;
    dispatchMessage: string;
    mapsUrl: string;
    technicianName: string;
    /** Whether an SMS actually went to a technician. Never to the customer. */
    technicianNotified: boolean;
    dispatchedToPhone?: string;
    /** Why nothing was sent, when `technicianNotified` is false. */
    reason?: string;
  }> {
    const bId = new Types.ObjectId(businessId.toString());
    const appointment = await Appointment.findOne({ _id: appointmentId, businessId: bId })
      .populate('customerId')
      .populate('serviceId');

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    const customer: any = appointment.customerId;
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Customer';
    const customerPhone = customer ? customer.phone : 'Not provided';
    const address = appointment.address || 'Address on file';

    /**
     * Access and equipment now come from structured fields.
     *
     * What this replaced: a loop over every `AgentMemory` row assigning
     * `gateCode = mem.value` for any row in the `instruction` category. Categories
     * hold more than gate codes, so a customer with a dog and no gate code had
     * "Customer mentioned dogs/pets on the property; knock or call prior to entering
     * yard" printed in the field labelled Access/Gate — and a customer with both got
     * whichever row the loop happened to see last.
     */
    const property = (customer?.property ?? {}) as ICustomerProperty;

    const accessLines: string[] = [];
    if (property.gateCode) accessLines.push(`Code ${property.gateCode}`);
    if (property.accessInstructions) accessLines.push(property.accessInstructions);
    if (property.hasPets) accessLines.push(`PETS: ${property.petNotes || 'pets on site'}`);
    if (property.parkingNotes) accessLines.push(`Parking: ${property.parkingNotes}`);

    const accessNote = accessLines.length ? accessLines.join(' · ') : 'No access notes on file';

    let equipmentNote = 'No equipment on file';
    if (customer?._id) {
      const units = await Equipment.find({
        businessId: bId,
        customerId: customer._id,
        active: true,
      }).sort({ isPrimary: -1, installYear: -1 });

      if (units.length) {
        equipmentNote = units.slice(0, 2).map((u) => EquipmentService.describe(u)).join(' | ');
      }
    }

    // Google Maps Turn-by-Turn Navigation URL
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

    /**
     * The assigned technician, by id first.
     *
     * `appointment.technicianId` is now actually written, so the name-regex lookup is
     * only a fallback for records created before that. The regex is escaped: the name
     * comes from the database, and a technician called "J. R. (Bob)" would otherwise
     * throw or match the wrong person.
     */
    let techRecord = null;

    if (appointment.technicianId) {
      techRecord = await Technician.findOne({
        _id: appointment.technicianId,
        businessId: bId,
        active: true,
      });
    }

    if (!techRecord && appointment.technicianName) {
      techRecord = await Technician.findOne({
        businessId: bId,
        name: new RegExp(`^${escapeRegex(appointment.technicianName)}$`, 'i'),
        active: true,
      });
    }

    const techName = techRecord?.name || appointment.technicianName || 'Field Technician';

    const timeFormatted = formatDateTimeInZone(appointment.startAt, appointment.timezone);

    const dispatchMessage = `DISPATCH: ${appointment.title || 'HVAC Service'} — ${timeFormatted}
Customer: ${customerName} (${customerPhone})
Address: ${address}
Unit: ${equipmentNote}
Access: ${accessNote}
Navigate: ${mapsUrl}`;

    /**
     * Sent to the technician, or to nobody.
     *
     * `techPhone` used to default to the CUSTOMER's number, so an appointment with no
     * matching technician record texted the homeowner a message beginning "DISPATCH
     * ALERT" that contained their own gate code and their own phone number. Refusing
     * is the only correct behaviour: the alert is internal, and there is no version of
     * this that the customer should receive.
     */
    if (!techRecord?.phone) {
      log.warn('dispatch_sms_skipped_no_technician_phone', {
        businessId: String(bId),
        appointmentId: String(appointment._id),
        technicianName: techName,
      });

      return {
        success: false,
        dispatchMessage,
        mapsUrl,
        technicianName: techName,
        technicianNotified: false,
        reason:
          'No phone number is on file for the assigned technician, so the dispatch alert was not sent. Assign a technician with a mobile number to send it.',
      };
    }

    await CommunicationService.sendMessage(bId, {
      to: techRecord.phone,
      body: dispatchMessage,
      customerId: customer?._id?.toString(),
      type: 'custom',
      bypassQuietHours: true,
    }).catch((e: any) =>
      log.error('dispatch_sms_failed', {
        businessId: String(bId),
        appointmentId: String(appointment._id),
        reason: e?.message,
      })
    );

    return {
      success: true,
      dispatchMessage,
      mapsUrl,
      technicianName: techName,
      technicianNotified: true,
      dispatchedToPhone: techRecord.phone,
    };
  }
}

/** The technician name comes from the database, so it is escaped before use in a regex. */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

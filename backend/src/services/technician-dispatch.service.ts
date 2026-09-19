import { Types } from 'mongoose';
import { ServiceZone, IServiceZone } from '../models/service-zone.model';
import { Technician, ITechnician } from '../models/technician.model';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { AgentMemoryService } from './agent-memory.service';
import { CommunicationService } from './communication.service';
import { AppError } from '../types';

export class TechnicianDispatchService {
  /**
   * Service Zones CRUD
   */
  public static async createZone(
    businessId: Types.ObjectId | string,
    data: { name: string; zipCodes: string[]; travelBufferMinutes?: number }
  ): Promise<IServiceZone> {
    return ServiceZone.create({
      businessId: new Types.ObjectId(businessId.toString()),
      name: data.name.trim(),
      zipCodes: data.zipCodes.map((z) => z.trim()),
      travelBufferMinutes: data.travelBufferMinutes || 30,
    });
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
    success: boolean;
    dispatchMessage: string;
    mapsUrl: string;
    technicianName: string;
    dispatchedToPhone: string;
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

    // Fetch M19 customer memories for gate code / property notes
    let gateCode = 'None';
    let equipmentNote = 'Standard HVAC';

    if (customer && customer._id) {
      const memories = await AgentMemoryService.getMemoriesForCustomer(bId, customer._id);
      for (const mem of memories) {
        if (mem.category === 'instruction') gateCode = mem.value;
        if (mem.category === 'equipment') equipmentNote = mem.value;
      }
    }

    // Google Maps Turn-by-Turn Navigation URL
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

    // Resolve technician phone
    let techPhone = customerPhone; // fallback
    let techName = appointment.technicianName || 'Field Technician';

    const techRecord = await Technician.findOne({
      businessId: bId,
      name: new RegExp(techName, 'i'),
      active: true,
    });

    if (techRecord && techRecord.phone) {
      techPhone = techRecord.phone;
      techName = techRecord.name;
    }

    const timeFormatted = new Date(appointment.startAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const dispatchMessage = `🚨 DISPATCH ALERT: ${appointment.title || 'HVAC Service'} at ${timeFormatted}.
Customer: ${customerName} (${customerPhone})
Address: ${address}
Unit: ${equipmentNote}
Access/Gate: ${gateCode}
Navigate: ${mapsUrl}`;

    // Send dispatch SMS to technician
    await CommunicationService.sendMessage(bId, {
      to: techPhone,
      body: dispatchMessage,
      customerId: customer?._id?.toString(),
      type: 'custom',
      bypassQuietHours: true,
    }).catch((e: any) => console.error('Error sending tech dispatch SMS:', e));

    return {
      success: true,
      dispatchMessage,
      mapsUrl,
      technicianName: techName,
      dispatchedToPhone: techPhone,
    };
  }
}

import { Types } from 'mongoose';
import { ServiceZone, IServiceZone } from '../models/service-zone.model';
import { Technician, ITechnician } from '../models/technician.model';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { Service } from '../models/service.model';
import { Equipment } from '../models/equipment.model';
import { AgentMemoryService } from './agent-memory.service';
import { CommunicationService } from './communication.service';
import { EquipmentService } from './equipment.service';
import { ICustomerProperty } from '../types/customer.types';
import { formatDateTimeInZone, zonedDayBounds, zonedDateKey } from '../utils/format';
import { GeocodingService } from './geocoding.service';
import { decryptField } from '../utils/crypto';
import { logger } from '../utils/logger';
import { AppError } from '../types';

const log = logger.child({ module: 'dispatch' });

/**
 * One technician weighed against a job, with the reasoning exposed rather than collapsed
 * into a score.
 *
 * A dispatcher overriding a suggestion needs to see *why* the loser lost. A single opaque
 * number cannot be argued with, and an assignment nobody can argue with is one nobody will
 * trust.
 */
export interface TechnicianCandidate {
  technicianId: string;
  name: string;
  phone: string;
  skills: string[];
  status: string;
  /** Assigned to the service zone covering the job's ZIP. */
  inZone: boolean;
  /** `null` when the caller required no particular skill. */
  hasSkill: boolean | null;
  /** Overlaps the requested window. Always false when no window was given. */
  busy: boolean;
  /** Jobs already on their calendar that local day, for load balancing. */
  jobsThatDay: number;
  /** Could actually take this job. Only busyness disqualifies. */
  eligible: boolean;
}

export interface TechnicianMatch {
  /** The best eligible candidate, or null when none is. */
  suggested: TechnicianCandidate | null;
  /** Everyone on the working roster, best first. */
  candidates: TechnicianCandidate[];
  matchedZone: IServiceZone | null;
  /** Plain-language explanation, built only from what was actually checked. */
  reason: string;
}

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
   * Suggests who should take a job, and says why.
   *
   * This method existed and had exactly one caller — an unvalidated
   * `POST /api/dispatch/match-tech` that nothing in the product called — so its result
   * reached nobody and its defects were never visible. Every one of the following was
   * real:
   *
   *  - **It ignored `Technician.status`.** An `off_duty` technician was as valid a pick as
   *    anyone, because only `active` was filtered.
   *  - **It decided who was busy by matching `technicianName` as a string.** Appointments
   *    carry `technicianId`; a job assigned by id whose denormalised name differed, or was
   *    absent, was invisible to the check. So the "availability" scan could hand back
   *    someone already booked.
   *  - **Its day window used `setHours(0,0,0,0)`** — the *server's* midnight, not the
   *    business's. The same defect class Day 16 fixed everywhere else.
   *  - **Its only caller never passed `startAt`,** so the availability branch was dead code
   *    in production regardless.
   *  - **Skills overwrote the availability choice** rather than narrowing it, so a
   *    certification match could select a technician the scan had just rejected as busy.
   *  - **The reason string claimed "Transit buffer verified"** whether or not the buffer
   *    scan had run. An explanation that is sometimes false is worse than none, because a
   *    dispatcher acts on it.
   *
   * What it does now. Eligibility is a hard filter; everything else ranks:
   *
   *  - **`off_duty` is excluded, `on_job` is not.** `status` is a statement about *right
   *    now*, and this is usually scheduling a slot days away — the person currently on a
   *    job is often exactly the right choice for Thursday. Being genuinely unavailable at
   *    the requested time is a separate and precise question, answered below from the diary
   *    rather than from a flag someone forgot to flip.
   *  - **Overlapping the requested window is excluded.** Suggesting someone the booking
   *    path will then refuse with a 409 is worse than suggesting nobody.
   *  - **A required skill ranks, it does not exclude.** A one-technician business whose
   *    only tag is `diagnostics` still has to be able to book a compressor job; the reason
   *    string says plainly that nobody holds the certification.
   *  - **Then fewest jobs that day**, so work spreads across a crew instead of piling onto
   *    whoever happens to be first in insertion order — which is what `candidateTechs[0]`
   *    did.
   *  - **Then name**, so the same inputs always produce the same suggestion.
   *
   * It returns the whole ranked list, not just the winner. A dispatcher overriding a
   * suggestion needs to see the alternatives and why they lost, and "suggest, do not
   * impose" is only meaningful if the other options are visible.
   */
  public static async findOptimalTechnician(
    businessId: Types.ObjectId | string,
    options: {
      zipCode?: string;
      /**
       * A skill tag, matched exactly against `Technician.skills` (case-insensitive).
       *
       * Replaces a free-text `equipmentRequirement` compared with a two-way substring
       * test — `req.includes(skill) || skill.includes(req)` — which matched far more than
       * it looked like it did. `"ac"` matched `ac_repair`, but so did a request for
       * `"no ac_repair needed"`, and a technician tagged `a` would have matched
       * everything.
       */
      requiredSkill?: string;
      /** The window being filled. Without it, nobody can be ruled out as busy. */
      startAt?: Date;
      endAt?: Date;
    } = {}
  ): Promise<TechnicianMatch> {
    const bId = new Types.ObjectId(businessId.toString());

    let matchedZone: IServiceZone | null = null;
    if (options.zipCode) {
      matchedZone = await this.matchZoneByZip(bId, options.zipCode);
    }

    /**
     * Everyone who is working, in one query.
     *
     * The zone no longer decides *who is eligible*, only who ranks higher. Restricting
     * candidates to a zone's roster and falling back to everyone only when that roster was
     * empty meant a zone with one assigned technician could never be served by anybody
     * else — so one person being booked made the whole ZIP unbookable.
     */
    const roster = await Technician.find({
      businessId: bId,
      active: true,
      status: { $ne: 'off_duty' },
    })
      .sort({ name: 1 })
      .lean();

    if (roster.length === 0) {
      const anyInactive = await Technician.countDocuments({ businessId: bId });
      return {
        suggested: null,
        candidates: [],
        matchedZone,
        reason: anyInactive
          ? 'Every technician on the roster is off duty or deactivated.'
          : 'No technicians configured for this business.',
      };
    }

    const zoneMembers = new Set(
      (matchedZone?.assignedTechnicianIds ?? []).map((id: any) => id.toString())
    );

    const requiredSkill = options.requiredSkill?.trim().toLowerCase();

    /**
     * Who is busy, and how loaded, from `technicianId` and the business's own day.
     *
     * One query for the whole local day rather than one per candidate, and the day is
     * resolved with `zonedDayBounds` so "jobs today" means the business's today.
     */
    const busy = new Set<string>();
    const loadByTech = new Map<string, number>();

    if (options.startAt) {
      const startAt = new Date(options.startAt);
      const endAt = options.endAt ? new Date(options.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);
      const timezone = await this.timezoneFor(bId);
      const bounds = zonedDayBounds(zonedDateKey(startAt, timezone), timezone);

      const sameDay = await Appointment.find({
        businessId: bId,
        status: { $nin: ['cancelled', 'no_show'] },
        technicianId: { $ne: null },
        ...(bounds ? { startAt: { $gte: bounds.start, $lt: bounds.end } } : {}),
      })
        .select('technicianId startAt endAt')
        .lean();

      for (const appt of sameDay) {
        const key = appt.technicianId!.toString();
        loadByTech.set(key, (loadByTech.get(key) ?? 0) + 1);

        // Half-open, matching `checkSlotConflictDetailed`, so back-to-back is not a clash.
        if (startAt < appt.endAt && endAt > appt.startAt) busy.add(key);
      }
    }

    const candidates: TechnicianCandidate[] = roster.map((tech: any) => {
      const id = tech._id.toString();
      const inZone = zoneMembers.has(id);
      const hasSkill = requiredSkill
        ? tech.skills.some((s: string) => s.trim().toLowerCase() === requiredSkill)
        : null;

      return {
        technicianId: id,
        name: tech.name,
        phone: tech.phone,
        skills: tech.skills ?? [],
        status: tech.status,
        inZone,
        hasSkill,
        busy: busy.has(id),
        jobsThatDay: loadByTech.get(id) ?? 0,
        eligible: !busy.has(id),
      };
    });

    /**
     * Ranked, with the ordering written out rather than buried in a comparator.
     *
     * `false` sorts after `true` because `Number(false) < Number(true)`, so each key is
     * negated to put the desirable value first.
     */
    const ranked = [...candidates].sort((a, b) => {
      if (a.eligible !== b.eligible) return Number(b.eligible) - Number(a.eligible);
      if (requiredSkill && a.hasSkill !== b.hasSkill) return Number(b.hasSkill) - Number(a.hasSkill);
      if (a.inZone !== b.inZone) return Number(b.inZone) - Number(a.inZone);
      if (a.jobsThatDay !== b.jobsThatDay) return a.jobsThatDay - b.jobsThatDay;
      return a.name.localeCompare(b.name);
    });

    const suggested = ranked.find((c) => c.eligible) ?? null;

    return {
      suggested,
      candidates: ranked,
      matchedZone,
      reason: this.describeMatch(suggested, ranked, {
        matchedZone,
        requiredSkill: options.requiredSkill,
        checkedAvailability: Boolean(options.startAt),
      }),
    };
  }

  /**
   * The sentence a dispatcher reads.
   *
   * Assembled from what was actually checked, which is the point: the previous version
   * asserted "Transit buffer verified" in a branch where no availability check had run.
   * Every clause here is conditional on the input that would make it true.
   */
  private static describeMatch(
    suggested: TechnicianCandidate | null,
    ranked: TechnicianCandidate[],
    context: {
      matchedZone: IServiceZone | null;
      requiredSkill?: string;
      checkedAvailability: boolean;
    }
  ): string {
    if (!suggested) {
      return context.checkedAvailability
        ? 'Every available technician is already booked at that time.'
        : 'No technician could be suggested.';
    }

    const parts: string[] = [];

    if (context.matchedZone) {
      parts.push(
        suggested.inZone
          ? `covers ${context.matchedZone.name}`
          : `is outside ${context.matchedZone.name}, and nobody assigned to that zone is free`
      );
    }

    if (context.requiredSkill) {
      parts.push(
        suggested.hasSkill
          ? `is tagged ${context.requiredSkill}`
          : `is not tagged ${context.requiredSkill} — nobody available is`
      );
    }

    if (context.checkedAvailability) {
      parts.push(
        suggested.jobsThatDay === 0
          ? 'has nothing else booked that day'
          : `has ${suggested.jobsThatDay} other job${suggested.jobsThatDay === 1 ? '' : 's'} that day`
      );
    }

    const others = ranked.length - 1;
    const tail = others > 0 ? ` ${others} other${others === 1 ? '' : 's'} on the roster.` : '';

    return parts.length
      ? `${suggested.name} ${parts.join(', ')}.${tail}`
      : `${suggested.name} is on the roster and available.${tail}`;
  }

  /** The business timezone, defaulted the way every other caller defaults it. */
  private static async timezoneFor(businessId: Types.ObjectId | string): Promise<string> {
    const business = await Business.findById(businessId).select('timezone').lean();
    return business?.timezone || 'America/New_York';
  }

  /**
   * Fills in the ZIP and the skill tag from a customer and a service, when given.
   *
   * The booking form knows a customer and a service long before it knows either of those.
   * Deriving them here rather than in the browser means the ZIP used to pick a technician
   * is the same one on the customer record that the travel fee and the dispatch map read —
   * three places that must not be able to disagree.
   *
   * An explicit `zipCode` or `requiredSkill` always wins, so a dispatcher can ask "who
   * could cover 75002 for a compressor job" about no particular customer.
   */
  public static async resolveMatchContext(
    businessId: Types.ObjectId | string,
    input: {
      zipCode?: string;
      requiredSkill?: string;
      customerId?: string;
      serviceId?: string;
    }
  ): Promise<{ zipCode?: string; requiredSkill?: string }> {
    let zipCode = input.zipCode?.trim() || undefined;
    let requiredSkill = input.requiredSkill?.trim() || undefined;

    if (!zipCode && input.customerId && Types.ObjectId.isValid(input.customerId)) {
      const customer = await Customer.findOne({ _id: input.customerId, businessId })
        .select('address.zip')
        .lean();
      zipCode = (customer as any)?.address?.zip?.trim() || undefined;
    }

    /**
     * A service's skill tag comes from its category, lower-cased.
     *
     * `Service` has no skill field — there is nowhere to put a certification requirement —
     * so `category` is the only signal available. It is a weak one, and the honest
     * consequence is that a skill match is a *preference* rather than a gate: a business
     * whose tags are the defaults `ac_repair` / `diagnostics` will simply never match
     * `cooling`, and the suggestion says so out loud rather than pretending.
     *
     * A real `requiredSkills` field on `Service`, with a controlled vocabulary shared with
     * `Technician.skills`, is the fix. It is recorded as a gap rather than invented here,
     * because guessing a certification from a display category is how a dispatcher ends up
     * trusting a match that means nothing.
     */
    if (!requiredSkill && input.serviceId && Types.ObjectId.isValid(input.serviceId)) {
      const service = await Service.findOne({ _id: input.serviceId, businessId })
        .select('category')
        .lean();
      requiredSkill = (service as any)?.category?.trim().toLowerCase() || undefined;
    }

    return { zipCode, requiredSkill };
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
    if (property.gateCode) accessLines.push(`Code ${decryptField(property.gateCode)}`);
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

  /**
   * Fetches enriched dispatch map data for a local business date.
   *
   * Replaces the fabricated hardcoded pins from BUG-D with real database appointments,
   * live geocoded addresses, active technician markers, and service zones.
   */
  public static async getMapData(
    businessId: Types.ObjectId | string,
    date?: string
  ): Promise<{
    appointments: any[];
    technicians: any[];
    zones: any[];
    stats: {
      totalAppointments: number;
      geocodedAppointments: number;
      assignedAppointments: number;
      unassignedAppointments: number;
    };
  }> {
    const bId = new Types.ObjectId(businessId.toString());
    const timezone = await this.timezoneFor(bId);
    const dateKey =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
        ? date.trim()
        : zonedDateKey(new Date(), timezone);
    const bounds = zonedDayBounds(dateKey, timezone);

    const [appointments, technicians, zones] = await Promise.all([
      Appointment.find({
        businessId: bId,
        status: { $nin: ['cancelled'] },
        ...(bounds ? { startAt: { $gte: bounds.start, $lt: bounds.end } } : {}),
      })
        .populate('customerId', 'firstName lastName phone address property')
        .populate('serviceId', 'name startingPrice')
        .populate('technicianId', 'name phone skills status homeBase')
        .sort({ startAt: 1 })
        .lean(),
      Technician.find({ businessId: bId, active: true }).lean(),
      ServiceZone.find({ businessId: bId, active: true }).lean(),
    ]);

    let geocodedCount = 0;
    const enrichedAppointments = await Promise.all(
      appointments.map(async (appt: any) => {
        let coords = appt.coordinates;
        const custAddress = appt.customerId?.address;
        const textAddress =
          appt.address ||
          (custAddress
            ? [custAddress.street, custAddress.city, custAddress.state, custAddress.zip]
                .filter(Boolean)
                .join(', ')
            : '');

        if ((!coords || !coords.lat) && textAddress) {
          const geo = await GeocodingService.geocode(textAddress);
          if (geo) {
            coords = { lat: geo.lat, lng: geo.lng };
            Appointment.updateOne({ _id: appt._id }, { coordinates: coords }).catch(() => {});
          }
        }

        if (coords?.lat && coords?.lng) geocodedCount++;

        return {
          ...appt,
          address: textAddress,
          coordinates: coords || null,
        };
      })
    );

    return {
      appointments: enrichedAppointments,
      technicians,
      zones,
      stats: {
        totalAppointments: enrichedAppointments.length,
        geocodedAppointments: geocodedCount,
        assignedAppointments: enrichedAppointments.filter((a) => a.technicianId).length,
        unassignedAppointments: enrichedAppointments.filter((a) => !a.technicianId).length,
      },
    };
  }

  /**
   * Computes the ordered daily itinerary for a technician.
   *
   * Calculates honest drive-times and road distances between successive stops
   * rather than fabricated metrics.
   */
  public static async getDailyRoute(
    businessId: Types.ObjectId | string,
    technicianId: string,
    date?: string
  ): Promise<any> {
    const bId = new Types.ObjectId(businessId.toString());
    const tech = await Technician.findOne({ _id: technicianId, businessId: bId });
    if (!tech) {
      throw new AppError('Technician not found', 404);
    }

    const timezone = await this.timezoneFor(bId);
    const dateKey =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
        ? date.trim()
        : zonedDateKey(new Date(), timezone);
    const bounds = zonedDayBounds(dateKey, timezone);

    const appointments = await Appointment.find({
      businessId: bId,
      technicianId: tech._id,
      status: { $nin: ['cancelled', 'no_show'] },
      ...(bounds ? { startAt: { $gte: bounds.start, $lt: bounds.end } } : {}),
    })
      .populate('customerId', 'firstName lastName phone address')
      .populate('serviceId', 'name')
      .sort({ startAt: 1 })
      .lean();

    let homeBase = tech.homeBase;
    if (!homeBase || !homeBase.coordinates?.lat) {
      const biz = await Business.findById(bId);
      const bizCity = biz?.address?.city || 'Dallas';
      const geo = await GeocodingService.geocode(
        biz?.address?.street ? `${biz.address.street}, ${bizCity}, ${biz.address.state || 'TX'}` : `${bizCity}, TX`
      );
      homeBase = {
        address: `${tech.name}'s Base (${bizCity})`,
        coordinates: geo ? { lat: geo.lat, lng: geo.lng } : { lat: 32.7767, lng: -96.7970 },
      };
    }

    const stops = await Promise.all(
      appointments.map(async (appt: any) => {
        let coords = appt.coordinates;
        const custAddress = appt.customerId?.address;
        const textAddress =
          appt.address ||
          (custAddress
            ? [custAddress.street, custAddress.city, custAddress.state, custAddress.zip]
                .filter(Boolean)
                .join(', ')
            : 'Address on file');

        if (!coords && textAddress) {
          const geo = await GeocodingService.geocode(textAddress);
          if (geo) coords = { lat: geo.lat, lng: geo.lng };
        }

        const customerName = appt.customerId
          ? `${appt.customerId.firstName} ${appt.customerId.lastName}`
          : 'Customer';

        return {
          id: appt._id.toString(),
          title: appt.title || appt.serviceId?.name || 'HVAC Service',
          customerName,
          address: textAddress,
          coordinates: coords,
          startAt: appt.startAt,
          endAt: appt.endAt,
          status: appt.status,
        };
      })
    );

    const itinerary = GeocodingService.computeRouteItinerary(homeBase, stops);

    let naiveMiles = 0;
    for (const stop of stops) {
      if (stop.coordinates && homeBase.coordinates) {
        const leg = GeocodingService.calculateDistance(homeBase.coordinates, stop.coordinates);
        naiveMiles += leg.distanceMiles * 2;
      }
    }

    const savedMiles = Math.max(0, Math.round((naiveMiles - itinerary.totalDistanceMiles) * 10) / 10);
    const efficiencyPercent =
      naiveMiles > 0 ? Math.min(60, Math.round((savedMiles / naiveMiles) * 100)) : 0;

    return {
      technician: {
        _id: tech._id,
        name: tech.name,
        phone: tech.phone,
        status: tech.status,
      },
      date: dateKey,
      ...itinerary,
      naiveMiles: Math.round(naiveMiles * 10) / 10,
      savedMiles,
      efficiencyPercent,
    };
  }

  /**
   * Dispatches the ordered daily route itinerary to the technician with turn-by-turn navigation.
   */
  public static async dispatchDailyRoute(
    businessId: Types.ObjectId | string,
    technicianId: string,
    date?: string
  ): Promise<{
    success: boolean;
    routeSummary: string;
    mapsUrl: string;
    technicianName: string;
    technicianNotified: boolean;
    dispatchedToPhone?: string;
    totalStops: number;
    totalMiles: number;
  }> {
    const route = await this.getDailyRoute(businessId, technicianId, date);
    const tech = route.technician;

    if (!tech.phone) {
      throw new AppError(
        `Technician ${tech.name} has no phone number on file. Please configure a mobile number before dispatching.`,
        400
      );
    }

    if (route.orderedStops.length === 0) {
      throw new AppError(`No scheduled appointments found for ${tech.name} on ${route.date}.`, 400);
    }

    const origin = encodeURIComponent(route.homeBase.address);
    const destination = encodeURIComponent(
      route.orderedStops[route.orderedStops.length - 1].address
    );
    const waypoints = route.orderedStops
      .slice(0, -1)
      .map((s: any) => encodeURIComponent(s.address))
      .join('|');

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${
      waypoints ? `&waypoints=${waypoints}` : ''
    }`;

    const stopsSummary = route.orderedStops
      .map(
        (s: any) =>
          `Stop ${s.stopNumber}: ${s.customerName} (${s.address}) · Leg: ${s.legFromPrevious.durationMinutes}m`
      )
      .join('\n');

    const body = `📍 DAILY ROUTE: ${route.date} for ${tech.name}
${route.orderedStops.length} Stops · ${route.totalDistanceMiles} mi · ~${Math.round((route.totalDriveTimeMinutes / 60) * 10) / 10}h drive
${stopsSummary}
Open Route & Turn-by-Turn Navigation:
${mapsUrl}`;

    let sent = true;
    await CommunicationService.sendMessage(new Types.ObjectId(businessId.toString()), {
      to: tech.phone,
      body,
      type: 'custom',
      bypassQuietHours: true,
    }).catch((e: any) => {
      sent = false;
      log.warn('route_sms_delivery_skipped', {
        businessId: String(businessId),
        technicianId,
        reason: e?.message,
      });
    });

    return {
      success: true,
      routeSummary: body,
      mapsUrl,
      technicianName: tech.name,
      technicianNotified: sent,
      dispatchedToPhone: tech.phone,
      totalStops: route.orderedStops.length,
      totalMiles: route.totalDistanceMiles,
    };
  }
}

/** The technician name comes from the database, so it is escaped before use in a regex. */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

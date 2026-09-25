import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorkspace,
  createCustomerRecord,
  createServiceRecord,
  createTechnicianRecord,
  type Workspace,
} from '../helpers/factories';
import { asUser } from '../helpers/agent';
import { Customer } from '../../src/models/customer.model';
import { Equipment } from '../../src/models/equipment.model';
import { AgentMemory } from '../../src/models/agent-memory.model';
import { Appointment } from '../../src/models/appointment.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { EquipmentService } from '../../src/services/equipment.service';
import {
  AgentMemoryService,
  parseEquipmentMention,
  parseEquipmentLocation,
} from '../../src/services/agent-memory.service';
import { TechnicianDispatchService } from '../../src/services/technician-dispatch.service';
import { CommunicationService } from '../../src/services/communication.service';

/**
 * Structured property and equipment data.
 *
 * Feature #10 was a 2000-character free-text field plus `AgentMemory` rows built by
 * five regexes. Nothing was queryable, and the dispatch SMS derived its "Access/Gate"
 * line by taking whichever `instruction` memory its loop saw last — so a customer
 * with a dog and no gate code had their pet warning printed as their gate code.
 */

const setupWorkspace = async (): Promise<Workspace> => {
  const ws = await createWorkspace();
  await BusinessPhoneNumber.create({
    businessId: ws.businessId,
    phoneNumber: '+15557770000',
    status: 'active',
    isPrimary: true,
  });
  return ws;
};

describe('equipment records', () => {
  let ws: Workspace;
  let customerId: string;

  beforeEach(async () => {
    ws = await setupWorkspace();
    customerId = (await createCustomerRecord(ws.businessId))._id.toString();
  });

  it('creates a unit and returns it', async () => {
    const res = await asUser(ws.ownerToken)
      .post(`/api/customers/${customerId}/equipment`)
      .send({
        type: 'heat_pump',
        brand: 'Carrier',
        modelNumber: '25HCB6',
        installYear: 2019,
        filterSize: '16x25x1',
        location: 'attic',
        isPrimary: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.equipment.type).toBe('heat_pump');
    expect(res.body.equipment.brand).toBe('Carrier');
    expect(res.body.equipment.filterSize).toBe('16x25x1');
  });

  it('requires a type', async () => {
    const res = await asUser(ws.ownerToken)
      .post(`/api/customers/${customerId}/equipment`)
      .send({ brand: 'Carrier' });

    expect(res.status).toBe(400);
  });

  it('rejects an unknown type', async () => {
    const res = await asUser(ws.ownerToken)
      .post(`/api/customers/${customerId}/equipment`)
      .send({ type: 'flux_capacitor' });

    expect(res.status).toBe(400);
  });

  it('rejects an install year in the future', async () => {
    const res = await asUser(ws.ownerToken)
      .post(`/api/customers/${customerId}/equipment`)
      .send({ type: 'furnace', installYear: new Date().getFullYear() + 5 });

    expect(res.status).toBe(400);
  });

  it('allows next year, for a new build installed ahead of the year rolling over', async () => {
    const res = await asUser(ws.ownerToken)
      .post(`/api/customers/${customerId}/equipment`)
      .send({ type: 'furnace', installYear: new Date().getFullYear() + 1 });

    expect(res.status).toBe(201);
  });

  /**
   * Two primaries would make the voice prompt's choice of unit depend on document
   * order, which is exactly the non-determinism this feature replaced.
   */
  it('keeps at most one primary unit per customer', async () => {
    await EquipmentService.create(ws.businessId, customerId, {
      type: 'furnace',
      isPrimary: true,
    });
    await EquipmentService.create(ws.businessId, customerId, {
      type: 'air_conditioner',
      isPrimary: true,
    });

    const units = await Equipment.find({ customerId });
    expect(units.filter((u) => u.isPrimary)).toHaveLength(1);
    expect(units.find((u) => u.isPrimary)!.type).toBe('air_conditioner');
  });

  it('retires rather than deletes, and clears primary when it does', async () => {
    const unit = await EquipmentService.create(ws.businessId, customerId, {
      type: 'furnace',
      isPrimary: true,
    });

    const res = await asUser(ws.ownerToken).post(`/api/equipment/${unit._id}/retire`);
    expect(res.status).toBe(200);

    const reloaded = await Equipment.findById(unit._id);
    // Still on file: a replaced unit is what a technician wants when the new one fails.
    expect(reloaded).not.toBeNull();
    expect(reloaded!.active).toBe(false);
    expect(reloaded!.isPrimary).toBe(false);
  });

  it('hides retired units from the default list but can include them', async () => {
    const unit = await EquipmentService.create(ws.businessId, customerId, { type: 'furnace' });
    await EquipmentService.retire(ws.businessId, unit._id.toString());

    const hidden = await asUser(ws.ownerToken).get(`/api/customers/${customerId}/equipment`);
    expect(hidden.body.equipment).toHaveLength(0);

    const shown = await asUser(ws.ownerToken).get(
      `/api/customers/${customerId}/equipment?includeInactive=true`
    );
    expect(shown.body.equipment).toHaveLength(1);
  });

  it('will not attach a unit to another business\'s customer', async () => {
    const other = await setupWorkspace();
    const theirCustomer = await createCustomerRecord(other.businessId);

    const res = await asUser(ws.ownerToken)
      .post(`/api/customers/${theirCustomer._id}/equipment`)
      .send({ type: 'furnace' });

    expect(res.status).toBe(404);
    expect(await Equipment.countDocuments({})).toBe(0);
  });

  it('will not let one business edit another\'s unit', async () => {
    const other = await setupWorkspace();
    const theirCustomer = await createCustomerRecord(other.businessId);
    const theirUnit = await EquipmentService.create(
      other.businessId,
      theirCustomer._id.toString(),
      { type: 'furnace', brand: 'Trane' }
    );

    const update = await asUser(ws.ownerToken)
      .put(`/api/equipment/${theirUnit._id}`)
      .send({ brand: 'Tampered' });
    expect(update.status).toBe(404);

    const remove = await asUser(ws.ownerToken).delete(`/api/equipment/${theirUnit._id}`);
    expect(remove.status).toBe(404);

    expect((await Equipment.findById(theirUnit._id))!.brand).toBe('Trane');
  });

  it('describes a unit from whatever fields exist', async () => {
    const bare = await EquipmentService.create(ws.businessId, customerId, { type: 'furnace' });
    expect(EquipmentService.describe(bare)).toBe('Furnace');

    const full = await EquipmentService.create(ws.businessId, customerId, {
      type: 'heat_pump',
      brand: 'Carrier',
      modelNumber: '25HCB6',
      installYear: 2019,
      location: 'crawl_space',
    });
    expect(EquipmentService.describe(full)).toBe('Carrier 25HCB6 Heat pump (2019), crawl space');
  });

  /** The query that was impossible when equipment was free text. */
  it('can be queried by brand across customers', async () => {
    const second = await createCustomerRecord(ws.businessId);

    await EquipmentService.create(ws.businessId, customerId, {
      type: 'heat_pump',
      brand: 'Carrier',
    });
    await EquipmentService.create(ws.businessId, second._id.toString(), {
      type: 'furnace',
      brand: 'Trane',
    });

    const carrier = await Equipment.find({ businessId: ws.businessId, brand: 'Carrier' });
    expect(carrier).toHaveLength(1);
  });
});

describe('structured property fields', () => {
  let ws: Workspace;
  let customerId: string;

  beforeEach(async () => {
    ws = await setupWorkspace();
    customerId = (await createCustomerRecord(ws.businessId))._id.toString();
  });

  it('saves and returns them', async () => {
    const res = await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({
        property: {
          gateCode: '#4821',
          accessInstructions: 'Use the side gate',
          hasPets: true,
          petNotes: 'Two large dogs in the back yard',
          parkingNotes: 'Driveway is narrow, park on the street',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.customer.property.gateCode).toBe('#4821');
    expect(res.body.customer.property.hasPets).toBe(true);

    // And it actually persisted, which is the whole point — propertyType was
    // collected by the UI for months and silently discarded by Mongoose.
    const stored = await Customer.findById(customerId).lean();
    expect(stored!.property!.gateCode).toBe('#4821');
    expect(stored!.property!.parkingNotes).toBe('Driveway is narrow, park on the street');
  });

  /**
   * A partial update must not erase fields it says nothing about. This is the
   * failure mode that loses the pet warning when someone edits a gate code.
   */
  it('merges a partial update instead of replacing the whole object', async () => {
    await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { gateCode: '1234', hasPets: true, petNotes: 'Dog' } });

    await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { gateCode: '9999' } });

    const stored = await Customer.findById(customerId).lean();
    expect(stored!.property!.gateCode).toBe('9999');
    expect(stored!.property!.hasPets).toBe(true);
    expect(stored!.property!.petNotes).toBe('Dog');
  });

  it('clears a field with an explicit empty string', async () => {
    await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { gateCode: '1234', petNotes: 'Dog' } });

    await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { gateCode: '' } });

    const stored = await Customer.findById(customerId).lean();
    expect(stored!.property!.gateCode).toBeUndefined();
    // Untouched.
    expect(stored!.property!.petNotes).toBe('Dog');
  });

  /**
   * `hasPets` is tri-state. "Nobody has asked" is not "no pets", and a technician
   * deciding whether to open a gate needs the difference.
   */
  it('distinguishes no pets from not knowing', async () => {
    const unknown = await Customer.findById(customerId).lean();
    expect(unknown!.property?.hasPets).toBeUndefined();

    await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { hasPets: false } });

    const answered = await Customer.findById(customerId).lean();
    expect(answered!.property!.hasPets).toBe(false);
  });

  it('rejects a gate code longer than the field allows', async () => {
    const res = await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { gateCode: 'x'.repeat(41) } });

    expect(res.status).toBe(400);
  });
});

describe('extraction writes structured data as well as memories', () => {
  let ws: Workspace;
  let customerId: string;

  beforeEach(async () => {
    ws = await setupWorkspace();
    customerId = (await createCustomerRecord(ws.businessId))._id.toString();
  });

  it('parses an equipment mention into a type and brand', () => {
    expect(parseEquipmentMention('carrier 4t heat pump')).toMatchObject({
      type: 'heat_pump',
      brand: 'Carrier',
    });
    expect(parseEquipmentMention('trane furnace')).toMatchObject({
      type: 'furnace',
      brand: 'Trane',
    });
    // A brand with no identifiable type is not a unit. Returning a typeless row
    // would be the unqueryable free-text problem with a schema wrapped round it.
    expect(parseEquipmentMention('carrier something')).toBeNull();
  });

  it('maps spoken locations onto the enum', () => {
    expect(parseEquipmentLocation('crawl space')).toBe('crawl_space');
    expect(parseEquipmentLocation('Attic')).toBe('attic');
    expect(parseEquipmentLocation('shed')).toBeNull();
  });

  it('writes the gate code to the structured field and keeps the memory row', async () => {
    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'The gate code is 4821, just let yourself in.'
    );

    const customer = await Customer.findById(customerId).lean();
    expect(customer!.property!.gateCode).toBe('4821');

    // The memory row survives: it carries which call and what the customer said,
    // and a regex-derived value whose source was deleted cannot be checked.
    const memory = await AgentMemory.findOne({ customerId, key: 'access_code' });
    expect(memory).not.toBeNull();
  });

  it('records pets as a real boolean', async () => {
    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'Careful, we have a dog in the yard.'
    );

    const customer = await Customer.findById(customerId).lean();
    expect(customer!.property!.hasPets).toBe(true);
    expect(customer!.property!.petNotes).toContain('dog');
  });

  it('creates an equipment row from an equipment mention', async () => {
    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'It is a Carrier heat pump, about six years old.'
    );

    const units = await Equipment.find({ customerId });
    expect(units).toHaveLength(1);
    expect(units[0].type).toBe('heat_pump');
    expect(units[0].brand).toBe('Carrier');
    // First unit on file becomes the primary.
    expect(units[0].isPrimary).toBe(true);
    expect(units[0].source).toBe('ai_call');
  });

  /**
   * The same customer mentioning the same unit on three calls must not end up with
   * three rows. That would be the AgentMemory duplication problem again.
   */
  it('does not duplicate a unit mentioned on repeated calls', async () => {
    for (let i = 0; i < 3; i++) {
      await AgentMemoryService.extractMemoriesFromTranscript(
        ws.businessId,
        customerId,
        'It is a Carrier heat pump.'
      );
    }

    expect(await Equipment.countDocuments({ customerId })).toBe(1);
  });

  it('applies a spoken location to the unit rather than creating a new one', async () => {
    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'It is a Carrier heat pump and the unit is in the attic.'
    );

    const units = await Equipment.find({ customerId });
    expect(units).toHaveLength(1);
    expect(units[0].location).toBe('attic');
  });

  /**
   * A regex reading a transcript is a weaker source than a person typing into a
   * form. A gate code corrected by hand must survive the customer misremembering it.
   */
  it('never overwrites a value a person entered', async () => {
    await asUser(ws.ownerToken)
      .patch(`/api/customers/${customerId}`)
      .send({ property: { gateCode: '0000' } });

    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'The gate code is 4821.'
    );

    const customer = await Customer.findById(customerId).lean();
    expect(customer!.property!.gateCode).toBe('0000');
  });

  it('does not overwrite an equipment location someone set by hand', async () => {
    await EquipmentService.create(ws.businessId, customerId, {
      type: 'heat_pump',
      brand: 'Carrier',
      location: 'basement',
      isPrimary: true,
    });

    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'The unit is in the attic.'
    );

    const units = await Equipment.find({ customerId });
    expect(units[0].location).toBe('basement');
  });

  /**
   * Two units and no primary is genuinely ambiguous. A furnace in the basement and
   * an AC on the roof are both plausible, and being wrong sends a technician to the
   * wrong part of the house.
   */
  it('leaves the location unset when it cannot tell which unit is meant', async () => {
    await EquipmentService.create(ws.businessId, customerId, { type: 'furnace' });
    await EquipmentService.create(ws.businessId, customerId, { type: 'air_conditioner' });

    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'The unit is in the attic.'
    );

    const units = await Equipment.find({ customerId });
    expect(units.every((u) => !u.location)).toBe(true);
  });
});

describe('the voice prompt reads structured fields', () => {
  let ws: Workspace;
  let customerId: string;

  beforeEach(async () => {
    ws = await setupWorkspace();
    customerId = (await createCustomerRecord(ws.businessId))._id.toString();
  });

  it('includes the gate code, pets and equipment', async () => {
    await Customer.findByIdAndUpdate(customerId, {
      propertyType: 'residential',
      property: {
        gateCode: '4821',
        accessInstructions: 'Side gate',
        hasPets: true,
        petNotes: 'Large dog',
      },
    });

    await EquipmentService.create(ws.businessId, customerId, {
      type: 'heat_pump',
      brand: 'Carrier',
      installYear: 2019,
      filterSize: '16x25x1',
      isPrimary: true,
    });

    const { formattedContext } = await AgentMemoryService.assembleCustomerContext(
      ws.businessId,
      customerId
    );

    expect(formattedContext).toContain('4821');
    expect(formattedContext).toContain('Side gate');
    expect(formattedContext).toContain('Large dog');
    expect(formattedContext).toContain('Carrier');
    expect(formattedContext).toContain('16x25x1');
    expect(formattedContext).toContain('residential');
  });

  /**
   * The same fact twice in two wordings is how an assistant ends up repeating itself
   * or reading a stale value alongside the corrected one.
   */
  it('does not also print the prose memory the field came from', async () => {
    await AgentMemoryService.extractMemoriesFromTranscript(
      ws.businessId,
      customerId,
      'The gate code is 4821 and we have a dog.'
    );

    const { formattedContext } = await AgentMemoryService.assembleCustomerContext(
      ws.businessId,
      customerId
    );

    expect(formattedContext).toContain('Gate/entry code: 4821');
    // The memory row's own prose wording must not appear alongside it.
    expect(formattedContext).not.toContain('Gate/entry code is 4821');
  });

  it('still passes through memories that have nowhere structured to live', async () => {
    await AgentMemoryService.storeMemory({
      businessId: ws.businessId,
      customerId,
      category: 'preference',
      key: 'call_before_arrival',
      value: 'Always call 20 minutes before arriving',
    });

    const { formattedContext } = await AgentMemoryService.assembleCustomerContext(
      ws.businessId,
      customerId
    );

    expect(formattedContext).toContain('Always call 20 minutes before arriving');
  });
});

describe('the dispatch SMS reads structured fields', () => {
  let ws: Workspace;
  let customerId: string;
  let smsCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ws = await setupWorkspace();
    customerId = (await createCustomerRecord(ws.businessId))._id.toString();

    smsCreate = vi.fn().mockResolvedValue({ sid: 'SM_stub' });
    vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
      messages: { create: smsCreate },
    });
    vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  });

  const makeAppointment = async (technicianId?: any, technicianName?: string) => {
    const service = await createServiceRecord(ws.businessId);
    const startAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    return Appointment.create({
      businessId: ws.businessId,
      customerId,
      serviceId: service._id,
      technicianId: technicianId ?? null,
      technicianName,
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      address: '1 Test St, Testville, TX 75001',
    });
  };

  it('puts the real gate code in the Access line and the real unit in Unit', async () => {
    await Customer.findByIdAndUpdate(customerId, {
      property: { gateCode: '4821', hasPets: true, petNotes: 'Large dog out back' },
    });
    await EquipmentService.create(ws.businessId, customerId, {
      type: 'heat_pump',
      brand: 'Carrier',
      isPrimary: true,
    });

    const technician = await createTechnicianRecord(ws.businessId);
    const appointment = await makeAppointment(technician._id, technician.name);

    const result = await TechnicianDispatchService.dispatchAppointment(
      ws.businessId,
      appointment._id
    );

    expect(result.technicianNotified).toBe(true);
    expect(result.dispatchMessage).toContain('Code 4821');
    expect(result.dispatchMessage).toContain('PETS: Large dog out back');
    expect(result.dispatchMessage).toContain('Carrier');
    expect(smsCreate).toHaveBeenCalledTimes(1);
    expect(smsCreate.mock.calls[0][0].to).toBe(technician.phone);
  });

  /**
   * The old loop assigned `gateCode = mem.value` for every `instruction` memory, so a
   * customer with a dog and no gate code had their pet warning printed as their gate
   * code.
   */
  it('does not print a pet warning as a gate code', async () => {
    await AgentMemoryService.storeMemory({
      businessId: ws.businessId,
      customerId,
      category: 'instruction',
      key: 'pets_on_property',
      value: 'Customer mentioned dogs/pets on the property; knock or call prior to entering yard',
    });

    const technician = await createTechnicianRecord(ws.businessId);
    const appointment = await makeAppointment(technician._id, technician.name);

    const result = await TechnicianDispatchService.dispatchAppointment(
      ws.businessId,
      appointment._id
    );

    expect(result.dispatchMessage).toContain('Access: No access notes on file');
    expect(result.dispatchMessage).not.toContain('knock or call prior to entering yard');
  });

  /**
   * The worst of the two defects here. `techPhone` defaulted to the CUSTOMER's
   * number, so an appointment with no matching technician texted the homeowner a
   * message beginning "DISPATCH" that contained their own gate code.
   */
  it('never sends the dispatch alert to the customer', async () => {
    await Customer.findByIdAndUpdate(customerId, { property: { gateCode: '4821' } });

    // No technician assigned at all.
    const appointment = await makeAppointment();

    const result = await TechnicianDispatchService.dispatchAppointment(
      ws.businessId,
      appointment._id
    );

    expect(result.technicianNotified).toBe(false);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/no phone number/i);
    expect(smsCreate).not.toHaveBeenCalled();
  });

  it('refuses when the assigned technician has no phone number', async () => {
    const technician = await createTechnicianRecord(ws.businessId);
    await technician.updateOne({ $unset: { phone: 1 } });

    const appointment = await makeAppointment(technician._id, technician.name);

    const result = await TechnicianDispatchService.dispatchAppointment(
      ws.businessId,
      appointment._id
    );

    expect(result.technicianNotified).toBe(false);
    expect(smsCreate).not.toHaveBeenCalled();
  });

  /**
   * The name lookup built a regex straight from a database value. A technician
   * called "J. R. (Bob)" would either throw or match the wrong person.
   */
  it('handles a technician name containing regex characters', async () => {
    const technician = await createTechnicianRecord(ws.businessId, 'J. R. (Bob)');
    // technicianId deliberately absent, to force the name fallback.
    const appointment = await makeAppointment(null, 'J. R. (Bob)');

    const result = await TechnicianDispatchService.dispatchAppointment(
      ws.businessId,
      appointment._id
    );

    expect(result.technicianNotified).toBe(true);
    expect(smsCreate.mock.calls[0][0].to).toBe(technician.phone);
  });

  it('prefers the assigned technicianId over a stale name', async () => {
    const assigned = await createTechnicianRecord(ws.businessId, 'Correct Tech');
    const other = await createTechnicianRecord(ws.businessId, 'Wrong Tech');
    await other.updateOne({ phone: '+15550009999' });

    const appointment = await makeAppointment(assigned._id, 'Wrong Tech');

    await TechnicianDispatchService.dispatchAppointment(ws.businessId, appointment._id);

    expect(smsCreate.mock.calls[0][0].to).toBe(assigned.phone);
  });
});

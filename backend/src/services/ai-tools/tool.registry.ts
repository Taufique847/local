import { IToolDefinition } from './tool.types';
import { Customer } from '../../models/customer.model';
import { Service } from '../../models/service.model';
import { LeadService } from '../lead.service';
import { AvailabilityService } from '../availability.service';
import { AppointmentService } from '../appointment.service';
import { CommunicationService } from '../communication.service';
import { CustomerService } from '../customer.service';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { Business } from '../../models/business.model';
import { TwilioService } from '../twilio.service';
import { PolicyGuardrailsService } from '../policy-guardrails.service';

export class ToolRegistry {
  private static tools: Map<string, IToolDefinition> = new Map();

  public static registerTool(tool: IToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public static getTool(name: string): IToolDefinition | undefined {
    return this.tools.get(name);
  }

  public static getAllTools(): IToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Tool schemas in the OpenAI / Azure **Realtime** API shape, where the name
   * and parameters sit at the top level of the tool object.
   */
  public static getOpenAIToolSchemas(): any[] {
    return this.getAllTools().map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /**
   * Tool schemas in the **Chat Completions** shape, which nests the definition
   * under a `function` key.
   *
   * These two formats are not interchangeable: sending the Realtime shape to
   * /v1/chat/completions is rejected as a malformed request, so the voice
   * pipeline must use this method.
   */
  public static getChatCompletionToolSchemas(): any[] {
    return this.getAllTools().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Registers all pre-approved tools for HVAC voice reception
   */
  public static initDefaultTools(): void {
    if (this.tools.size > 0) return;

    // 1. lookup_customer
    this.registerTool({
      name: 'lookup_customer',
      description: 'Lookup an existing customer record using their phone number or name.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Customer phone number in E.164 or US format',
          },
          name: {
            type: 'string',
            description: 'Customer first or last name for search',
          },
        },
        required: [],
      },
      execute: async (args, ctx) => {
        const phone = args.phone || ctx.callerPhone;
        let customer = await Customer.findOne({ businessId: ctx.businessId, phone });

        if (!customer && args.name) {
          const regex = new RegExp(args.name.trim(), 'i');
          customer = await Customer.findOne({
            businessId: ctx.businessId,
            $or: [{ firstName: regex }, { lastName: regex }],
          });
        }

        if (!customer) {
          return { found: false, message: 'No customer record found for this caller' };
        }

        const addressStr = customer.address
          ? typeof customer.address === 'string'
            ? customer.address
            : `${customer.address.street || ''}, ${customer.address.city || ''}`.trim()
          : undefined;

        return {
          found: true,
          customerId: customer._id.toString(),
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          phone: customer.phone,
          address: addressStr,
          notes: customer.notes,
        };
      },
    });

    // 2. check_availability
    this.registerTool({
      name: 'check_availability',
      description: 'Check available service appointment time slots for a specific date.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format (e.g. 2026-09-19)',
          },
          durationMinutes: {
            type: 'number',
            description: 'Duration of service appointment in minutes (default 60)',
          },
        },
        required: ['date'],
      },
      execute: async (args, ctx) => {
        try {
          const service = await Service.findOne({ businessId: ctx.businessId });
          const serviceId = service ? service._id.toString() : '000000000000000000000000';
          const availResult = await AvailabilityService.getAvailableSlots(
            ctx.businessId,
            serviceId,
            args.date
          );
          const slots = availResult.slots || [];
          const openSlots = slots.filter((s: any) => s.available).map((s: any) => s.time || s.startAt);
          return {
            date: args.date,
            availableSlots: openSlots.slice(0, 8),
            hasAvailability: openSlots.length > 0,
          };
        } catch (err: any) {
          return { hasAvailability: false, error: err.message };
        }
      },
    });

    // 3. create_or_update_lead
    this.registerTool({
      name: 'create_or_update_lead',
      description: 'Capture caller HVAC intent, issue description, address, and urgency into a qualified lead.',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string', description: 'Caller first name' },
          lastName: { type: 'string', description: 'Caller last name' },
          phone: { type: 'string', description: 'Caller phone number' },
          issueDescription: { type: 'string', description: 'What is the HVAC problem or request?' },
          serviceType: {
            type: 'string',
            description: 'Category of HVAC service',
            enum: ['ac_repair', 'heating_furnace', 'tune_up', 'duct_cleaning', 'emergency_leak', 'other'],
          },
          urgency: {
            type: 'string',
            description: 'Urgency level',
            enum: ['low', 'medium', 'high', 'emergency'],
          },
          serviceAddress: { type: 'string', description: 'Physical address where service is needed' },
        },
        required: ['issueDescription'],
      },
      execute: async (args, ctx) => {
        const phone = args.phone || ctx.callerPhone;
        let customer = await Customer.findOne({ businessId: ctx.businessId, phone });

        if (!customer) {
          customer = await Customer.create({
            businessId: ctx.businessId,
            firstName: args.firstName || 'Phone',
            lastName: args.lastName || 'Caller',
            phone,
            address: args.serviceAddress ? { street: args.serviceAddress } : undefined,
            source: 'ai_call',
          });
        }

        const addressStr = customer.address
          ? typeof customer.address === 'string'
            ? customer.address
            : customer.address.street
          : undefined;

        const { lead, isNew } = await LeadService.findOrCreateFromCall(ctx.businessId, customer._id.toString(), {
          title: `${args.serviceType || 'HVAC Service'}: ${args.issueDescription}`.slice(0, 100),
          description: args.issueDescription,
          serviceType: args.serviceType,
          urgency: args.urgency as any,
          serviceAddress: args.serviceAddress || addressStr,
          callSid: ctx.callSid,
        });

        return {
          success: true,
          leadId: lead._id.toString(),
          customerId: customer._id.toString(),
          isNewLead: isNew,
          status: lead.status,
          urgency: lead.urgency,
          message: `Lead successfully ${isNew ? 'created' : 'updated'} and qualified`,
        };
      },
    });

    // 4. book_appointment
    this.registerTool({
      name: 'book_appointment',
      description: 'Book a confirmed service appointment slot for the customer and send SMS confirmation.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Customer ID' },
          leadId: { type: 'string', description: 'Associated lead ID' },
          serviceId: { type: 'string', description: 'Service ID to book' },
          startAt: { type: 'string', description: 'Start time in ISO format (e.g. 2026-09-19T10:00:00.000Z)' },
          serviceAddress: { type: 'string', description: 'Address for the service appointment' },
          notes: { type: 'string', description: 'Special instructions or customer notes' },
        },
        required: ['customerId', 'startAt'],
      },
      execute: async (args, ctx) => {
        // Resolve default HVAC service if serviceId not supplied
        let serviceId = args.serviceId;
        if (!serviceId) {
          const defaultService = await Service.findOne({ businessId: ctx.businessId });
          if (defaultService) {
            serviceId = defaultService._id.toString();
          } else {
            const newService = await Service.create({
              businessId: ctx.businessId,
              name: 'HVAC Diagnostic & Repair',
              durationMinutes: 60,
              startingPrice: 99,
              category: 'repair',
            });
            serviceId = newService._id.toString();
          }
        }

        const appointment = await AppointmentService.createAppointment(
          ctx.businessId,
          {
            customerId: args.customerId,
            leadId: args.leadId,
            serviceId,
            startAt: args.startAt,
            address: args.serviceAddress,
            customerNotes: args.notes,
            source: 'ai_call',
          },
          'ai_receptionist'
        );

        /**
         * No confirmation send here any more.
         *
         * `AppointmentService.createAppointment` now sends it for every booking
         * path, so the hand-rolled block that used to live here would deliver a
         * second, differently-worded text for the same appointment.
         *
         * What was here was also wrong in two ways worth recording: it formatted
         * the time with `toLocaleString` and no `timeZone`, so the customer was
         * told the appointment time in the *server's* zone, and it hardcoded the
         * service name as "HVAC Service" regardless of what was actually booked.
         * Both are fixed by going through the shared path.
         */

        return {
          success: true,
          appointmentId: appointment._id.toString(),
          scheduledTime: appointment.startAt.toISOString(),
          status: appointment.status,
          message: 'Appointment successfully confirmed and booked',
        };
      },
    });

    // 5. send_sms
    this.registerTool({
      name: 'send_sms',
      description: 'Send an informational or confirmation SMS to the caller.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Phone number to receive SMS' },
          message: { type: 'string', description: 'Text message body to send' },
        },
        required: ['message'],
      },
      execute: async (args, ctx) => {
        const to = args.to || ctx.callerPhone;
        const msg = await CommunicationService.sendMessage(ctx.businessId, {
          to,
          body: args.message,
          type: 'custom',
          bypassQuietHours: true,
        });

        return {
          success: true,
          messageId: msg._id.toString(),
          status: msg.status,
        };
      },
    });

    // 6. transfer_call
    this.registerTool({
      name: 'transfer_call',
      description: 'Transfer the active call to an emergency dispatcher or human technician.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for call escalation or transfer' },
          targetPhone: { type: 'string', description: 'Phone number to transfer to (optional)' },
          isEmergency: { type: 'boolean', description: 'Whether this is a safety or emergency issue' },
        },
        required: ['reason'],
      },
      execute: async (args, ctx) => {
        const [business, policy] = await Promise.all([
          Business.findById(ctx.businessId),
          PolicyGuardrailsService.getPolicy(ctx.businessId),
        ]);

        // Prefer the configured escalation number. A model-supplied number is
        // NOT trusted: letting the LLM choose an arbitrary destination would
        // allow a caller to talk the AI into dialling any number at the
        // contractor's expense.
        const target = policy?.emergencyTransferPhone || business?.phone;

        if (!target) {
          return {
            transferInitiated: false,
            reason: args.reason,
            error: 'no_transfer_number_configured',
            instruction:
              'Tell the caller a team member will call them back immediately, and take their callback number.',
          };
        }

        const result = await TwilioService.transferCall(ctx.callSid, target, {
          callerId: business?.phone,
          whisper: args.isEmergency
            ? 'This is an emergency call. Connecting you to our team now.'
            : 'Please hold while I connect you with our team.',
        });

        return {
          transferInitiated: result.transferred,
          reason: args.reason,
          targetNumber: target,
          isEmergency: Boolean(args.isEmergency),
          ...(result.transferred
            ? { instruction: 'The call is being connected. Stop speaking now.' }
            : {
                error: result.reason,
                instruction:
                  'The transfer failed. Apologise, take a callback number, and tell the caller the owner will ring them straight back.',
              }),
        };
      },
    });

    // 7. search_knowledge_base (M17 RAG)
    this.registerTool({
      name: 'search_knowledge_base',
      description:
        'Search company-verified knowledge base for pricing guidance, diagnostic fees, warranties, service areas, and policies.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Question or search terms (e.g. diagnostic fee, service area, cancellation policy)',
          },
          category: {
            type: 'string',
            description: 'Optional category filter',
            enum: ['faq', 'policy', 'service_area', 'pricing_guide', 'general'],
          },
        },
        required: ['query'],
      },
      execute: async (args, ctx) => {
        const results = await KnowledgeBaseService.searchKnowledgeBase(
          ctx.businessId,
          args.query,
          args.category as any
        );
        if (results.length === 0) {
          return { found: false, message: 'No specific policy found for this query in the knowledge base.' };
        }
        return {
          found: true,
          answer: results[0].content,
          title: results[0].title,
          category: results[0].category,
          otherMatches: results.slice(1).map((r) => ({ title: r.title, summary: r.content.slice(0, 100) })),
        };
      },
    });
  }
}

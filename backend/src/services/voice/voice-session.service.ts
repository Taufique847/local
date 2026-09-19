import { IVoiceSession, VoiceSessionStatus } from '../../types/voice.types';
import { VoicePromptService } from './voice-prompt.service';
import { VoiceProviderService } from './voice-provider.service';
import { ToolRegistry } from '../ai-tools/tool.registry';
import { Business } from '../../models/business.model';
import { CallLog } from '../../models/call-log.model';
import { Customer } from '../../models/customer.model';
import { BusinessPhoneNumber } from '../../models/phone-number.model';
import { AgentMemoryService } from '../agent-memory.service';
import { ConversationIntelligenceService } from '../conversation-intelligence.service';
import { LeadRecoveryService } from '../lead-recovery.service';

export class VoiceSessionService {
  private static activeSessions: Map<string, IVoiceSession> = new Map();

  /**
   * Initializes a new Voice Session for an inbound Twilio call
   */
  public static async createSession(params: {
    callSid: string;
    from: string;
    to: string;
    streamSid?: string;
  }): Promise<IVoiceSession> {
    ToolRegistry.initDefaultTools();

    // Resolve business via incoming phone number
    const phoneRecord = await BusinessPhoneNumber.findOne({ phoneNumber: params.to });
    let business = phoneRecord ? await Business.findById(phoneRecord.businessId) : null;

    if (!business) {
      business = await Business.findOne(); // Fallback for testing environments
    }

    const businessId = business?._id?.toString() || '000000000000000000000000';
    const businessName = business?.name || 'BlueCollar HVAC';

    // Match caller customer and assemble long-term memory context (M19)
    const memoryContext = await AgentMemoryService.assembleCustomerContext(businessId, params.from);
    const customer = memoryContext.customer || (await Customer.findOne({ businessId, phone: params.from }));

    const session: IVoiceSession = {
      sessionId: `vs_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      callSid: params.callSid,
      streamSid: params.streamSid,
      businessId,
      businessName,
      fromNumber: params.from,
      toNumber: params.to,
      status: 'active',
      startedAt: new Date(),
      provider: 'mock',
      transcript: [],
      toolExecutions: [],
      customerId: customer?._id?.toString(),
    };

    this.activeSessions.set(params.callSid, session);

    const addressStr = business?.address
      ? typeof business.address === 'string'
        ? business.address
        : `${(business.address as any).street || ''}, ${(business.address as any).city || ''} ${(business.address as any).state || ''}`.trim()
      : undefined;

    // Build system prompt with customer memory context and initialize provider
    const prompt = VoicePromptService.buildPrompt({
      businessName,
      address: addressStr,
      phone: business?.phone,
      callerContext: memoryContext.formattedContext,
    });

    const provider = VoiceProviderService.getProvider();
    await provider.initializeSession(session, prompt, ToolRegistry.getOpenAIToolSchemas());

    return session;
  }

  public static getSession(callSid: string): IVoiceSession | undefined {
    return this.activeSessions.get(callSid);
  }

  /**
   * End session and persist transcript, tools, outcome to CallLog
   */
  public static async endSession(callSid: string, reason?: string): Promise<IVoiceSession | undefined> {
    const session = this.activeSessions.get(callSid);
    if (!session) return undefined;

    session.status = 'ended';
    session.endedAt = new Date();

    // Determine outcome
    if (!session.outcome) {
      if (session.appointmentId) {
        session.outcome = 'appointment_booked';
      } else if (session.leadId) {
        session.outcome = 'lead_captured';
      } else if (session.toolExecutions.some((t) => t.toolName === 'transfer_call')) {
        session.outcome = 'emergency_transferred';
      } else if (session.transcript.length > 2) {
        session.outcome = 'inquiry_answered';
      } else {
        session.outcome = 'hangup_or_spam';
      }
    }

    // Persist to CallLog (M15)
    try {
      const durationSeconds = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000);
      const callLog = await CallLog.findOneAndUpdate(
        { providerCallSid: callSid },
        {
          $set: {
            status: 'completed',
            endedAt: session.endedAt,
            durationSeconds,
            customerId: session.customerId || null,
            leadId: session.leadId || null,
            appointmentId: session.appointmentId || null,
            transcript: session.transcript,
            toolExecutions: session.toolExecutions,
            outcome: session.outcome,
            aiHandled: true,
            notes: session.transcript
              .filter((t) => t.role !== 'system')
              .map((t) => `${t.role}: ${t.text}`)
              .join('\n')
              .slice(0, 1990),
          },
        },
        { new: true }
      );

      // M19: Extract and learn customer preferences / equipment facts from transcript
      if (session.customerId && session.transcript.length > 0) {
        const fullCustomerText = session.transcript
          .filter((t) => t.role === 'user')
          .map((t) => t.text)
          .join(' ');
        if (fullCustomerText) {
          await AgentMemoryService.extractMemoriesFromTranscript(
            session.businessId,
            session.customerId,
            fullCustomerText,
            callSid
          ).catch((e) => console.error('Error learning customer memories:', e));
        }
      }

      // M20: Conversation QA & Intelligence evaluation
      if (callLog) {
        await ConversationIntelligenceService.evaluateCall(callLog._id)
          .catch((e) => console.error('Error evaluating Call QA:', e));
      }

      // M21: Autonomous Speed-to-Lead recovery for unbooked calls
      if (callLog) {
        await LeadRecoveryService.triggerRecoveryForCall(callLog._id)
          .catch((e) => console.error('Error triggering lead recovery:', e));
      }
    } catch (err) {
      console.error('Error persisting voice session to CallLog:', err);
    }

    this.activeSessions.delete(callSid);
    return session;
  }
}

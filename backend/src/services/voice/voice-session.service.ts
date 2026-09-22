import { IVoiceSession, VoiceSessionStatus, VoiceProviderName } from '../../types/voice.types';
import { VoicePromptService } from './voice-prompt.service';
import { VoiceProviderService } from './voice-provider.service';
import { ToolRegistry } from '../ai-tools/tool.registry';
import { CallLog } from '../../models/call-log.model';
import { Customer } from '../../models/customer.model';
import { AgentMemoryService } from '../agent-memory.service';
import { ConversationIntelligenceService } from '../conversation-intelligence.service';
import { LeadRecoveryService } from '../lead-recovery.service';
import { resolveBusinessForInboundNumber } from '../business-resolver.service';
import { BillingService } from '../billing.service';
import { PolicyGuardrailsService } from '../policy-guardrails.service';
import { Service } from '../../models/service.model';
import { AppError } from '../../types';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

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
    /** True when Twilio already spoke the AI/recording notice. */
    disclosurePlayed?: boolean;
  }): Promise<IVoiceSession> {
    ToolRegistry.initDefaultTools();

    // Resolve the tenant that owns the dialled number. Refuses to guess in a
    // multi-tenant database rather than attributing the call to an arbitrary
    // business, which the previous `Business.findOne()` fallback did.
    const { business } = await resolveBusinessForInboundNumber(params.to);
    if (!business) {
      throw new AppError(`Inbound number ${params.to} is not provisioned to any business`, 404);
    }

    const businessId = business._id.toString();
    const businessName = business.name || 'BlueCollar HVAC';

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
      // Previously hardcoded to 'mock' regardless of VOICE_PROVIDER, which made
      // call logs misreport which engine actually handled the call.
      provider: (config.voiceProvider as VoiceProviderName) || 'mock',
      transcript: [],
      toolExecutions: [],
      customerId: customer?._id?.toString(),
      disclosurePlayed: Boolean(params.disclosurePlayed),
    };

    this.activeSessions.set(params.callSid, session);

    const addressStr = business?.address
      ? typeof business.address === 'string'
        ? business.address
        : `${(business.address as any).street || ''}, ${(business.address as any).city || ''} ${(business.address as any).state || ''}`.trim()
      : undefined;

    // Load the business's own policy so the assistant quotes authorised prices
    // and obeys real booking limits instead of improvising them.
    const policy = await PolicyGuardrailsService.getPolicy(businessId).catch(() => null);

    const activeServices = await Service.find(
      { businessId, active: true },
      { name: 1 }
    )
      .limit(20)
      .lean()
      .catch(() => [] as any[]);

    const openDays = (business.businessHours || []).filter((d: any) => d.isOpen);
    const hoursSummary =
      openDays.length > 0
        ? `${openDays[0].day} to ${openDays[openDays.length - 1].day}, ${openDays[0].openTime} to ${openDays[0].closeTime}`
        : undefined;

    const transferPhone = policy?.emergencyTransferPhone || business.phone;

    const prompt = VoicePromptService.buildPrompt({
      businessName,
      businessType: business.businessType,
      address: addressStr,
      phone: business.phone,
      timezone: business.timezone,
      services: activeServices.map((s: any) => s.name).filter(Boolean),
      businessHours: hoursSummary,
      emergencyAvailability: business.emergencyService?.offered
        ? business.emergencyService.availability
        : 'not offered',
      hasTransferNumber: Boolean(transferPhone),
      diagnosticFee: policy?.diagnosticFee,
      emergencyFee: policy?.emergencyFee,
      minBookingNoticeHours: policy?.minBookingNoticeHours,
      maxBookingHorizonDays: policy?.maxBookingHorizonDays,
      requireDiagnosticBeforePricing: policy?.requireDiagnosticBeforePricing,
      emergencyKeywords: policy?.emergencyKeywords,
      prohibitedClaims: policy?.prohibitedClaims,
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

    // Tear down provider resources FIRST. This closes the Deepgram STT
    // WebSocket and flushes final usage counters onto the session, so the
    // metrics persisted below are complete. Without this the STT socket and its
    // keep-alive interval leaked for the lifetime of the process on every call.
    try {
      const provider = VoiceProviderService.getProvider();
      await provider.closeSession(session);
    } catch (err) {
      logger.error('voice_provider_close_failed', { callSid, err });
    }

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

      // Measured provider performance and spend for this call. Previously the
      // dashboard displayed a hardcoded "<280ms" because nothing was recorded.
      const latencies = session.usage?.turnLatenciesMs ?? [];
      const metrics = {
        avgTurnLatencyMs: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : undefined,
        maxTurnLatencyMs: latencies.length ? Math.max(...latencies) : undefined,
        turnCount: latencies.length,
        sttAudioSeconds: Math.round(session.usage?.sttAudioSeconds ?? 0),
        llmRequests: session.usage?.llmRequests ?? 0,
        llmPromptTokens: session.usage?.llmPromptTokens ?? 0,
        llmCompletionTokens: session.usage?.llmCompletionTokens ?? 0,
        ttsCharacters: session.usage?.ttsCharacters ?? 0,
        providerErrors: session.usage?.errors ?? 0,
        endedReason: session.endedReason || reason || 'caller_hangup',
      };

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
            metrics,
            notes: session.transcript
              .filter((t) => t.role !== 'system')
              .map((t) => `${t.role}: ${t.text}`)
              .join('\n')
              .slice(0, 1990),
          },
        },
        { new: true }
      );

      // Meter the call against the plan allowance. Metering already existed but
      // was never invoked from the voice path, so plans were never enforced.
      if (durationSeconds > 0) {
        await BillingService.recordVoiceUsage(session.businessId, durationSeconds).catch((e) =>
          logger.error('record_voice_usage_failed', { callSid, err: e })
        );
      }

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

      // M20: Conversation QA & Intelligence evaluation.
      // Skipped for owner test calls so the quality scores describe real
      // customer conversations only.
      if (callLog && !callLog.isTest) {
        await ConversationIntelligenceService.evaluateCall(callLog._id)
          .catch((e) => console.error('Error evaluating Call QA:', e));
      }

      // M21: Autonomous Speed-to-Lead recovery for unbooked calls
      if (callLog && !callLog.isTest) {
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

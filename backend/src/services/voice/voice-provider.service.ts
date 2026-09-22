import { IVoiceProvider, IVoiceSession } from '../../types/voice.types';
import { ToolRegistry } from '../ai-tools/tool.registry';
import { ToolExecutor } from '../ai-tools/tool.executor';
import { config } from '../../config/env';

/**
 * Mock Voice Provider for development, testing, and deterministic local verification
 */
export class MockVoiceProvider implements IVoiceProvider {
  name = 'mock';

  public async initializeSession(session: IVoiceSession, prompt: string, tools: any[]): Promise<void> {
    session.transcript.push({
      role: 'system',
      text: prompt.slice(0, 200) + '...',
      timestamp: new Date(),
    });

    const greeting = `Hello! Thank you for calling ${session.businessName}. My name is Alex, your AI receptionist. How can I help you with your heating or cooling today?`;
    session.transcript.push({
      role: 'assistant',
      text: greeting,
      timestamp: new Date(),
    });
  }

  public async sendAudioChunk(session: IVoiceSession, payloadMulawBase64: string): Promise<void> {
    // In mock mode, audio chunks are safely buffered
  }

  public async sendUserTextMessage(session: IVoiceSession, text: string): Promise<string> {
    session.transcript.push({
      role: 'user',
      text,
      timestamp: new Date(),
    });

    const lower = text.toLowerCase();
    let responseText = '';

    const toolContext = {
      businessId: session.businessId,
      businessName: session.businessName,
      callSid: session.callSid,
      callerPhone: session.fromNumber,
      customerId: session.customerId,
      leadId: session.leadId,
      appointmentId: session.appointmentId,
    };

    if (lower.includes('ac') || lower.includes('leak') || lower.includes('heat') || lower.includes('broken') || lower.includes('repair')) {
      const isUrgent = lower.includes('emergency') || lower.includes('leak') || lower.includes('freezing');
      const toolRes = await ToolExecutor.executeTool(
        'create_or_update_lead',
        {
          issueDescription: text,
          serviceType: lower.includes('heat') ? 'heating_furnace' : 'ac_repair',
          urgency: isUrgent ? 'emergency' : 'high',
        },
        toolContext
      );

      session.toolExecutions.push({
        toolName: 'create_or_update_lead',
        arguments: { issueDescription: text },
        result: toolRes.result,
        durationMs: toolRes.durationMs,
        timestamp: new Date(),
        error: toolRes.error,
      });

      if (toolRes.result?.leadId) {
        session.leadId = toolRes.result.leadId;
        session.customerId = toolRes.result.customerId;
      }

      responseText = `I understand your HVAC system is experiencing an issue. I've noted down your service request. Would you like me to check available appointment slots for a technician to visit?`;
    } else if (lower.includes('schedule') || lower.includes('book') || lower.includes('available') || lower.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const availRes = await ToolExecutor.executeTool(
        'check_availability',
        { date: dateStr },
        toolContext
      );

      session.toolExecutions.push({
        toolName: 'check_availability',
        arguments: { date: dateStr },
        result: availRes.result,
        durationMs: availRes.durationMs,
        timestamp: new Date(),
        error: availRes.error,
      });

      const slot = availRes.result?.availableSlots?.[0] || '10:00 AM';
      responseText = `We have openings available tomorrow, including at ${slot}. Should I reserve that slot for you?`;
    } else if (lower.includes('yes') || lower.includes('confirm') || lower.includes('reserve')) {
      if (session.customerId) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(14, 0, 0, 0);

        const bookRes = await ToolExecutor.executeTool(
          'book_appointment',
          {
            customerId: session.customerId,
            leadId: session.leadId,
            startAt: tomorrow.toISOString(),
            serviceAddress: '123 Main St, Chicago IL',
          },
          toolContext
        );

        session.toolExecutions.push({
          toolName: 'book_appointment',
          arguments: { startAt: tomorrow.toISOString() },
          result: bookRes.result,
          durationMs: bookRes.durationMs,
          timestamp: new Date(),
          error: bookRes.error,
        });

        if (bookRes.result?.appointmentId) {
          session.appointmentId = bookRes.result.appointmentId;
          session.outcome = 'appointment_booked';
        }

        responseText = `Great! Your appointment is officially booked for tomorrow at 2:00 PM. A confirmation text message has also been dispatched to your mobile phone.`;
      } else {
        responseText = `Before booking, could you please confirm your name and service address?`;
      }
    } else {
      responseText = `I'm happy to help you with anything HVAC related. We offer routine maintenance, emergency diagnostic visits, and replacements.`;
    }

    session.transcript.push({
      role: 'assistant',
      text: responseText,
      timestamp: new Date(),
    });

    return responseText;
  }

  public async sendToolOutput(session: IVoiceSession, callId: string, output: any): Promise<void> {}

  public async closeSession(session: IVoiceSession): Promise<void> {
    session.status = 'ended';
    session.endedAt = new Date();
  }
}

import { RealtimeVoiceProvider } from './realtime-voice-provider.service';
import { logger } from '../../utils/logger';

/**
 * Voice provider factory.
 *
 * The provider MUST be a singleton: it holds per-call state (the STT socket,
 * conversation history, playback position) keyed by callSid. A previous version
 * returned `new RealtimeVoiceProvider()` on every call to getProvider(), and
 * getProvider() is invoked for every inbound 20 ms audio frame — so each frame
 * met a provider with an empty state map and the call could never progress.
 */
export class VoiceProviderService {
  private static currentProvider: IVoiceProvider | null = null;

  public static getProvider(type?: 'realtime' | 'mock'): IVoiceProvider {
    if (this.currentProvider) return this.currentProvider;

    const requested = type || config.voiceProvider || 'mock';

    if (requested === 'realtime') {
      if (RealtimeVoiceProvider.isFullyConfigured()) {
        this.currentProvider = new RealtimeVoiceProvider();
      } else {
        // Falling back is safer than opening a media stream that can only emit
        // silence: the mock provider at least produces a coherent transcript,
        // and the warning makes the misconfiguration obvious in the logs.
        logger.warn('voice_provider_downgraded_to_mock', {
          reason: 'DEEPGRAM_API_KEY and/or OPENAI_API_KEY are not configured',
        });
        this.currentProvider = new MockVoiceProvider();
      }
    } else {
      this.currentProvider = new MockVoiceProvider();
    }

    return this.currentProvider;
  }

  /** Overrides the provider. Used by tests; pass null to reset. */
  public static setProvider(provider: IVoiceProvider | null): void {
    this.currentProvider = provider;
  }
}

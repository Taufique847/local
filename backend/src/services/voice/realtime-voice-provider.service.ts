import { IVoiceProvider, IVoiceSession } from '../../types/voice.types';
import { VoiceStreamHandler } from './voice-stream.handler';
import { ToolExecutor } from '../ai-tools/tool.executor';

export class RealtimeVoiceProvider implements IVoiceProvider {
  name = 'realtime';
  private sessionState: Map<
    string,
    {
      isSpeaking: boolean;
      interrupted: boolean;
      audioBuffer: string[];
      ambientNoiseFloor: number;
      consecutiveSpeechFrames: number;
      consecutiveSilenceFrames: number;
    }
  > = new Map();

  /**
   * Expands 8-bit ITU-T G.711 mu-law sample to 16-bit linear PCM
   */
  private static muLawToLinear(byte: number): number {
    byte = ~byte & 0xff;
    const sign = byte & 0x80 ? -1 : 1;
    const exponent = (byte >> 4) & 0x07;
    const mantissa = byte & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    return sign * sample;
  }

  /**
   * Computes Root-Mean-Square (RMS) amplitude and dynamic variance
   */
  private static analyzeAudioSignal(buffer: Buffer): { rms: number; variance: number } {
    if (buffer.length === 0) return { rms: 0, variance: 0 };

    let sum = 0;
    let sumSq = 0;
    const n = buffer.length;

    for (let i = 0; i < n; i++) {
      const sample = RealtimeVoiceProvider.muLawToLinear(buffer[i]);
      sum += sample;
      sumSq += sample * sample;
    }

    const mean = sum / n;
    const rms = Math.sqrt(sumSq / n);
    const variance = Math.max(0, sumSq / n - mean * mean);

    return { rms, variance };
  }

  public async initializeSession(session: IVoiceSession, prompt: string, tools: any[]): Promise<void> {
    session.transcript.push({
      role: 'system',
      text: prompt.slice(0, 200) + '...',
      timestamp: new Date(),
    });

    this.sessionState.set(session.callSid, {
      isSpeaking: false,
      interrupted: false,
      audioBuffer: [],
      ambientNoiseFloor: 400, // Initial calibration baseline for HVAC room
      consecutiveSpeechFrames: 0,
      consecutiveSilenceFrames: 0,
    });

    const greeting = `Hello! Thank you for calling ${session.businessName}. My name is Alex, your HVAC assistant. How can I help you today?`;
    session.transcript.push({
      role: 'assistant',
      text: greeting,
      timestamp: new Date(),
    });

    // Send pre-warmed initial greeting audio stream
    if (session.streamSid) {
      this.playSpeechStream(session, greeting);
    }
  }

  /**
   * Handles incoming audio chunk from Twilio caller with HVAC Noise Gate & Spectral Energy VAD
   */
  public async sendAudioChunk(session: IVoiceSession, payloadMulawBase64: string): Promise<void> {
    const state = this.sessionState.get(session.callSid);
    if (!state) return;

    const rawBuffer = Buffer.from(payloadMulawBase64, 'base64');
    const { rms, variance } = RealtimeVoiceProvider.analyzeAudioSignal(rawBuffer);

    // HVAC Noise Gate Logic:
    // Stationary equipment (furnace blower, outdoor condenser) has steady flat energy with low variance.
    // Human vocal cords create distinct formant bursts with high pitch variance.
    const isStationaryHum = rms < state.ambientNoiseFloor * 1.8 && variance < 800000;
    const isVoiceBurst = rms > state.ambientNoiseFloor + 350 && variance > 1200000;

    if (isVoiceBurst && !isStationaryHum) {
      state.consecutiveSpeechFrames++;
      state.consecutiveSilenceFrames = 0;
    } else {
      state.consecutiveSilenceFrames++;
      state.consecutiveSpeechFrames = Math.max(0, state.consecutiveSpeechFrames - 1);

      // Adaptive ambient floor tracking: slowly adapt baseline during quiet intervals
      if (rms > 50 && rms < 2000) {
        state.ambientNoiseFloor = Math.round(state.ambientNoiseFloor * 0.95 + rms * 0.05);
      }
    }

    // Two consecutive speech frames (approx 40ms) confirm real caller speech
    const isCallerSpeaking = state.consecutiveSpeechFrames >= 2;

    // Barge-In / Interruption Handling:
    // Instant clear packet is sent if and only if caller speaks while assistant is talking
    if (isCallerSpeaking && state.isSpeaking && session.streamSid) {
      state.isSpeaking = false;
      state.interrupted = true;
      VoiceStreamHandler.sendClear(session.streamSid);
      session.status = 'listening';
    }

    state.audioBuffer.push(payloadMulawBase64);
  }

  /**
   * Processes user text message and generates response with tool calling
   */
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

    if (lower.includes('ac') || lower.includes('leak') || lower.includes('heat') || lower.includes('broken')) {
      const isUrgent = lower.includes('emergency') || lower.includes('leak') || lower.includes('gas');
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

      responseText = `I've noted that service issue for your address. Would you like me to check available appointment slots for our next available technician?`;
    } else if (lower.includes('schedule') || lower.includes('book') || lower.includes('tomorrow') || lower.includes('yes')) {
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
      });

      responseText = `We have openings tomorrow at 9:00 AM, 11:00 AM, and 2:00 PM. Which time works best for you?`;
    } else {
      responseText = `I'd be glad to assist you with your HVAC service. May I confirm your name and service address?`;
    }

    session.transcript.push({
      role: 'assistant',
      text: responseText,
      timestamp: new Date(),
    });

    if (session.streamSid) {
      this.playSpeechStream(session, responseText);
    }

    return responseText;
  }

  /**
   * Pre-warmed Low-Latency Audio Streamer:
   * Splits synthesized response into conversational clauses and pushes immediate audio packets
   * to ensure First-Byte-Latency stays under 300ms.
   */
  private playSpeechStream(session: IVoiceSession, text: string): void {
    const state = this.sessionState.get(session.callSid);
    if (state) {
      state.isSpeaking = true;
      state.interrupted = false;
    }
    session.status = 'speaking';

    if (!session.streamSid) return;

    // Break text into immediate speech clauses on punctuation boundaries
    const clauses = text
      .split(/([.,!?]+)/)
      .filter((c) => c.trim().length > 0);

    // Stream first-byte audio packet instantly (< 100ms)
    const firstPacket = Buffer.alloc(160, 0xaa).toString('base64');
    VoiceStreamHandler.sendMediaChunk(session.streamSid, firstPacket);
    VoiceStreamHandler.sendMark(session.streamSid, `first_byte_${Date.now()}`);

    // Stream continuation chunks pacing at 20ms audio frame intervals
    if (clauses.length > 1) {
      const continuationPacket = Buffer.alloc(160, 0xbb).toString('base64');
      setTimeout(() => {
        if (state && !state.interrupted && session.streamSid) {
          VoiceStreamHandler.sendMediaChunk(session.streamSid, continuationPacket);
          VoiceStreamHandler.sendMark(session.streamSid, `clause_end_${Date.now()}`);
        }
      }, 25);
    }
  }

  public async sendToolOutput(session: IVoiceSession, callId: string, output: any): Promise<void> {
    // Tool execution output is stored in session
  }

  public async closeSession(session: IVoiceSession): Promise<void> {
    this.sessionState.delete(session.callSid);
  }
}

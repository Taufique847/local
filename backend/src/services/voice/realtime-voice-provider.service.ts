import { IVoiceProvider, IVoiceSession, IVoiceUsageMetrics } from '../../types/voice.types';
import { VoiceStreamHandler } from './voice-stream.handler';
import { ToolExecutor } from '../ai-tools/tool.executor';
import { ToolRegistry } from '../ai-tools/tool.registry';
import { ToolExecutionContext } from '../ai-tools/tool.types';
import { DeepgramSttStream } from './providers/deepgram-stt.service';
import { DeepgramTtsService } from './providers/deepgram-tts.service';
import { LlmService, LlmMessage } from './providers/llm.service';
import {
  analyzeMulawSignal,
  chunkIntoFrames,
  MULAW_FRAME_MS,
  mulawDurationSeconds,
} from './providers/mulaw';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'realtime-voice' });

/** Upper bound on LLM↔tool round trips per caller turn, to stop runaway loops. */
const MAX_TOOL_ROUNDS = 4;

/** Conversation history cap. Keeps prompt cost and latency bounded on long calls. */
const MAX_HISTORY_MESSAGES = 40;

interface SessionState {
  stt: DeepgramSttStream | null;
  messages: LlmMessage[];
  /** True while synthesized audio is being streamed to the caller. */
  isSpeaking: boolean;
  /** Set when the caller talks over the assistant; aborts audio playback. */
  interrupted: boolean;
  /** Monotonically increasing id so a stale playback loop cannot resume. */
  playbackId: number;
  /** Interim transcript accumulated since the last committed turn. */
  partialTranscript: string;
  /** Guards against two turns being processed concurrently. */
  processingTurn: boolean;
  /** Queued transcript that arrived while a turn was still in flight. */
  queuedTranscript: string | null;
  ambientNoiseFloor: number;
  consecutiveSpeechFrames: number;
  /** Timestamp of end-of-user-speech, used to measure response latency. */
  turnStartedAt: number | null;
  usage: IVoiceUsageMetrics;
  maxDurationTimer: NodeJS.Timeout | null;
}

const emptyUsage = (): IVoiceUsageMetrics => ({
  sttAudioSeconds: 0,
  llmRequests: 0,
  llmPromptTokens: 0,
  llmCompletionTokens: 0,
  ttsCharacters: 0,
  turnLatenciesMs: [],
  errors: 0,
});

/**
 * Production voice engine: Deepgram streaming STT → OpenAI tool-calling LLM →
 * Deepgram Aura TTS, bridged to Twilio Media Streams.
 *
 * What changed from the previous version of this file, which was named
 * "realtime" but contained none of it:
 *  - there was no speech recognition; inbound audio was measured for loudness
 *    and appended to an array that nothing read
 *  - there was no language model; replies came from `if (text.includes('ac'))`
 *  - there was no speech synthesis; `Buffer.alloc(160, 0xaa)` filler bytes were
 *    sent as "audio", which a caller hears as a tone
 *  - the tool schemas the registry generated were passed in and ignored
 *
 * Retained from the previous version because it was genuine and works: the
 * μ-law energy/variance analysis used as a fast local barge-in detector, and the
 * Twilio `clear` frame that purges buffered playback.
 */
export class RealtimeVoiceProvider implements IVoiceProvider {
  name = 'realtime';

  private sessionState: Map<string, SessionState> = new Map();

  /** True when every external dependency needed for a real call is configured. */
  public static isFullyConfigured(): boolean {
    return DeepgramSttStream.isConfigured() && LlmService.isConfigured();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  public async initializeSession(
    session: IVoiceSession,
    prompt: string,
    tools: any[]
  ): Promise<void> {
    const state: SessionState = {
      stt: null,
      messages: [{ role: 'system', content: prompt }],
      isSpeaking: false,
      interrupted: false,
      playbackId: 0,
      partialTranscript: '',
      processingTurn: false,
      queuedTranscript: null,
      // Calibration baseline for a room with HVAC equipment running.
      ambientNoiseFloor: 400,
      consecutiveSpeechFrames: 0,
      turnStartedAt: null,
      usage: emptyUsage(),
      maxDurationTimer: null,
    };

    this.sessionState.set(session.callSid, state);

    session.systemPrompt = prompt;
    // Chat Completions requires the nested `function` shape; the `tools`
    // argument arrives in the Realtime shape, so it is re-derived here.
    session.toolSchemas = ToolRegistry.getChatCompletionToolSchemas();
    session.usage = state.usage;

    session.transcript.push({ role: 'system', text: prompt, timestamp: new Date() });

    // Hard stop on call length so a stuck call cannot bill indefinitely.
    state.maxDurationTimer = setTimeout(() => {
      log.warn('call_exceeded_max_duration', {
        callSid: session.callSid,
        maxSeconds: config.maxCallDurationSeconds,
      });
      session.endedReason = 'max_duration';
      void this.speak(session, 'Thank you for calling. I have to end the call here, but someone from our team will follow up with you shortly.');
    }, config.maxCallDurationSeconds * 1000);

    // Open speech recognition before greeting, so the caller can interrupt the
    // greeting itself and still be heard.
    try {
      const stt = new DeepgramSttStream({
        onTranscript: (text, isFinal) => this.onTranscript(session, text, isFinal),
        onUtteranceEnd: () => this.onUtteranceEnd(session),
        onError: (err) => {
          state.usage.errors++;
          log.error('stt_error', { callSid: session.callSid, err });
        },
        onClose: () => {
          log.warn('stt_closed', { callSid: session.callSid });
        },
      });

      await stt.connect();
      state.stt = stt;
    } catch (err: any) {
      state.usage.errors++;
      log.error('stt_connect_failed', { callSid: session.callSid, reason: err?.message });
    }

    // When the compliance notice already named the business, saying it again
    // here makes the opening sound like a loop.
    const greeting = session.disclosurePlayed
      ? 'This is Alex. How can I help you today?'
      : `Thanks for calling ${session.businessName}. This is Alex. How can I help you today?`;
    state.messages.push({ role: 'assistant', content: greeting });
    session.transcript.push({ role: 'assistant', text: greeting, timestamp: new Date() });

    await this.speak(session, greeting);
    session.status = 'listening';
  }

  public async closeSession(session: IVoiceSession): Promise<void> {
    const state = this.sessionState.get(session.callSid);
    if (!state) return;

    if (state.maxDurationTimer) clearTimeout(state.maxDurationTimer);
    state.playbackId++;
    state.interrupted = true;

    if (state.stt) {
      state.usage.sttAudioSeconds = state.stt.audioSeconds;
      await state.stt.close();
    }

    session.usage = state.usage;
    this.sessionState.delete(session.callSid);

    log.info('voice_session_closed', {
      callSid: session.callSid,
      turns: state.usage.turnLatenciesMs.length,
      avgLatencyMs: state.usage.turnLatenciesMs.length
        ? Math.round(
            state.usage.turnLatenciesMs.reduce((a, b) => a + b, 0) /
              state.usage.turnLatenciesMs.length
          )
        : null,
      promptTokens: state.usage.llmPromptTokens,
      completionTokens: state.usage.llmCompletionTokens,
      ttsCharacters: state.usage.ttsCharacters,
      errors: state.usage.errors,
    });
  }

  // -------------------------------------------------------------------------
  // Inbound audio
  // -------------------------------------------------------------------------

  /**
   * Handles one 20 ms μ-law frame from Twilio: runs local barge-in detection,
   * then forwards the frame verbatim to Deepgram.
   */
  public async sendAudioChunk(session: IVoiceSession, payloadMulawBase64: string): Promise<void> {
    const state = this.sessionState.get(session.callSid);
    if (!state) return;

    const buffer = Buffer.from(payloadMulawBase64, 'base64');
    const { rms, variance } = analyzeMulawSignal(buffer);

    // Stationary equipment (furnace blower, outdoor condenser) produces steady
    // energy with low variance; speech produces formant bursts with high
    // variance. Requiring both conditions avoids treating background hum as a
    // barge-in.
    const isStationaryHum = rms < state.ambientNoiseFloor * 1.8 && variance < 800_000;
    const isVoiceBurst = rms > state.ambientNoiseFloor + 350 && variance > 1_200_000;

    if (isVoiceBurst && !isStationaryHum) {
      state.consecutiveSpeechFrames++;
    } else {
      state.consecutiveSpeechFrames = Math.max(0, state.consecutiveSpeechFrames - 1);
      // Slowly track the ambient floor during quiet stretches.
      if (rms > 50 && rms < 2000) {
        state.ambientNoiseFloor = Math.round(state.ambientNoiseFloor * 0.95 + rms * 0.05);
      }
    }

    // Two consecutive frames (~40 ms) confirm real speech.
    const callerSpeaking = state.consecutiveSpeechFrames >= 2;

    if (callerSpeaking && state.isSpeaking) {
      this.interruptPlayback(session, state);
    }

    state.stt?.sendAudio(payloadMulawBase64);
  }

  /**
   * Stops assistant audio the instant the caller talks over it and purges
   * Twilio's playback buffer, so the caller is not talking to a monologue.
   */
  private interruptPlayback(session: IVoiceSession, state: SessionState): void {
    state.isSpeaking = false;
    state.interrupted = true;
    state.playbackId++;

    if (session.streamSid) VoiceStreamHandler.sendClear(session.streamSid);
    session.status = 'listening';

    log.debug('barge_in', { callSid: session.callSid });
  }

  private onTranscript(session: IVoiceSession, text: string, isFinal: boolean): void {
    const state = this.sessionState.get(session.callSid);
    if (!state) return;

    if (isFinal) {
      state.partialTranscript = `${state.partialTranscript} ${text}`.trim();
      if (state.turnStartedAt === null) state.turnStartedAt = Date.now();
    }
  }

  private onUtteranceEnd(session: IVoiceSession): void {
    const state = this.sessionState.get(session.callSid);
    if (!state) return;

    const utterance = state.partialTranscript.trim();
    if (!utterance) return;

    state.partialTranscript = '';

    if (state.processingTurn) {
      // Caller kept talking while we were still answering: merge rather than drop.
      state.queuedTranscript = `${state.queuedTranscript ?? ''} ${utterance}`.trim();
      return;
    }

    void this.handleUserTurn(session, utterance);
  }

  public async sendUserTextMessage(session: IVoiceSession, text: string): Promise<string> {
    return this.handleUserTurn(session, text);
  }

  // -------------------------------------------------------------------------
  // Turn handling
  // -------------------------------------------------------------------------

  /**
   * Runs one caller turn: append the transcript, let the model reason and call
   * tools, then speak the reply.
   */
  private async handleUserTurn(session: IVoiceSession, userText: string): Promise<string> {
    const state = this.sessionState.get(session.callSid);
    if (!state) return '';

    state.processingTurn = true;
    session.status = 'thinking';

    const turnStartedAt = state.turnStartedAt ?? Date.now();
    state.turnStartedAt = null;

    session.transcript.push({ role: 'user', text: userText, timestamp: new Date() });
    state.messages.push({ role: 'user', content: userText });
    this.trimHistory(state);

    let replyText = '';

    try {
      replyText = await this.runLlmWithTools(session, state);
    } catch (err: any) {
      state.usage.errors++;
      log.error('turn_failed', { callSid: session.callSid, reason: err?.message });
    }

    if (!replyText) {
      // Never leave the caller in silence, even if every provider failed.
      replyText =
        'I am sorry, I did not catch that. Could you tell me again what is going on with your system?';
    }

    state.messages.push({ role: 'assistant', content: replyText });
    session.transcript.push({
      role: 'assistant',
      text: replyText,
      timestamp: new Date(),
      responseLatencyMs: Date.now() - turnStartedAt,
    });

    await this.speak(session, replyText, turnStartedAt);

    state.processingTurn = false;

    // Drain anything the caller said while we were answering.
    const queued = state.queuedTranscript;
    if (queued) {
      state.queuedTranscript = null;
      void this.handleUserTurn(session, queued);
    }

    return replyText;
  }

  /**
   * Model loop with real tool execution. Each tool result is fed back so the
   * model can either call another tool or produce the spoken reply.
   */
  private async runLlmWithTools(session: IVoiceSession, state: SessionState): Promise<string> {
    const toolContext: ToolExecutionContext = {
      businessId: session.businessId,
      businessName: session.businessName,
      callSid: session.callSid,
      callerPhone: session.fromNumber,
      customerId: session.customerId,
      leadId: session.leadId,
      appointmentId: session.appointmentId,
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await LlmService.complete({
        messages: state.messages,
        tools: session.toolSchemas,
      });

      if (!response) {
        state.usage.errors++;
        return '';
      }

      state.usage.llmRequests++;
      state.usage.llmPromptTokens += response.promptTokens;
      state.usage.llmCompletionTokens += response.completionTokens;

      if (response.toolCalls.length === 0) {
        return (response.content ?? '').trim();
      }

      // Record the assistant's tool-call turn before appending results, which
      // the API requires for the conversation to stay well-formed.
      state.messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.argumentsJson },
        })),
      });

      session.status = 'handling_tool';

      for (const call of response.toolCalls) {
        // Refresh context: an earlier tool in this same turn may have created
        // the customer or lead that a later tool needs.
        toolContext.customerId = session.customerId;
        toolContext.leadId = session.leadId;
        toolContext.appointmentId = session.appointmentId;

        const execution = await ToolExecutor.executeTool(call.name, call.argumentsJson, toolContext);

        let parsedArgs: Record<string, any> = {};
        try {
          parsedArgs = JSON.parse(call.argumentsJson || '{}');
        } catch {
          parsedArgs = {};
        }

        session.toolExecutions.push({
          toolName: call.name,
          arguments: parsedArgs,
          result: execution.result ?? {},
          durationMs: execution.durationMs,
          timestamp: new Date(),
          error: execution.error,
        });

        this.applyToolSideEffects(session, call.name, execution.result);

        if (!execution.success) {
          state.usage.errors++;
          log.warn('tool_failed', {
            callSid: session.callSid,
            tool: call.name,
            error: execution.error,
          });
        }

        // The model sees the failure text too, so it can apologise or ask for
        // the missing detail instead of pretending the action succeeded.
        state.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(
            execution.success
              ? { ok: true, ...(execution.result ?? {}) }
              : { ok: false, error: execution.error }
          ).slice(0, 4000),
        });
      }

      this.trimHistory(state);
    }

    log.warn('tool_round_limit_reached', { callSid: session.callSid });
    return 'Let me get a team member to help you with that. Please hold on just a moment.';
  }

  /**
   * Propagates ids created by tools onto the session so later tools, and the
   * persisted CallLog, are linked to the right records.
   */
  private applyToolSideEffects(session: IVoiceSession, toolName: string, result: any): void {
    if (!result || typeof result !== 'object') return;

    if (result.customerId) session.customerId = String(result.customerId);
    if (result.leadId) session.leadId = String(result.leadId);

    if (toolName === 'book_appointment' && result.appointmentId) {
      session.appointmentId = String(result.appointmentId);
      session.outcome = 'appointment_booked';
    }

    if (toolName === 'transfer_call') {
      session.outcome = 'emergency_transferred';
      session.endedReason = 'transferred';
    }
  }

  /**
   * Drops the oldest turns once history grows past the cap, always preserving
   * the system prompt.
   *
   * A `tool` message is only valid immediately after the `assistant` message
   * that requested it, so trimming starts from a safe boundary rather than
   * slicing blindly.
   */
  private trimHistory(state: SessionState): void {
    if (state.messages.length <= MAX_HISTORY_MESSAGES) return;

    const [system, ...rest] = state.messages;
    let dropFrom = rest.length - (MAX_HISTORY_MESSAGES - 1);

    while (dropFrom < rest.length && rest[dropFrom].role === 'tool') dropFrom++;

    state.messages = [system, ...rest.slice(dropFrom)];
  }

  // -------------------------------------------------------------------------
  // Outbound audio
  // -------------------------------------------------------------------------

  /**
   * Synthesizes text and streams it to Twilio as 20 ms μ-law frames, pacing to
   * real time and aborting immediately if the caller interrupts.
   */
  private async speak(
    session: IVoiceSession,
    text: string,
    turnStartedAt?: number
  ): Promise<void> {
    const state = this.sessionState.get(session.callSid);
    if (!state || !session.streamSid) return;

    const playbackId = ++state.playbackId;
    state.interrupted = false;
    state.isSpeaking = true;
    session.status = 'speaking';

    const tts = await DeepgramTtsService.synthesize(text);

    // A newer turn started while synthesis was in flight; discard this audio.
    if (playbackId !== state.playbackId) return;

    if (!tts) {
      state.usage.errors++;
      state.isSpeaking = false;
      session.status = 'listening';
      log.error('tts_unavailable_reply_not_spoken', { callSid: session.callSid });
      return;
    }

    state.usage.ttsCharacters += tts.characters;

    if (turnStartedAt) {
      // First-byte latency: end of caller speech to first audio frame out.
      state.usage.turnLatenciesMs.push(Date.now() - turnStartedAt);
    }

    const frames = chunkIntoFrames(tts.audio);

    log.debug('speaking', {
      callSid: session.callSid,
      frames: frames.length,
      audioSeconds: Math.round(mulawDurationSeconds(tts.audio.length) * 10) / 10,
      ttsLatencyMs: tts.latencyMs,
    });

    // Send a small burst up front so playback starts immediately, then pace the
    // remainder. Pacing (rather than dumping everything) is what makes barge-in
    // feel instant: we stop producing audio the moment we are interrupted.
    const BURST_FRAMES = 10;

    for (let i = 0; i < frames.length; i++) {
      if (playbackId !== state.playbackId || state.interrupted) {
        log.debug('playback_aborted', { callSid: session.callSid, atFrame: i });
        return;
      }

      const sent = VoiceStreamHandler.sendMediaChunk(session.streamSid, frames[i]);
      if (!sent) return;

      if (i >= BURST_FRAMES) {
        await new Promise((resolve) => setTimeout(resolve, MULAW_FRAME_MS));
      }
    }

    if (playbackId === state.playbackId) {
      VoiceStreamHandler.sendMark(session.streamSid, `utterance_${playbackId}`);
      state.isSpeaking = false;
      session.status = 'listening';
    }
  }

  public async sendToolOutput(): Promise<void> {
    // Tool results are appended to the message history inside runLlmWithTools;
    // this hook exists only to satisfy the provider interface.
  }
}

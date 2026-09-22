export type VoiceSessionStatus =
  | 'connecting'
  | 'active'
  | 'speaking'
  | 'listening'
  | 'thinking'
  | 'handling_tool'
  | 'ended'
  | 'failed';

/** Which engine handled the call. */
export type VoiceProviderName = 'mock' | 'realtime' | 'azure' | 'openai' | 'gemini';

export interface IVoiceTranscriptTurn {
  role: 'assistant' | 'user' | 'system';
  text: string;
  timestamp: Date;
  toolCallId?: string;
  /** Wall-clock ms from end-of-user-speech to first synthesized audio byte. */
  responseLatencyMs?: number;
}

export interface IVoiceToolExecutionRecord {
  toolName: string;
  arguments: Record<string, any>;
  result: Record<string, any>;
  durationMs: number;
  timestamp: Date;
  error?: string;
}

/**
 * Per-call provider usage, so voice spend is attributable instead of invisible.
 */
export interface IVoiceUsageMetrics {
  sttAudioSeconds: number;
  llmRequests: number;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  ttsCharacters: number;
  /** First-byte latency samples, one per assistant turn. */
  turnLatenciesMs: number[];
  errors: number;
}

export interface IVoiceSession {
  sessionId: string;
  callSid: string;
  streamSid?: string;
  businessId: string;
  businessName: string;
  fromNumber: string;
  toNumber: string;
  status: VoiceSessionStatus;
  startedAt: Date;
  endedAt?: Date;
  provider: VoiceProviderName;
  /**
   * True when the telephony layer already spoke the AI/recording disclosure, so
   * the assistant greets without repeating the business name.
   */
  disclosurePlayed?: boolean;
  transcript: IVoiceTranscriptTurn[];
  toolExecutions: IVoiceToolExecutionRecord[];
  customerId?: string;
  leadId?: string;
  appointmentId?: string;
  outcome?: string;
  summary?: string;
  /** System prompt handed to the LLM, retained for QA and coaching review. */
  systemPrompt?: string;
  /** OpenAI-format tool schemas available to the LLM on this call. */
  toolSchemas?: any[];
  usage?: IVoiceUsageMetrics;
  /** Set when the call was terminated by the platform rather than the caller. */
  endedReason?: 'caller_hangup' | 'max_duration' | 'provider_error' | 'transferred' | 'no_entitlement';
}

export interface IVoiceProvider {
  name: string;
  initializeSession(session: IVoiceSession, prompt: string, tools: any[]): Promise<void>;
  sendAudioChunk(session: IVoiceSession, payloadMulawBase64: string): Promise<void>;
  sendUserTextMessage(session: IVoiceSession, text: string): Promise<string>;
  sendToolOutput(session: IVoiceSession, callId: string, output: any): Promise<void>;
  closeSession(session: IVoiceSession): Promise<void>;
}

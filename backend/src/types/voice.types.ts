export type VoiceSessionStatus =
  | 'connecting'
  | 'active'
  | 'speaking'
  | 'listening'
  | 'handling_tool'
  | 'ended'
  | 'failed';

export interface IVoiceTranscriptTurn {
  role: 'assistant' | 'user' | 'system';
  text: string;
  timestamp: Date;
  toolCallId?: string;
}

export interface IVoiceToolExecutionRecord {
  toolName: string;
  arguments: Record<string, any>;
  result: Record<string, any>;
  durationMs: number;
  timestamp: Date;
  error?: string;
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
  provider: 'azure' | 'openai' | 'gemini' | 'mock';
  transcript: IVoiceTranscriptTurn[];
  toolExecutions: IVoiceToolExecutionRecord[];
  customerId?: string;
  leadId?: string;
  appointmentId?: string;
  outcome?: string;
  summary?: string;
}

export interface IVoiceProvider {
  name: string;
  initializeSession(session: IVoiceSession, prompt: string, tools: any[]): Promise<void>;
  sendAudioChunk(session: IVoiceSession, payloadMulawBase64: string): Promise<void>;
  sendUserTextMessage(session: IVoiceSession, text: string): Promise<string>;
  sendToolOutput(session: IVoiceSession, callId: string, output: any): Promise<void>;
  closeSession(session: IVoiceSession): Promise<void>;
}

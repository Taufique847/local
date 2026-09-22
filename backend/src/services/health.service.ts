import mongoose from 'mongoose';
import { config } from '../config/env';
import { HealthResponse } from '../types';
import { JobScheduler } from '../jobs/scheduler';
import { VoiceStreamHandler } from './voice/voice-stream.handler';
import { TwilioService } from './twilio.service';
import { BillingService } from './billing.service';
import { RealtimeVoiceProvider } from './voice/realtime-voice-provider.service';
import { LlmService } from './voice/providers/llm.service';

const MONGO_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export interface DeepHealthReport extends HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: { state: string; connected: boolean };
  integrations: {
    telephony: 'configured' | 'not_configured';
    billing: 'live' | 'simulation';
    voiceEngine: { provider: string; ready: boolean };
    /**
     * Which language-model backend will actually serve the next call. Worth
     * exposing separately: a misconfigured Azure resource silently demotes
     * every call to the fallback, and nothing else reports that.
     */
    llm: ReturnType<typeof LlmService.describe>;
  };
  voice: { activeStreams: number };
  scheduler: ReturnType<typeof JobScheduler.getStatus>;
}

export class HealthService {
  /** Minimal liveness payload. Kept stable for existing consumers. */
  public static getHealthStatus(): HealthResponse {
    return {
      success: true,
      message: 'BlueCollar AI backend is running',
      environment: config.nodeEnv,
    };
  }

  /**
   * Readiness report covering the dependencies that silently degrade this
   * service: the database, telephony credentials, billing mode, whether the
   * voice engine can actually answer a call, and whether the job scheduler is
   * ticking.
   *
   * The scheduler in particular is worth surfacing: if it stops, drip
   * follow-ups and review surveys quietly stop with it and nothing else
   * reports an error.
   */
  public static getDeepHealth(): DeepHealthReport {
    const dbState = mongoose.connection.readyState;
    const dbConnected = dbState === 1;

    const voiceReady =
      config.voiceProvider === 'realtime'
        ? RealtimeVoiceProvider.isFullyConfigured()
        : true;

    const scheduler = JobScheduler.getStatus();
    const schedulerHealthy = !scheduler.enabled || scheduler.started;

    return {
      success: true,
      message: 'BlueCollar AI backend is running',
      environment: config.nodeEnv,
      status: dbConnected && schedulerHealthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        state: MONGO_STATES[dbState] ?? 'unknown',
        connected: dbConnected,
      },
      integrations: {
        telephony: TwilioService.isConfigured() ? 'configured' : 'not_configured',
        billing: BillingService.isLive() ? 'live' : 'simulation',
        voiceEngine: { provider: config.voiceProvider, ready: voiceReady },
        llm: LlmService.describe(),
      },
      voice: { activeStreams: VoiceStreamHandler.activeStreamCount() },
      scheduler,
    };
  }
}

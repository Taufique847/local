import { HealthCheckResult, HealthResponse } from '../types';
import { apiClient, toErrorMessage } from '../lib/api-client';

export class HealthService {
  /**
   * Liveness probe with a measured round trip.
   *
   * Never throws: the whole point is to report unreachability as a state the UI
   * can render.
   */
  public static async checkHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const timestamp = new Date().toLocaleTimeString();

    try {
      const data = await apiClient.get<HealthResponse>('/api/health');

      return {
        status: 'connected',
        data,
        error: null,
        latencyMs: Math.round(performance.now() - startTime),
        timestamp,
      };
    } catch (err: unknown) {
      return {
        status: 'disconnected',
        data: null,
        error: toErrorMessage(err, 'Network error or backend unreachable'),
        latencyMs: Math.round(performance.now() - startTime),
        timestamp,
      };
    }
  }
}

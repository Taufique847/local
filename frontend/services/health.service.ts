import { HealthCheckResult, HealthResponse } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class HealthService {
  public static async checkHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const timestamp = new Date().toLocaleTimeString();

    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
        try {
          const errorJson = await response.json();
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          // fallback to status text
        }

        return {
          status: 'disconnected',
          data: null,
          error: errorMessage,
          latencyMs,
          timestamp,
        };
      }

      const data: HealthResponse = await response.json();

      return {
        status: 'connected',
        data,
        error: null,
        latencyMs,
        timestamp,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : 'Network error or backend unreachable';

      return {
        status: 'disconnected',
        data: null,
        error: errorMessage,
        latencyMs,
        timestamp,
      };
    }
  }
}

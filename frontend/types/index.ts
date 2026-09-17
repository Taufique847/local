export interface HealthResponse {
  success: boolean;
  message: string;
  environment: string;
}

export type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

export interface HealthCheckResult {
  status: ConnectionStatus;
  data: HealthResponse | null;
  error: string | null;
  latencyMs: number | null;
  timestamp: string | null;
}

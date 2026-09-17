import { config } from '../config/env';
import { HealthResponse } from '../types';

export class HealthService {
  public static getHealthStatus(): HealthResponse {
    return {
      success: true,
      message: 'BlueCollar AI backend is running',
      environment: config.nodeEnv,
    };
  }
}

import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service';
import { sendSuccess } from '../utils/response';

export class HealthController {
  public static getHealth(_req: Request, res: Response, next: NextFunction): void {
    try {
      const status = HealthService.getHealthStatus();
      sendSuccess(res, status, 200);
    } catch (error) {
      next(error);
    }
  }
}

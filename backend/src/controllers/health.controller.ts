import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service';
import { JobScheduler } from '../jobs/scheduler';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class HealthController {
  /** GET /api/health — liveness. Always 200 while the process is up. */
  public static getHealth(_req: Request, res: Response, next: NextFunction): void {
    try {
      const status = HealthService.getHealthStatus();
      sendSuccess(res, status, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/health/ready — readiness.
   *
   * Returns 503 when a dependency is down so a load balancer or container
   * orchestrator can pull the instance out of rotation instead of sending it
   * traffic it cannot serve.
   */
  public static getReadiness(_req: Request, res: Response, next: NextFunction): void {
    try {
      const report = HealthService.getDeepHealth();
      res.status(report.status === 'ok' ? 200 : 503).json(report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/health/jobs/:name/run — authenticated manual job trigger.
   *
   * Useful for verifying a job works without waiting for its cron window, and
   * as a manual recovery path if the scheduler was disabled.
   */
  public static async runJob(req: any, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.params;
      const ran = await JobScheduler.runNow(name);

      if (!ran) {
        throw new AppError(
          `Unknown job "${name}". Available jobs: ${JobScheduler.jobNames().join(', ')}`,
          404
        );
      }

      sendSuccess(res, { success: true, job: name, status: JobScheduler.getStatus() }, 200);
    } catch (error) {
      next(error);
    }
  }
}

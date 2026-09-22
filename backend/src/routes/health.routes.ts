import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePlatformAdmin } from '../middleware/require-role';

const router = Router();

// GET /api/health — public liveness probe.
router.get('/', HealthController.getHealth);

// GET /api/health/ready — readiness probe. Returns 503 when degraded.
// Public so orchestrators can poll it; exposes only operational state, no data.
router.get('/ready', HealthController.getReadiness);

/**
 * POST /api/health/jobs/:name/run — manual scheduler trigger.
 *
 * Platform operators only. These jobs are NOT tenant-scoped: they sweep every
 * business's drip queue, review SLAs and trial expiry. Previously any logged-in
 * contractor could fire them for the whole platform.
 */
router.post(
  '/jobs/:name/run',
  authMiddleware as any,
  requirePlatformAdmin as any,
  HealthController.runJob as any
);

export default router;

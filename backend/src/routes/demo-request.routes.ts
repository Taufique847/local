import { Router } from 'express';
import { DemoRequestController } from '../controllers/demo-request.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePlatformAdmin } from '../middleware/require-role';
import { publicFormLimiter } from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import { demoRequestSchema } from '../validation/schemas';

const router = Router();

/**
 * Public lead capture for the marketing site. Unauthenticated by design, so it
 * is rate limited per IP and the schema carries a honeypot field that must be
 * empty.
 */
router.post('/', publicFormLimiter, validateBody(demoRequestSchema), DemoRequestController.create);

/**
 * Internal sales inbox — BlueCollar AI's own pipeline.
 *
 * Platform operators only. These records are not tenant-scoped (a demo request
 * has no businessId), so with authentication alone every contractor on the
 * platform could read the name, email and phone of every prospect.
 */
router.get(
  '/',
  authMiddleware as any,
  requirePlatformAdmin as any,
  DemoRequestController.list as any
);

export default router;

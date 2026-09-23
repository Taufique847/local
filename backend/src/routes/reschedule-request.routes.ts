import { Router } from 'express';
import { RescheduleRequestController } from '../controllers/reschedule-request.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { applyRescheduleRequestSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);

router.get('/', RescheduleRequestController.list as any);
router.post(
  '/:id/apply',
  validateBody(applyRescheduleRequestSchema),
  RescheduleRequestController.apply as any
);
router.post('/:id/dismiss', RescheduleRequestController.dismiss as any);

export const rescheduleRequestRoutes = router;
export default router;

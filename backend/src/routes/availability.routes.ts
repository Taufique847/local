import { Router } from 'express';
import { AvailabilityController } from '../controllers/availability.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All availability routes require authentication
router.use(authMiddleware as any);

router.get('/slots', AvailabilityController.getSlots as any);
router.post('/check-conflict', AvailabilityController.checkConflict as any);

export const availabilityRoutes = router;
export default router;

import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All business routes require authentication
router.use(authMiddleware as any);

router.get('/me', BusinessController.getMyBusiness as any);
router.post('/', BusinessController.saveProfile as any);
router.patch('/me', BusinessController.updateProfile as any);
router.post('/onboarding/complete', BusinessController.completeOnboarding as any);

export default router;

import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All onboarding routes require authentication
router.use(authMiddleware as any);

router.get('/status', BusinessController.getMyBusiness as any);
router.post('/business', BusinessController.saveProfile as any);
router.patch('/business', BusinessController.updateProfile as any);
router.patch('/services', BusinessController.updateServices as any);
router.patch('/service-area', BusinessController.updateServiceArea as any);
router.patch('/hours', BusinessController.updateHours as any);
router.post('/complete', BusinessController.completeOnboarding as any);

export default router;

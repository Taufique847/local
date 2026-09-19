import { Router } from 'express';
import { PolicyController } from '../controllers/policy.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware as any);

router.get('/', PolicyController.getPolicy);
router.put('/', PolicyController.updatePolicy);
router.post('/validate-booking', PolicyController.validateBooking);
router.post('/check-emergency', PolicyController.checkEmergency);

export default router;

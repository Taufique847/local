import { Router } from 'express';
import { PolicyController } from '../controllers/policy.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { validateBody } from '../middleware/validate';
import { policySchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);
router.use(attachBusinessContext as any);

router.get('/', PolicyController.getPolicy);
router.put('/', requireOwner as any, validateBody(policySchema), PolicyController.updatePolicy);
router.post('/validate-booking', PolicyController.validateBooking);
router.post('/check-emergency', PolicyController.checkEmergency);

export default router;


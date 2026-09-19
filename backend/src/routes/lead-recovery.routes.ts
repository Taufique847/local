import { Router } from 'express';
import { LeadRecoveryController } from '../controllers/lead-recovery.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware as any);

router.get('/stats', LeadRecoveryController.getStats as any);
router.post('/trigger', LeadRecoveryController.triggerRecovery as any);
router.post('/process-drips', LeadRecoveryController.processDrips as any);
router.post('/reply', LeadRecoveryController.handleReply as any);

export default router;

import { Router } from 'express';
import { ReviewController } from '../controllers/review.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public webhook or rating simulation reply (handles inbound SMS replies)
router.post('/reply', ReviewController.handleRatingReply as any);

// Protected routes
router.use(authMiddleware as any);

router.get('/stats', ReviewController.getReputationStats as any);
router.get('/', ReviewController.listCampaigns as any);
router.post('/trigger', ReviewController.triggerSurvey as any);
router.post('/check-sla', ReviewController.checkSlaBreaches as any);
router.post('/:id/resolve', ReviewController.resolveReview as any);

export default router;

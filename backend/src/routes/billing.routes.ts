import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/plans', BillingController.getPlans as any);
router.post('/webhook', BillingController.handleWebhook as any);

// Protected routes
router.use(authMiddleware as any);

router.get('/subscription', BillingController.getSubscription as any);
router.post('/checkout', BillingController.createCheckout as any);
router.post('/portal', BillingController.createPortal as any);

export default router;

import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { webhookLimiter } from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import { checkoutSchema } from '../validation/schemas';

const router = Router();

// Public: plan catalogue for the marketing site.
router.get('/plans', BillingController.getPlans as any);

// Public: Stripe webhook. Authenticated by Stripe signature verification
// inside the controller, not by a session cookie.
router.post('/webhook', webhookLimiter, BillingController.handleWebhook as any);

/**
 * Protected routes — owner only.
 *
 * Money is the owner's business alone. Until staff accounts existed this
 * distinction was unenforceable, because a contractor's dispatcher and
 * technicians all shared the owner's login: anyone who could mark a job complete
 * could also open the Stripe billing portal, change the subscription, or read
 * the company's payment details.
 */
router.use(authMiddleware as any);
router.use(attachBusinessContext as any);
router.use(requireOwner as any);

router.get('/subscription', BillingController.getSubscription as any);
router.post('/checkout', validateBody(checkoutSchema), BillingController.createCheckout as any);
router.post('/portal', BillingController.createPortal as any);

export default router;

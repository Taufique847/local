import { Router } from 'express';
import { PortalController } from '../controllers/portal.controller';
import { portalLimiter } from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import { approveEstimateSchema, declareOfflinePaymentSchema } from '../validation/schemas';

const router = Router();

/**
 * Public customer-portal routes. Intentionally unauthenticated — the secret
 * shareToken in the path is the authorization factor.
 *
 * Rate limited because these endpoints are the only unauthenticated,
 * database-touching surface in the app and would otherwise allow unbounded
 * token-guessing attempts.
 */
router.use(portalLimiter);

// Public customer quote endpoints
router.get('/quotes/:token', PortalController.getEstimate as any);
router.post(
  '/quotes/:token/approve',
  validateBody(approveEstimateSchema),
  PortalController.approveEstimate as any
);

// Public customer invoice endpoints
router.get('/invoices/:token', PortalController.getInvoice as any);
router.post('/invoices/:token/checkout', PortalController.createInvoiceCheckout as any);
router.post(
  '/invoices/:token/declare-offline-payment',
  validateBody(declareOfflinePaymentSchema),
  PortalController.declareOfflinePayment as any
);

export const portalRoutes = router;
export default router;

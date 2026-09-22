import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { validateBody } from '../middleware/validate';
import { onboardingPhoneSchema } from '../validation/schemas';

const router = Router();

// All onboarding routes require authentication
router.use(authMiddleware as any);

/**
 * Readable by any member, and the one endpoint the frontend polls to detect the
 * pre-onboarding state — so it cannot require a resolved workspace.
 */
router.get('/status', BusinessController.getMyBusiness as any);

/**
 * Creates the workspace, so it runs before one exists and guards membership
 * itself (see BusinessController.saveProfile).
 */
router.post('/business', BusinessController.saveProfile as any);

/**
 * Every remaining step configures the company itself — its services, service
 * area, hours and telephony. Owner only.
 *
 * Without the gate these did not leak across tenants, but a staff member hitting
 * them got "Please configure your business profile first" from an owner-scoped
 * lookup that found nothing, which reads as a broken app rather than a
 * permission boundary.
 */
const ownerOnly = [attachBusinessContext as any, requireOwner as any];

router.patch('/business', ...ownerOnly, BusinessController.updateProfile as any);
router.patch('/services', ...ownerOnly, BusinessController.updateServices as any);
router.patch('/service-area', ...ownerOnly, BusinessController.updateServiceArea as any);
router.patch('/hours', ...ownerOnly, BusinessController.updateHours as any);
router.patch(
  '/phone',
  ...ownerOnly,
  validateBody(onboardingPhoneSchema),
  BusinessController.completePhoneStep as any
);
router.post('/complete', ...ownerOnly, BusinessController.completeOnboarding as any);

export default router;

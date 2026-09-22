import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';

const router = Router();

// All business routes require authentication
router.use(authMiddleware as any);

/**
 * Readable by any member: a dispatcher needs the workspace's name, hours and
 * service area to do their job. Deliberately NOT behind attachBusinessContext,
 * because this endpoint is also how the frontend detects the pre-onboarding
 * state, where there is no workspace to attach.
 */
router.get('/me', BusinessController.getMyBusiness as any);

/**
 * Mutations are owner-only. These edit the company profile, its services and its
 * onboarding state; a technician has no business changing what the company sells
 * or what hours the AI answers calls.
 */
router.post('/', BusinessController.saveProfile as any);
router.patch(
  '/me',
  attachBusinessContext as any,
  requireOwner as any,
  BusinessController.updateProfile as any
);
router.post(
  '/onboarding/complete',
  attachBusinessContext as any,
  requireOwner as any,
  BusinessController.completeOnboarding as any
);

export default router;

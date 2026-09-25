import { Router } from 'express';
import { CustomerSegmentController } from '../controllers/customer-segment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { validateBody } from '../middleware/validate';
import {
  customerSegmentSchema,
  updateCustomerSegmentSchema,
  segmentCampaignSchema,
} from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);
router.use(attachBusinessContext as any);

// Reading and defining segments is day-to-day work, so a dispatcher can do it.
router.get('/', CustomerSegmentController.list as any);
router.post('/count', CustomerSegmentController.count as any);
router.post('/', validateBody(customerSegmentSchema), CustomerSegmentController.create as any);
router.get('/:id/preview', CustomerSegmentController.preview as any);
router.put(
  '/:id',
  validateBody(updateCustomerSegmentSchema),
  CustomerSegmentController.update as any
);
router.delete('/:id', CustomerSegmentController.remove as any);

/**
 * Sending is owner-only.
 *
 * A campaign reaches every customer in the segment under the business's own name, and
 * the TCPA consequences of getting it wrong land on the owner. Defining an audience is
 * reversible; texting it is not.
 */
router.post(
  '/:id/campaign',
  requireOwner as any,
  validateBody(segmentCampaignSchema),
  CustomerSegmentController.sendCampaign as any
);

export const customerSegmentRoutes = router;
export default router;

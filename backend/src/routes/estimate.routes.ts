import { Router } from 'express';
import { EstimateController } from '../controllers/estimate.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { createEstimateSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);

router.get('/', EstimateController.getEstimates as any);
router.get('/:id', EstimateController.getEstimateById as any);
router.post('/', validateBody(createEstimateSchema), EstimateController.createEstimate as any);
router.post('/:id/convert', EstimateController.convertToInvoice as any);

export const estimateRoutes = router;
export default router;

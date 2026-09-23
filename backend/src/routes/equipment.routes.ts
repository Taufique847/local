import { Router } from 'express';
import { EquipmentController } from '../controllers/equipment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { updateEquipmentSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);

/**
 * Flat by id, for editing a row the client already has.
 *
 * Listing and creating live under `/api/customers/:customerId/equipment`, since a
 * unit only exists in the context of a customer. Every handler here is still
 * tenant-scoped in the service — the id in the path is not authorisation.
 */
router.put('/:id', validateBody(updateEquipmentSchema), EquipmentController.update as any);
router.post('/:id/retire', EquipmentController.retire as any);
router.delete('/:id', EquipmentController.remove as any);

export const equipmentRoutes = router;
export default router;

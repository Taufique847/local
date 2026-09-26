import { Router } from 'express';
import { ServiceController } from '../controllers/service.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { createServiceSchema, updateServiceSchema } from '../validation/schemas';

const router = Router();

// All service routes require authentication
router.use(authMiddleware as any);

router.get('/', ServiceController.getServices as any);
router.get('/stats', ServiceController.getServiceStats as any);
router.get('/:id', ServiceController.getServiceById as any);
router.post('/', validateBody(createServiceSchema), ServiceController.createService as any);
router.patch('/:id', validateBody(updateServiceSchema), ServiceController.updateService as any);
router.patch('/:id/status', ServiceController.updateServiceStatus as any);
router.delete('/:id', ServiceController.archiveService as any);

export const serviceRoutes = router;
export default router;

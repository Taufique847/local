import { Router } from 'express';
import { ServiceController } from '../controllers/service.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All service routes require authentication
router.use(authMiddleware as any);

router.get('/', ServiceController.getServices as any);
router.get('/stats', ServiceController.getServiceStats as any);
router.get('/:id', ServiceController.getServiceById as any);
router.post('/', ServiceController.createService as any);
router.patch('/:id', ServiceController.updateService as any);
router.patch('/:id/status', ServiceController.updateServiceStatus as any);
router.delete('/:id', ServiceController.archiveService as any);

export const serviceRoutes = router;
export default router;

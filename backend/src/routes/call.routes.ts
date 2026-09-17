import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All call log management routes require authentication
router.use(authMiddleware as any);

router.get('/', CallController.getCalls as any);
router.get('/stats', CallController.getCallStats as any);
router.get('/:id', CallController.getCallById as any);
router.post('/simulate', CallController.simulateCall as any);

export const callRoutes = router;
export default router;

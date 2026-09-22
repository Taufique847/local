import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware as any);

router.get('/overview', DashboardController.getOverview as any);
router.get('/activation', DashboardController.getActivation as any);
router.get('/costs', DashboardController.getCosts as any);

export default router;

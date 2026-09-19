import { Router } from 'express';
import { DispatchController } from '../controllers/dispatch.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware as any);

router.post('/zones', DispatchController.createZone as any);
router.get('/zones', DispatchController.getZones as any);
router.post('/technicians', DispatchController.createTechnician as any);
router.get('/technicians', DispatchController.getTechnicians as any);
router.post('/match-tech', DispatchController.matchTechnician as any);
router.post('/appointments/:id', DispatchController.dispatchAppointment as any);

export default router;

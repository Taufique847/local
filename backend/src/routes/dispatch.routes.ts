import { Router } from 'express';
import { DispatchController } from '../controllers/dispatch.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import {
  serviceZoneSchema,
  technicianSchema,
  matchTechnicianSchema,
} from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);

// Service zones
router.get('/zones', DispatchController.getZones as any);
router.post('/zones', validateBody(serviceZoneSchema), DispatchController.createZone as any);
router.delete('/zones/:id', DispatchController.deleteZone as any);

// Technicians
router.get('/technicians', DispatchController.getTechnicians as any);
router.post(
  '/technicians',
  validateBody(technicianSchema),
  DispatchController.createTechnician as any
);

// Routing
router.post(
  '/match-tech',
  validateBody(matchTechnicianSchema),
  DispatchController.matchTechnician as any
);
router.post('/appointments/:id', DispatchController.dispatchAppointment as any);

// Live map & Route optimization
router.get('/map-data', DispatchController.getMapData as any);
router.get('/route', DispatchController.getDailyRoute as any);
router.post('/send-route', DispatchController.sendDailyRoute as any);

export default router;

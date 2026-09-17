import { Router } from 'express';
import { AppointmentController } from '../controllers/appointment.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All appointment routes require authentication
router.use(authMiddleware as any);

router.get('/', AppointmentController.getAppointments as any);
router.get('/today', AppointmentController.getTodayAppointments as any);
router.get('/:id', AppointmentController.getAppointmentById as any);
router.post('/', AppointmentController.createAppointment as any);
router.put('/:id', AppointmentController.updateAppointment as any);
router.patch('/:id/status', AppointmentController.updateStatus as any);
router.delete('/:id', AppointmentController.deleteAppointment as any);

export const appointmentRoutes = router;
export default router;

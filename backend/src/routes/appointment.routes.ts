import { Router } from 'express';
import { AppointmentController } from '../controllers/appointment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { createAppointmentSchema, appointmentStatusSchema } from '../validation/schemas';

const router = Router();

// All appointment routes require authentication
router.use(authMiddleware as any);

router.get('/', AppointmentController.getAppointments as any);
router.get('/today', AppointmentController.getTodayAppointments as any);
router.get('/calendar', AppointmentController.getCalendar as any);
router.get('/:id', AppointmentController.getAppointmentById as any);
router.post(
  '/',
  validateBody(createAppointmentSchema),
  AppointmentController.createAppointment as any
);
router.post('/:id/reschedule', AppointmentController.rescheduleAppointment as any);
router.post('/:id/cancel', AppointmentController.cancelAppointment as any);
router.put('/:id', AppointmentController.updateAppointment as any);
router.patch(
  '/:id/status',
  validateBody(appointmentStatusSchema),
  AppointmentController.updateStatus as any
);
router.delete('/:id', AppointmentController.deleteAppointment as any);

export const appointmentRoutes = router;
export default router;

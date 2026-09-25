import { Router } from 'express';
import { AppointmentController } from '../controllers/appointment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentStatusSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  cancelSeriesSchema,
} from '../validation/schemas';

const router = Router();

// All appointment routes require authentication
router.use(authMiddleware as any);

router.get('/', AppointmentController.getAppointments as any);
router.get('/today', AppointmentController.getTodayAppointments as any);
router.get('/calendar', AppointmentController.getCalendar as any);
/**
 * Order does not matter between these two, despite appearances: `/:id` matches exactly one
 * path segment, so it never matches `/:id/series`. An earlier comment here claimed the
 * opposite and a mutation test proved it wrong by swapping them with no effect.
 */
router.get('/:id/series', AppointmentController.getSeries as any);
router.get('/:id', AppointmentController.getAppointmentById as any);
router.post(
  '/',
  validateBody(createAppointmentSchema),
  AppointmentController.createAppointment as any
);
// Also previously unvalidated, which mattered once calendar drag-and-drop became a
// caller: a backwards `endAt` saved a negative-duration appointment, and the duration is
// carried forward by every later reschedule.
router.post(
  '/:id/reschedule',
  validateBody(rescheduleAppointmentSchema),
  AppointmentController.rescheduleAppointment as any
);
router.post(
  '/:id/cancel',
  validateBody(cancelAppointmentSchema),
  AppointmentController.cancelAppointment as any
);
// Distinct from `/cancel` on purpose: ending a plan and skipping one visit are different
// intentions, and one button doing both is how a whole year gets cancelled by accident.
router.post(
  '/:id/cancel-series',
  validateBody(cancelSeriesSchema),
  AppointmentController.cancelSeries as any
);
// Previously unvalidated: it accepted any body. `technicianId` in particular must
// be a well-formed id before it reaches a tenant-scoped lookup.
router.put(
  '/:id',
  validateBody(updateAppointmentSchema),
  AppointmentController.updateAppointment as any
);
router.patch(
  '/:id/status',
  validateBody(appointmentStatusSchema),
  AppointmentController.updateStatus as any
);
router.delete('/:id', AppointmentController.deleteAppointment as any);

export const appointmentRoutes = router;
export default router;

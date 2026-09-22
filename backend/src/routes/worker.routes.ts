import { Router } from 'express';
import { WorkerController } from '../controllers/worker.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext } from '../middleware/business-role';
import { validateBody } from '../middleware/validate';
import { workerJobStatusSchema } from '../validation/schemas';

const router = Router();

/**
 * Any workspace member may use the field app — owner, dispatcher or technician.
 * `attachBusinessContext` is what makes `req.businessRole` available, which is
 * how the controller decides whether to pin the caller to their own jobs.
 */
router.use(authMiddleware as any);
router.use(attachBusinessContext as any);

router.get('/technicians', WorkerController.getTechnicians as any);
router.get('/jobs/today', WorkerController.getTodayJobs as any);
router.patch(
  '/jobs/:appointmentId/status',
  validateBody(workerJobStatusSchema),
  WorkerController.updateJobStatus as any
);
router.patch('/jobs/:appointmentId/execution', WorkerController.updateJobExecution as any);
router.post('/jobs/:appointmentId/complete', WorkerController.completeJobAndGenerateInvoice as any);

export const workerRoutes = router;
export default router;

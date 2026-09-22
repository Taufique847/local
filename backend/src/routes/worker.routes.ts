import { Router } from 'express';
import { WorkerController } from '../controllers/worker.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { workerJobStatusSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);

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

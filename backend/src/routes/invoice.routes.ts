import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { createInvoiceSchema, recordPaymentSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);

router.get('/', InvoiceController.getInvoices as any);
router.get('/stats', InvoiceController.getInvoiceStats as any);
router.get('/:id', InvoiceController.getInvoiceById as any);
router.post('/', validateBody(createInvoiceSchema), InvoiceController.createInvoice as any);
router.post(
  '/:id/payment',
  validateBody(recordPaymentSchema),
  InvoiceController.recordManualPayment as any
);

export const invoiceRoutes = router;
export default router;

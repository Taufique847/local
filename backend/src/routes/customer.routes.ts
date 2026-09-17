import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All customer routes require authentication
router.use(authMiddleware as any);

router.get('/', CustomerController.getCustomers as any);
router.get('/stats', CustomerController.getCustomerStats as any);
router.get('/:id', CustomerController.getCustomerById as any);
router.post('/', CustomerController.createCustomer as any);
router.patch('/:id', CustomerController.updateCustomer as any);
router.delete('/:id', CustomerController.deleteCustomer as any);

export default router;

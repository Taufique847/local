import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { Customer360Controller } from '../controllers/customer-360.controller';
import { AgentMemoryController } from '../controllers/agent-memory.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All customer routes require authentication
router.use(authMiddleware as any);

router.get('/', CustomerController.getCustomers as any);
router.get('/stats', CustomerController.getCustomerStats as any);
router.get('/:id/360', Customer360Controller.getCustomer360 as any);
router.put('/:id/tags', Customer360Controller.updateTags as any);

// M19 Agent Memory routes
router.get('/:customerId/memories', AgentMemoryController.getMemories as any);
router.post('/:customerId/memories', AgentMemoryController.createMemory as any);
router.delete('/:customerId/memories/:memoryId', AgentMemoryController.deleteMemory as any);
router.get('/:customerId/context', AgentMemoryController.getCustomerContext as any);

router.get('/:id', CustomerController.getCustomerById as any);
router.post('/', CustomerController.createCustomer as any);
router.patch('/:id', CustomerController.updateCustomer as any);
router.delete('/:id', CustomerController.deleteCustomer as any);

export default router;

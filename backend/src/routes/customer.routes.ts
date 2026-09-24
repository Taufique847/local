import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { Customer360Controller } from '../controllers/customer-360.controller';
import { AgentMemoryController } from '../controllers/agent-memory.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { EquipmentController } from '../controllers/equipment.controller';
import {
  createCustomerSchema,
  updateCustomerSchema,
  createEquipmentSchema,
} from '../validation/schemas';

const router = Router();

// All customer routes require authentication
router.use(authMiddleware as any);

router.get('/', CustomerController.getCustomers as any);
router.get('/stats', CustomerController.getCustomerStats as any);
router.get('/:id/360', Customer360Controller.getCustomer360 as any);
router.put('/:id/tags', Customer360Controller.updateTags as any);

/**
 * Erases a customer's personal data on request.
 *
 * Not a DELETE on the customer: appointments and invoices reference the record
 * and financial history has to survive, so identifying fields are scrubbed while
 * amounts and dates remain. Irreversible.
 */
router.post('/:id/erase', CustomerController.erasePersonalData as any);

/**
 * Re-subscribes a customer to marketing email.
 *
 * Staff-only, and deliberately not reachable from a link. A customer who wants email
 * again asks the business; putting a re-subscribe link in an email would let the
 * unsubscribe page undo itself, and a prefetching mail scanner hitting it would opt
 * somebody back in without anybody clicking.
 */
router.post('/:id/resubscribe-email', CustomerController.resubscribeEmail as any);

/**
 * Equipment on the customer's property.
 *
 * Nested for reads and creates because a unit only exists in the context of one
 * customer. Updates live on a flat `/api/equipment/:id` so a client editing a row it
 * already holds does not have to carry the customer id.
 */
router.get('/:customerId/equipment', EquipmentController.list as any);
router.post(
  '/:customerId/equipment',
  validateBody(createEquipmentSchema),
  EquipmentController.create as any
);

// M19 Agent Memory routes
router.get('/:customerId/memories', AgentMemoryController.getMemories as any);
router.post('/:customerId/memories', AgentMemoryController.createMemory as any);
router.delete('/:customerId/memories/:memoryId', AgentMemoryController.deleteMemory as any);
router.get('/:customerId/context', AgentMemoryController.getCustomerContext as any);

router.get('/:id', CustomerController.getCustomerById as any);

/**
 * Validated before reaching the service.
 *
 * Without a schema the service did `input.phone?.trim()`, which throws rather
 * than rejects when the client sends a number — producing a 500 that echoed
 * "data.phone.trim is not a function" back to the caller.
 */
router.post(
  '/',
  validateBody(createCustomerSchema),
  CustomerController.createCustomer as any
);
router.patch(
  '/:id',
  validateBody(updateCustomerSchema),
  CustomerController.updateCustomer as any
);
router.delete('/:id', CustomerController.deleteCustomer as any);

export default router;

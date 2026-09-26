import { Router } from 'express';
import { KnowledgeBaseController } from '../controllers/knowledge-base.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { validateBody } from '../middleware/validate';
import { knowledgeItemSchema } from '../validation/schemas';

const router = Router();

// Protected knowledge base endpoints
router.use(authMiddleware as any);
router.use(attachBusinessContext as any);

// Reads are accessible to workspace members
router.get('/', KnowledgeBaseController.getItems as any);
router.get('/search', KnowledgeBaseController.search as any);
router.get('/:id', KnowledgeBaseController.getItemById as any);

// Modifying business AI knowledge base is strictly owner-only to prevent AI prompt/pricing sabotage
router.post(
  '/',
  requireOwner as any,
  validateBody(knowledgeItemSchema),
  KnowledgeBaseController.createItem as any
);
router.patch(
  '/:id',
  requireOwner as any,
  validateBody(knowledgeItemSchema.partial()),
  KnowledgeBaseController.updateItem as any
);
router.delete('/:id', requireOwner as any, KnowledgeBaseController.deleteItem as any);

export const knowledgeRoutes = router;
export default router;


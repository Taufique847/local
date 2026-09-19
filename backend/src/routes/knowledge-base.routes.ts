import { Router } from 'express';
import { KnowledgeBaseController } from '../controllers/knowledge-base.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Protected knowledge base endpoints
router.use(authMiddleware as any);

router.get('/', KnowledgeBaseController.getItems as any);
router.get('/search', KnowledgeBaseController.search as any);
router.get('/:id', KnowledgeBaseController.getItemById as any);
router.post('/', KnowledgeBaseController.createItem as any);
router.patch('/:id', KnowledgeBaseController.updateItem as any);
router.delete('/:id', KnowledgeBaseController.deleteItem as any);

export const knowledgeRoutes = router;
export default router;

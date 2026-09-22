import { Router } from 'express';
import { CommunicationController } from '../controllers/communication.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate';
import { sendMessageSchema } from '../validation/schemas';

const router = Router();

// Protected message management endpoints
router.use(authMiddleware as any);

router.post('/send', validateBody(sendMessageSchema), CommunicationController.sendMessage as any);
router.get('/', CommunicationController.getMessages as any);

export const communicationRoutes = router;
export default router;

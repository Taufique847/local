import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

// Public Twilio webhook endpoints (signature verification handled inside controller)
router.post('/voice', WebhookController.handleInboundVoice as any);
router.post('/status', WebhookController.handleStatusCallback as any);

export const webhookRoutes = router;
export default router;

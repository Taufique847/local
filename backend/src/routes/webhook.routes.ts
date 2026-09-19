import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { CommunicationController } from '../controllers/communication.controller';

const router = Router();

// Public Twilio webhook endpoints (signature verification handled inside controller)
router.post('/voice', WebhookController.handleInboundVoice as any);
router.post('/status', WebhookController.handleStatusCallback as any);
router.post('/sms', CommunicationController.handleInboundWebhook as any);
router.post('/sms-status', CommunicationController.handleStatusCallback as any);

export const webhookRoutes = router;
export default router;

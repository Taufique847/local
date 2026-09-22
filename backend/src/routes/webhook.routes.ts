import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { CommunicationController } from '../controllers/communication.controller';
import { webhookLimiter } from '../middleware/rate-limit';

const router = Router();

/**
 * Public Twilio webhook endpoints.
 *
 * These are unauthenticated by necessity (Twilio cannot present a session
 * cookie) and are instead authenticated by the `X-Twilio-Signature` HMAC,
 * verified inside each controller before any side effect occurs.
 */
router.use(webhookLimiter);

router.post('/voice', WebhookController.handleInboundVoice as any);
router.post('/test-call', WebhookController.handleTestCallVoice as any);
router.post('/status', WebhookController.handleStatusCallback as any);
router.post('/sms', CommunicationController.handleInboundWebhook as any);
router.post('/sms-status', CommunicationController.handleStatusCallback as any);

export const webhookRoutes = router;
export default router;

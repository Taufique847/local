import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { ConversationQAController } from '../controllers/conversation-qa.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { testCallLimiter } from '../middleware/rate-limit';

const router = Router();

// All call log management routes require authentication
router.use(authMiddleware as any);

router.get('/', CallController.getCalls as any);
router.get('/stats', CallController.getCallStats as any);
router.get('/analytics/summary', CallController.getAnalytics as any);

// Owner test call. Registered before '/:id' so 'test-call' is not read as an id.
// Rate limited on top of the per-business hourly cap because every attempt
// places a billable outbound call.
router.get('/test-call/readiness', CallController.getTestCallReadiness as any);
router.post('/test-call', testCallLimiter, CallController.startTestCall as any);

// M20 AI Conversation QA routes
router.get('/qa/summary', ConversationQAController.getSummary as any);
router.get('/qa', ConversationQAController.listReviews as any);
router.get('/:id/qa', ConversationQAController.getCallQA as any);
router.post('/:id/qa/evaluate', ConversationQAController.evaluateCall as any);

router.get('/:id', CallController.getCallById as any);
router.get('/:id/transcript', CallController.getTranscript as any);

export const callRoutes = router;
export default router;

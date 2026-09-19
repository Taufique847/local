import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import businessRoutes from './business.routes';
import onboardingRoutes from './onboarding.routes';
import customerRoutes from './customer.routes';
import { leadRoutes } from './lead.routes';
import { serviceRoutes } from './service.routes';
import { appointmentRoutes } from './appointment.routes';
import { availabilityRoutes } from './availability.routes';
import { phoneNumberRoutes } from './phone-number.routes';
import { callRoutes } from './call.routes';
import { webhookRoutes } from './webhook.routes';
import { communicationRoutes } from './communication.routes';
import { knowledgeRoutes } from './knowledge-base.routes';
import policyRoutes from './policy.routes';
import leadRecoveryRoutes from './lead-recovery.routes';
import dispatchRoutes from './dispatch.routes';
import reviewRoutes from './review.routes';
import billingRoutes from './billing.routes';

const apiRouter = Router();

// Mount routes
apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/business', businessRoutes);
apiRouter.use('/onboarding', onboardingRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/leads', leadRoutes);
apiRouter.use('/services', serviceRoutes);
apiRouter.use('/appointments', appointmentRoutes);
apiRouter.use('/availability', availabilityRoutes);
apiRouter.use('/phone-numbers', phoneNumberRoutes);
apiRouter.use('/calls', callRoutes);
apiRouter.use('/messages', communicationRoutes);
apiRouter.use('/knowledge', knowledgeRoutes);
apiRouter.use('/policies', policyRoutes);
apiRouter.use('/recovery', leadRecoveryRoutes);
apiRouter.use('/dispatch', dispatchRoutes);
apiRouter.use('/reviews', reviewRoutes);
apiRouter.use('/billing', billingRoutes);
apiRouter.use('/webhooks/twilio', webhookRoutes);

export default apiRouter;

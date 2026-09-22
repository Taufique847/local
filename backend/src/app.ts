import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rate-limit';
import apiRouter from './routes';

/** Path that must receive the unparsed body so Stripe signatures can verify. */
export const STRIPE_WEBHOOK_PATH = '/api/billing/webhook';

export const createApp = (): Application => {
  const app: Application = express();

  // Trust the first proxy hop so req.ip is the real client address behind a
  // load balancer. Without this, rate limiting keys every request to the
  // proxy's address and throttles all users as one.
  app.set('trust proxy', 1);

  // Security headers. `contentSecurityPolicy` is disabled because this process
  // serves only JSON APIs (the Next.js frontend sets its own CSP), and
  // cross-origin resource policy would otherwise block the browser frontend.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(globalLimiter);
  app.use(cookieParser());

  // Stripe signature verification needs the exact bytes Stripe signed, so this
  // route is parsed as a raw Buffer and must be registered before the global
  // JSON parser would consume and discard the raw body.
  app.use(STRIPE_WEBHOOK_PATH, express.raw({ type: 'application/json', limit: '1mb' }));

  // Body size limits cap memory abuse. The larger cap covers e-signature and
  // technician job-photo data URLs, which legitimately run to a few hundred KB.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Mount API routes
  app.use('/api', apiRouter);

  // 404 Handler
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
};

export const app = createApp();

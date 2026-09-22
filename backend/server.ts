import { app } from './src/app';
import { config, validateConfig } from './src/config/env';
import { connectDB, disconnectDB } from './src/config/database';
import { VoiceStreamHandler } from './src/services/voice/voice-stream.handler';
import { JobScheduler } from './src/jobs/scheduler';
import { logger } from './src/utils/logger';

let server: any;

/**
 * Fails fast on fatal misconfiguration instead of booting an insecure server.
 * The most important case: a production deploy with no JWT_SECRET previously
 * signed tokens with a fallback secret committed to this repository.
 */
const checkConfig = (): void => {
  const issues = validateConfig();

  for (const issue of issues) {
    if (issue.level === 'fatal') {
      logger.error('config_fatal', { detail: issue.message });
    } else {
      logger.warn('config_warning', { detail: issue.message });
    }
  }

  if (issues.some((i) => i.level === 'fatal')) {
    logger.error('startup_aborted', {
      reason: 'Fatal configuration problems must be resolved before starting.',
    });
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    checkConfig();

    await connectDB();

    server = app.listen(config.port, () => {
      logger.info('server_started', {
        port: config.port,
        env: config.nodeEnv,
        frontendUrl: config.frontendUrl,
        voiceProvider: config.voiceProvider,
        voiceWebSocketPath: '/api/voice/media-stream',
        billingMode: config.stripeSecretKey ? 'live' : 'simulation',
      });
    });

    // Attach Voice Media Stream WebSocket server
    VoiceStreamHandler.initialize(server);

    // Start time-based automations (speed-to-lead drips, review surveys, SLA
    // sweeps, trial expiry). Without this nothing scheduled ever runs.
    JobScheduler.start();
  } catch (error) {
    logger.error('startup_failed', { err: error });
    process.exit(1);
  }
};

const handleShutdown = async (signal: string) => {
  logger.info('shutdown_started', { signal });

  // Stop accepting new scheduled work before closing the DB connection,
  // otherwise an in-flight job fails noisily during shutdown.
  JobScheduler.stop();

  if (server) {
    server.close(async () => {
      logger.info('http_server_closed');
      await disconnectDB();
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }

  setTimeout(() => {
    logger.error('shutdown_forced', { reason: 'graceful shutdown exceeded 10s' });
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// An unhandled rejection leaves the process in an undefined state; log it with
// full context rather than letting Node print a bare warning.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { err: reason });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', { err });
  process.exit(1);
});

startServer();

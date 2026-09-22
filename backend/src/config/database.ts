import mongoose from 'mongoose';
import { config } from './env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'database' });

export const connectDB = async (): Promise<void> => {
  try {
    mongoose.connection.on('connected', () => {
      log.info('mongodb_connected');
    });

    mongoose.connection.on('error', (err) => {
      log.error('mongodb_error', { err });
    });

    mongoose.connection.on('disconnected', () => {
      log.warn('mongodb_disconnected');
    });

    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      /**
       * Index builds are a deployment step, not a startup side effect.
       *
       * Mongoose defaults `autoIndex` to true, so every boot issued
       * `createIndex` for every index on every model. On a large collection that
       * is slow and can lock, and it means a code deploy silently mutates
       * production indexes. Left on in development, where schemas change
       * constantly and collections are tiny.
       *
       * Run `npm run sync-indexes` after deploying a schema change.
       */
      autoIndex: !config.isProduction,
    });
  } catch (error) {
    log.error('mongodb_connect_failed', { err: error });
    throw error;
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    log.info('mongodb_disconnected_cleanly');
  } catch (error) {
    log.error('mongodb_disconnect_failed', { err: error });
  }
};

/**
 * Applies every model's declared indexes to the database.
 *
 * Needed because `autoIndex` is off in production. Run deliberately, as part of
 * a deploy, so index builds are observable instead of happening during boot.
 */
export const syncIndexes = async (): Promise<void> => {
  const names = Object.keys(mongoose.models);

  for (const name of names) {
    const started = Date.now();
    await mongoose.models[name].syncIndexes();
    log.info('indexes_synced', { model: name, durationMs: Date.now() - started });
  }

  log.info('index_sync_complete', { models: names.length });
};

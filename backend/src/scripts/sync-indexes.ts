/**
 * Applies all model indexes, then exits.
 *
 * `autoIndex` is disabled in production so booting the API never triggers index
 * builds. Run this as a deploy step whenever a schema's indexes change:
 *
 *   npm run sync-indexes
 *
 * Importing the route tree is what registers every model with Mongoose; without
 * it only the handful of models reachable from this file would be synced.
 */
import { connectDB, disconnectDB, syncIndexes } from '../config/database';
import { logger } from '../utils/logger';

// Side-effect import: pulls in controllers and services, which register models.
import '../routes';

const log = logger.child({ module: 'sync-indexes' });

const run = async (): Promise<void> => {
  await connectDB();
  await syncIndexes();
  await disconnectDB();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('index_sync_failed', { err });
    process.exit(1);
  });

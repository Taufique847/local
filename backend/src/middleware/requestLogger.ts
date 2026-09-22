import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      log?: ReturnType<typeof logger.child>;
    }
  }
}

/**
 * Attaches a correlation id to every request and emits one structured log line
 * per completed request. The id is echoed back as `x-request-id` so a support
 * ticket screenshot can be traced straight to the server log.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
      ? incoming
      : crypto.randomBytes(8).toString('hex');

  req.requestId = requestId;
  req.log = logger.child({ requestId });
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs,
      ip: req.ip,
    });
  });

  next();
};

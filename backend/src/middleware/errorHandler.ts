import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';
import { config } from '../config/env';

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = (err as AppError).statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error internally in non-test environments
  if (config.nodeEnv !== 'test') {
    console.error(`[Error] ${statusCode} - ${message}`);
    if (!config.isProduction && err.stack) {
      console.error(err.stack);
    }
  }

  // Predictable JSON response without exposing stack traces to clients
  res.status(statusCode).json({
    success: false,
    message: config.isProduction && statusCode === 500 ? 'Internal Server Error' : message,
  });
};

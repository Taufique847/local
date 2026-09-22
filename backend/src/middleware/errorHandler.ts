import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../types';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Converts a Zod validation failure into a flat, client-friendly field map so
 * the UI can highlight the offending inputs instead of showing a raw dump.
 */
const formatZodError = (err: ZodError): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'value';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
};

/**
 * Same treatment for a Mongoose schema validation failure.
 *
 * These were falling through to a 500 that echoed the raw Mongoose text, so a
 * name longer than the schema allowed produced
 * `500 "Customer validation failed: firstName: cannot exceed 60 characters"` —
 * the wrong status, and internal schema detail in the response body.
 */
const formatMongooseValidationError = (
  err: mongoose.Error.ValidationError
): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const [path, issue] of Object.entries(err.errors)) {
    if (!fields[path]) fields[path] = (issue as any)?.message || 'Invalid value';
  }
  return fields;
};

export const errorHandler = (
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = (err as AppError).statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let fields: Record<string, string> | undefined;

  if (err instanceof ZodError) {
    statusCode = 400;
    fields = formatZodError(err);
    message = 'Some of the submitted values are invalid.';
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    fields = formatMongooseValidationError(err);
    message = 'Some of the submitted values are invalid.';
  } else if (err instanceof mongoose.Error.CastError) {
    /**
     * A malformed id or a value of the wrong type for its field. The client sent
     * something unusable, so this is a 400 — previously a 500 that leaked the
     * field path and the offending value back to the caller.
     */
    statusCode = 400;
    const path = (err as mongoose.Error.CastError).path;
    message =
      path === '_id'
        ? 'That identifier is not valid.'
        : 'One of the submitted values is the wrong type.';
    if (path && path !== '_id') fields = { [path]: 'Invalid value' };
  }

  // Mongo duplicate-key: surface a usable message rather than a 500.
  if ((err as any)?.code === 11000) {
    statusCode = 409;
    message = 'That record already exists.';
  }

  if (!config.isTest) {
    const log = req.log || logger;
    const context = {
      status: statusCode,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      err,
    };
    if (statusCode >= 500) {
      log.error('request_failed', context);
    } else {
      log.warn('request_rejected', context);
    }
  }

  /**
   * Response body.
   *
   * Any 500 gets a fixed message regardless of environment. Previously the real
   * message was echoed outside production, and since unexpected throws became
   * 500s, internal detail like "data.phone.trim is not a function" was returned
   * to the caller. The requestId is how an operator ties the response back to
   * the logged cause.
   */
  const isServerError = statusCode >= 500;

  res.status(statusCode).json({
    success: false,
    message: isServerError ? 'Something went wrong on our end. Please try again.' : message,
    ...(fields ? { fields } : {}),
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
};

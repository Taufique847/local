import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Validates and REPLACES `req.body` with the parsed result.
 *
 * Replacing rather than merely checking matters: Zod strips unknown keys, so a
 * client cannot smuggle extra fields (`role`, `businessId`, `isActive`, …) into
 * handlers that spread `req.body` into a Mongoose write.
 *
 * ZodError is translated into a 400 with per-field messages by the central
 * error handler.
 */
export const validateBody =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };

/** Same contract as validateBody, for query strings. */
export const validateQuery =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query ?? {});
      Object.defineProperty(req, 'validatedQuery', { value: parsed, writable: true });
      next();
    } catch (err) {
      next(err);
    }
  };

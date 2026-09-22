import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth.types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'rbac' });

/**
 * Restricts a route to specific roles.
 *
 * Must be mounted AFTER `authMiddleware`, which is what populates `req.user`.
 *
 * Why this exists: authentication was treated as authorisation everywhere. Any
 * contractor with a valid session could reach platform-operator endpoints —
 * trigger the scheduler jobs that process every tenant's follow-ups, or read the
 * BlueCollar AI sales inbox containing every demo requester's contact details.
 * Being a customer is not the same as being staff.
 *
 * A missing `req.user` is reported as 401 rather than 403: the caller is not
 * authenticated at all, which usually means this was mounted in the wrong order.
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      // Logged so repeated probing of operator endpoints is visible.
      log.warn('role_denied', {
        userId: req.user.id,
        role: req.user.role,
        required: roles,
        path: req.originalUrl,
      });

      res.status(403).json({
        success: false,
        message: 'Your account does not have permission to perform this action.',
      });
      return;
    }

    next();
  };
};

/**
 * Platform operator only — BlueCollar AI staff, not the contractors who use it.
 *
 * `role` defaults to 'user' on signup and there is no self-service path to
 * 'admin', so this is granted deliberately out of band.
 */
export const requirePlatformAdmin = requireRole('admin');

import { Response, NextFunction } from 'express';
import { BusinessRole, BusinessScopedRequest } from '../types/auth.types';
import { BusinessContextService } from '../services/business-context.service';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'rbac' });

/**
 * Resolves the caller's workspace and attaches it to the request.
 *
 * Mount AFTER `authMiddleware`. Every downstream handler should read
 * `req.businessId` rather than deriving the tenant itself: a single resolution
 * point is what makes "which tenant is this?" auditable, and it is the reason a
 * staff user reaches the right workspace at all.
 *
 * Fails the request when there is no workspace, which for an owner means
 * onboarding is incomplete. The 400 and its message are unchanged from the
 * per-controller lookups this replaces, so existing clients see no difference.
 */
export const attachBusinessContext = async (
  req: BusinessScopedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
      return;
    }

    const context = await BusinessContextService.resolve(req.user.id);
    req.businessId = context.businessId;
    req.businessRole = context.businessRole;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Restricts a route to specific roles WITHIN the workspace.
 *
 * Distinct from `requireRole`, which gates platform-operator endpoints on
 * `user.role`. This gates tenant endpoints on `user.businessRole`. Conflating
 * the two would mean a contractor's dispatcher had to hold some level of
 * platform privilege to do their job.
 *
 * Mount AFTER `attachBusinessContext`. A missing role is reported as 401 rather
 * than 403 because it means the middleware chain is wired wrongly, not that the
 * caller lacks permission.
 */
export const requireBusinessRole = (...roles: BusinessRole[]) => {
  return (req: BusinessScopedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
      return;
    }

    if (!req.businessRole) {
      log.error('business_role_missing_on_request', {
        userId: req.user.id,
        path: req.originalUrl,
      });
      res.status(401).json({
        success: false,
        message: 'Your workspace could not be determined. Please log in again.',
      });
      return;
    }

    if (!roles.includes(req.businessRole)) {
      log.warn('business_role_denied', {
        userId: req.user.id,
        businessRole: req.businessRole,
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
 * Owner-only. Reserved for things that are the owner's alone: billing and
 * payment details, team management, and deleting the workspace.
 *
 * The concrete problem this solves: until now a contractor's dispatcher and
 * technicians had to share the owner's login, which meant anyone who could
 * update a job status could also read the company's card details and change its
 * subscription.
 */
export const requireOwner = requireBusinessRole('owner');

/** Owner or dispatcher — day-to-day operations, but not money or team changes. */
export const requireDispatchAccess = requireBusinessRole('owner', 'dispatcher');

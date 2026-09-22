import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AuthenticatedRequest, JwtPayload, UserDTO } from '../types/auth.types';
import { AUTH_COOKIE_NAME } from '../utils/token';
import { User } from '../models/user.model';

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // 1. Check HTTP-only cookie first
    if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      token = req.cookies[AUTH_COOKIE_NAME];
    }
    // 2. Fallback to Authorization: Bearer <token>
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
      return;
    }

    // Verify token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication session. Please log in again.',
      });
      return;
    }

    // Verify user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'Account not found or has been deactivated.',
      });
      return;
    }

    /**
     * Revocation check.
     *
     * Access tokens are stateless, so without this a token stayed usable until
     * it expired even after the user logged out, signed out of all devices, or
     * a stolen refresh token forced a session reset. Any token carrying an older
     * version than the account's current one is refused.
     *
     * Tokens minted before this field existed have no `tv` claim; those are
     * rejected too, so the upgrade does not leave a window of unrevocable
     * sessions open.
     */
    const currentVersion = user.tokenVersion ?? 0;
    if (typeof decoded.tv !== 'number' || decoded.tv !== currentVersion) {
      res.status(401).json({
        success: false,
        message: 'Your session is no longer valid. Please log in again.',
      });
      return;
    }

    /**
     * Workspace membership is attached from the freshly-loaded user document,
     * not from the token. This costs nothing extra — the document was already
     * fetched for the checks above — and it means demoting someone or removing
     * them from a workspace takes effect on their next request rather than
     * whenever their access token expires.
     */
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId ? user.businessId.toString() : null,
      businessRole: (user.businessRole as UserDTO['businessRole']) ?? null,
      technicianId: user.technicianId ? user.technicianId.toString() : null,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt,
    };

    next();
  } catch (error) {
    next(error);
  }
};

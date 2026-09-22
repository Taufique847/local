import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../types/auth.types';
import {
  setAuthCookie,
  clearAuthCookie,
  setRefreshCookie,
  clearRefreshCookie,
  REFRESH_COOKIE_NAME,
} from '../utils/token';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

/** Request metadata recorded against each issued session, for audit. */
const sessionContext = (req: Request) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'] as string | undefined,
});

export class AuthController {
  // POST /api/auth/signup
  public static async signup(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name, email, password } = req.body;
      const { user, token, refreshToken } = await AuthService.signup(
        { name, email, password },
        sessionContext(req)
      );

      setAuthCookie(res, token);
      setRefreshCookie(res, refreshToken);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Account created successfully',
          user,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  // POST /api/auth/login
  public static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.body;
      const { user, token, refreshToken } = await AuthService.login(
        { email, password },
        sessionContext(req)
      );

      setAuthCookie(res, token);
      setRefreshCookie(res, refreshToken);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Logged in successfully',
          user,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   *
   * Exchanges the refresh cookie for a new access token, rotating the refresh
   * token in the process. Access tokens are short-lived, so the browser calls
   * this transparently rather than forcing a re-login every few minutes.
   *
   * Cookies are cleared on failure so a client holding a dead token stops
   * retrying with it.
   */
  public static async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const presented = req.cookies?.[REFRESH_COOKIE_NAME];
      const { user, token, refreshToken } = await AuthService.refreshSession(
        presented,
        sessionContext(req)
      );

      setAuthCookie(res, token);
      setRefreshCookie(res, refreshToken);

      sendSuccess(res, { success: true, user }, 200);
    } catch (error) {
      clearAuthCookie(res);
      clearRefreshCookie(res);
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   *
   * Revokes the presented refresh token server side. Clearing the cookie alone
   * used to leave the session valid for its full lifetime, so anyone who had
   * copied the token could keep using it after the user "logged out".
   */
  public static async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await AuthService.revokeSession(req.cookies?.[REFRESH_COOKIE_NAME]);

      clearAuthCookie(res);
      clearRefreshCookie(res);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Logged out successfully',
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout-all
   *
   * Drops every session for the account and invalidates outstanding access
   * tokens. This is the control a user needs after losing a device.
   */
  public static async logoutAll(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (req.user) await AuthService.revokeAllSessions(req.user.id);

      clearAuthCookie(res);
      clearRefreshCookie(res);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Signed out of all devices',
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/verify-email/request
   *
   * Re-sends the verification link to the signed-in user's address.
   */
  public static async requestEmailVerification(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      await AuthService.sendVerificationEmail(req.user.id);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Verification email sent. Check your inbox.',
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/verify-email/confirm
   *
   * Public: the link is opened from an email client, which has no session. The
   * token itself is the credential.
   */
  public static async confirmEmailVerification(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const user = await AuthService.confirmEmail(token);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Email address confirmed.',
          user,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/forgot-password
   *
   * Public. Always answers 200 with the same message, whether or not the address
   * belongs to an account — see AuthService.requestPasswordReset for why.
   */
  public static async forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      await AuthService.requestPasswordReset(email, { ip: req.ip });

      sendSuccess(
        res,
        {
          success: true,
          message:
            'If an account exists for that address, a password reset link is on its way. Check your inbox.',
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/reset-password
   *
   * Public: opened from an email client with no session. The token is the
   * credential.
   *
   * Cookies are cleared because the reset revokes every session, including any
   * this browser was holding — leaving them set would have the client retrying
   * with credentials the server has just invalidated.
   */
  public static async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      await AuthService.resetPassword(token, password);

      clearAuthCookie(res);
      clearRefreshCookie(res);

      sendSuccess(
        res,
        {
          success: true,
          message:
            'Your password has been changed and you have been signed out everywhere. Please log in again.',
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  // GET /api/auth/me
  public static async getMe(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      sendSuccess(
        res,
        {
          success: true,
          user: req.user,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  // GET /api/auth/protected-test
  public static async protectedTest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      sendSuccess(
        res,
        {
          success: true,
          message: 'Authenticated request successful',
          user: req.user,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }
}

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { setAuthCookie, clearAuthCookie } from '../utils/token';
import { sendSuccess } from '../utils/response';

export class AuthController {
  // POST /api/auth/signup
  public static async signup(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name, email, password } = req.body;
      const { user, token } = await AuthService.signup({ name, email, password });

      // Set secure HTTP-only auth cookie
      setAuthCookie(res, token);

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
      const { user, token } = await AuthService.login({ email, password });

      // Set secure HTTP-only auth cookie
      setAuthCookie(res, token);

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

  // POST /api/auth/logout
  public static async logout(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      clearAuthCookie(res);
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

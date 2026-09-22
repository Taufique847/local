import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { authLimiter, refreshLimiter } from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import { signupSchema, loginSchema } from '../validation/schemas';

const router = Router();

// Public routes. Rate limited to block credential stuffing and validated so
// malformed payloads never reach the service layer.
router.post('/signup', authLimiter, validateBody(signupSchema), AuthController.signup);
router.post('/login', authLimiter, validateBody(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);

/**
 * Access tokens are short-lived, so the browser exchanges the refresh cookie
 * here instead of re-prompting for a password.
 *
 * Rate limited separately from login: it is called routinely by every signed-in
 * client, but a flood of failures is worth throttling because presenting a
 * revoked token is treated as a theft signal.
 */
router.post('/refresh', refreshLimiter, AuthController.refresh);

/**
 * Opened from an email client, so there is no session to authenticate with —
 * the single-use token in the link is the credential. Rate limited because it
 * is a public endpoint that accepts a guessable-shaped secret.
 */
router.post('/verify-email/confirm', authLimiter, AuthController.confirmEmailVerification);

// Protected routes
router.get('/me', authMiddleware as any, AuthController.getMe as any);
router.post('/logout-all', authMiddleware as any, AuthController.logoutAll as any);
router.post(
  '/verify-email/request',
  authMiddleware as any,
  authLimiter,
  AuthController.requestEmailVerification as any
);
router.get('/protected-test', authMiddleware as any, AuthController.protectedTest as any);

export default router;

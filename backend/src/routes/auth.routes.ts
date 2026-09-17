import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/signup', AuthController.signup);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

// Protected routes
router.get('/me', authMiddleware as any, AuthController.getMe as any);
router.get('/protected-test', authMiddleware as any, AuthController.protectedTest as any);

export default router;

import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { JwtPayload } from '../types/auth.types';

export const AUTH_COOKIE_NAME = 'auth_token';

// Generate signed JWT token
export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
};

// Set secure HTTP-only cookie on response
export const setAuthCookie = (res: Response, token: string): void => {
  const isProduction = config.isProduction;

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
};

// Clear authentication cookie on logout
export const clearAuthCookie = (res: Response): void => {
  const isProduction = config.isProduction;

  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  });
};

import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { JwtPayload } from '../types/auth.types';

export const AUTH_COOKIE_NAME = 'auth_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Refresh cookie is scoped to the refresh endpoint so it is not attached to every
 * API call. A token that is only sent where it is needed has far fewer chances
 * to leak through logs, proxies or a misbehaving third-party script.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

// Generate signed access token
export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
};

const cookieBase = () => {
  const isProduction = config.isProduction;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'strict' : 'lax') as 'strict' | 'lax',
  };
};

/**
 * Access token cookie.
 *
 * `maxAge` deliberately matches the short token lifetime instead of the old
 * hardcoded 7 days, so the browser stops presenting a token that the server will
 * reject anyway.
 */
export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...cookieBase(),
    maxAge: accessCookieMaxAgeMs(),
    path: '/',
  });
};

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieBase(),
    maxAge: config.refreshTokenDays * 24 * 60 * 60 * 1000,
    path: REFRESH_COOKIE_PATH,
  });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...cookieBase(), path: '/' });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...cookieBase(), path: REFRESH_COOKIE_PATH });
};

/** Opaque refresh token. Not a JWT: it carries no claims and is only a database lookup key. */
export const generateRefreshToken = (): string => crypto.randomBytes(48).toString('base64url');

/** Refresh tokens are stored hashed, so the database never holds a usable credential. */
export const hashRefreshToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Converts the configured access token lifetime into milliseconds for the cookie.
 * Falls back to 15 minutes if the value is not a recognised shorthand.
 */
function accessCookieMaxAgeMs(): number {
  const raw = String(config.jwtExpiresIn).trim();
  const match = /^(\d+)\s*([smhd])$/i.exec(raw);
  if (!match) return 15 * 60 * 1000;

  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (unitMs[match[2].toLowerCase()] ?? 60 * 1000);
}

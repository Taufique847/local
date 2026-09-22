import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { AUTH_COOKIE_NAME } from '../../src/utils/token';

/**
 * One app instance per run. `createApp` is pure wiring, but rebuilding it per
 * test would re-register the rate limiters and reset their in-memory windows,
 * which would quietly hide any limiter regression.
 */
let cached: Application | null = null;

export const testApp = (): Application => {
  if (!cached) cached = createApp();
  return cached;
};

/** A supertest agent carrying the access token as the auth cookie, as a browser would. */
export const asUser = (token: string) => {
  const agent = request.agent(testApp());
  agent.set('Cookie', `${AUTH_COOKIE_NAME}=${token}`);
  return agent;
};

/** Unauthenticated caller. */
export const asAnon = () => request(testApp());

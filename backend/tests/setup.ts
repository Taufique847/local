import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CommunicationService } from '../src/services/communication.service';

/**
 * One in-memory MongoDB for the whole run.
 *
 * Deliberately a real mongod rather than mocked models: almost everything these
 * tests are protecting is expressed as a query filter — `findOne({ _id,
 * businessId })` versus `findById(_id)` — and a mocked model would happily
 * "pass" a test against the vulnerable version.
 */
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('bluecollar_test'));
});

/**
 * No test makes a real outbound send.
 *
 * The test env supplies dummy Twilio credentials — several tests need them,
 * because webhook signature verification is derived from the auth token — which
 * means `CommunicationService.getClient()` builds a genuine Twilio client and
 * `messages.create` reaches out to api.twilio.com before failing 401.
 *
 * That was tolerable while only a handful of tests sent SMS directly. Now that
 * booking, invoicing and job completion all fire a notification, every one of
 * those paths would make a real HTTPS request per test: slow, and dependent on
 * the machine having network access.
 *
 * Forced to `null` here, which routes through the service's own
 * "telephony not configured" branch — a path the production code already has and
 * which tests can assert against. Email needs no equivalent: `EMAIL_API_KEY` is
 * unset in the test env, so `EmailService.isConfigured()` is false and it refuses
 * before any fetch.
 *
 * Re-applied per test rather than once, because `restoreMocks: true` tears
 * spies down after each one. A test that wants to observe a successful send
 * overrides this with its own spy.
 */
beforeEach(() => {
  vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue(null);
});

afterEach(async () => {
  // Wiped between tests so ordering cannot leak fixtures. Collections are
  // emptied rather than dropped, which keeps the indexes Mongoose built on first
  // connect — several assertions depend on the unique index on User.email.
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

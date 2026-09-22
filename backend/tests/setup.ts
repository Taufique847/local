import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

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

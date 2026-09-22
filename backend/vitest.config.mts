import { defineConfig } from 'vitest/config';

// `.mts` rather than `.ts`: the nearest package.json has no `"type": "module"`,
// so a `.ts` config is loaded as CommonJS and Vite warns about the ESM syntax.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /**
     * Env is set here rather than in a setup file because `src/config/env.ts`
     * snapshots `process.env` once at import time. A setup file would run after
     * the first transitive import of config in some orders, so the values have to
     * exist before any module graph is built.
     */
    env: {
      NODE_ENV: 'test',
      // 32+ chars: validateConfig treats anything shorter as fatal in production,
      // and the tests assert on real signing behaviour.
      JWT_SECRET: 'test_jwt_secret_that_is_long_enough_32',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_DAYS: '30',
      FRONTEND_URL: 'http://localhost:3000',
      LOG_LEVEL: 'error',
      // Off, so tests never spawn cron jobs that mutate fixtures underneath them.
      ENABLE_SCHEDULER: 'false',
      // Signature verification must stay ON — several tests exist purely to prove
      // that forged webhooks are rejected.
      ALLOW_INSECURE_WEBHOOKS: 'false',
      TWILIO_ACCOUNT_SID: 'ACtest00000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'test_twilio_auth_token',
      TWILIO_WEBHOOK_BASE_URL: 'https://test.example.com',
      STRIPE_SECRET_KEY: 'sk_test_dummy_key_for_signature_tests',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_for_signature_tests',
      VOICE_PROVIDER: 'mock',
      DATA_RETENTION_DAYS: '0',
      REQUIRE_EMAIL_VERIFICATION: 'false',
    },
    setupFiles: ['tests/setup.ts'],
    /**
     * Files run one at a time. Every test shares one in-memory MongoDB and the
     * models are module-level singletons, so parallel files would interleave
     * writes into the same collections and make failures depend on scheduling.
     */
    pool: 'forks',
    fileParallelism: false,
    // Starting mongodb-memory-server the first time can involve a binary download.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    restoreMocks: true,
  },
});

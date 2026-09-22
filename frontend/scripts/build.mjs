/**
 * Runs `next build` with NODE_ENV forced to "production".
 *
 * Why this wrapper exists: `next build` only defaults NODE_ENV to "production"
 * when NODE_ENV is unset. Some machines export NODE_ENV=development globally
 * (shell profile, IDE terminal profile, container image). In that case Next
 * mixes the development and production React server runtimes and every route
 * fails to prerender with:
 *
 *   TypeError: Cannot read properties of null (reading 'useContext')
 *
 * The failure looks like an application bug but is purely environmental, so we
 * pin the value here instead of relying on the caller's shell.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const nextPackageDir = path.dirname(require.resolve('next/package.json'));
const nextCli = path.join(nextPackageDir, 'dist', 'bin', 'next');

const result = spawnSync(process.execPath, [nextCli, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

if (result.error) {
  console.error('[build] failed to start next build:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

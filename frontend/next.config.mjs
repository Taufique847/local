/**
 * Backend origin used by the dev-time `/api/*` rewrite.
 *
 * This was hardcoded to http://localhost:5000, which breaks the moment the app
 * runs anywhere else (Docker, staging, production), so it now follows the same
 * env var the browser client uses.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Emits a self-contained server bundle so the Docker image does not need the
  // full node_modules tree.
  output: 'standalone',

  // Build should fail on a type error rather than shipping a broken deploy.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // The app talks to the backend directly via NEXT_PUBLIC_API_URL with
  // credentialed fetches; this rewrite is a convenience for same-origin local
  // development only.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },

  /**
   * Legacy paths from before the dashboard moved under /app.
   *
   * These were two page components whose only job was to call `redirect()`,
   * which meant they were compiled, bundled and counted as real routes. Handled
   * here instead: no component, and a proper 308 so bookmarks and any stale
   * links keep working.
   */
  async redirects() {
    return [
      { source: '/customers', destination: '/app/customers', permanent: true },
      { source: '/leads', destination: '/app/leads', permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // This app is never meant to be framed; blocks clickjacking.
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            // Microphone stays allowed for browser-based audio playback demos.
            value: 'camera=(self), microphone=(self), geolocation=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

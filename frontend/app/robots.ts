import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * robots.txt. Previously absent entirely, so crawlers had no guidance and the
 * authenticated app, customer portal and API routes were all fair game.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Authenticated product surface — nothing here is useful in search
          // results and much of it requires a session.
          '/app',
          '/app/',
          '/worker',
          '/onboarding',
          // Customer portal URLs contain secret share tokens. They must never
          // be indexed.
          '/portal/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

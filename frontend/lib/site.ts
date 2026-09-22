/**
 * Canonical site metadata, shared by the root layout, sitemap, robots.txt and
 * JSON-LD so they can never drift apart.
 *
 * NEXT_PUBLIC_SITE_URL must be the production origin. Without it, Open Graph
 * images and canonical URLs resolve relative to localhost and social previews
 * break.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
).replace(/\/$/, '');

export const SITE_NAME = 'BlueCollar AI';

export const SITE_TAGLINE = 'AI phone receptionist for home-service contractors';

export const SITE_DESCRIPTION =
  'BlueCollar AI answers your phone, books jobs into your calendar, and texts back missed callers in under a minute — built for HVAC, plumbing, electrical and roofing contractors.';

/** Routes that should appear in the sitemap. */
export const PUBLIC_ROUTES = ['/', '/login', '/signup'] as const;

import React from 'react';
import Script from 'next/script';

/**
 * Optional, cookieless analytics.
 *
 * Renders nothing unless NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set, so local
 * development and self-hosted deployments make no third-party requests and need
 * no cookie banner. There was previously no analytics of any kind, which made
 * the marketing funnel impossible to measure.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js';

  if (!domain) return null;

  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />;
}

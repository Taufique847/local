import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';

/**
 * Server component so the marketing page can own its metadata. The interactive
 * parts live in <LandingPage />.
 */
export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    type: 'website',
  },
};

/**
 * Structured data. Helps search engines render the product as a SaaS offering
 * with pricing rather than an untyped page. Prices mirror
 * backend/src/services/billing.service.ts SUBSCRIPTION_PLANS.
 */
const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter Plan',
      price: '299',
      priceCurrency: 'USD',
      category: 'Subscription',
    },
    {
      '@type': 'Offer',
      name: 'Pro Fleet Plan',
      price: '799',
      priceCurrency: 'USD',
      category: 'Subscription',
    },
    {
      '@type': 'Offer',
      name: 'Enterprise Scale',
      price: '1499',
      priceCurrency: 'USD',
      category: 'Subscription',
    },
  ],
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Can I keep my existing business phone number?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You forward your existing number to your BlueCollar AI line using a carrier forwarding code, so the number on your trucks and Google listing never changes.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens when a caller reports an emergency?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You configure an escalation number. If a caller mentions a gas smell, carbon monoxide, sparking or an active leak, the AI transfers the call straight to that number instead of booking an appointment.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens to calls I miss?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Missed and unbooked calls trigger an automatic text back within about a minute, followed by two further follow-ups. All messaging respects TCPA quiet hours and opt-out keywords.',
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, developer-authored JSON — no user input is interpolated here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingPage />
    </>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { Analytics } from '@/components/analytics';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';

/**
 * Site-wide metadata. Previously only `title` and `description` were set, so
 * every shared link rendered a bare preview and there was no canonical URL,
 * robots directive or social card.
 */
export const metadata: Metadata = {
  // metadataBase makes relative OG/canonical URLs resolve to the real origin.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'AI receptionist',
    'HVAC answering service',
    'missed call text back',
    'contractor scheduling software',
    'plumbing answering service',
    'AI phone agent',
  ],
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  formatDetection: {
    // Prevents iOS from turning every number in the UI into a phone link.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-sky-500/20 selection:text-sky-900">
        {/* Keyboard users can jump past the navigation. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-blue-700 focus:shadow-lg focus:ring-2 focus:ring-blue-600"
        >
          Skip to main content
        </a>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}

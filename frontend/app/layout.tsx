import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/auth-context';

export const metadata: Metadata = {
  title: 'BlueCollar AI — AI Employee Platform',
  description: 'AI Employee Platform for Home-Service Businesses',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-sky-500/20 selection:text-sky-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

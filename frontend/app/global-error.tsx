'use client';

import React, { useEffect } from 'react';

/**
 * Last-resort boundary for errors thrown in the root layout itself.
 *
 * It must render its own <html> and <body> because the layout that normally
 * provides them is the thing that failed. Styling is inline for the same
 * reason: the stylesheet may not have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Fatal application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: '#0f172a',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            The application could not start
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#475569', margin: '0 0 1.5rem' }}>
            Please reload the page. If this keeps happening, contact support.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.6rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: '1.25rem',
                fontSize: '0.6875rem',
                fontFamily: 'ui-monospace, monospace',
                color: '#94a3b8',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

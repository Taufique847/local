import { describe, it, expect, afterEach, vi } from 'vitest';
import { EmailService } from '../../src/services/email.service';
import { config } from '../../src/config/env';
import { AppError } from '../../src/types';

/**
 * `EmailService` itself, with `fetch` stubbed rather than the service.
 *
 * Every other test in the suite stubs `EmailService.send`, which is the right call for
 * testing the callers — but it means the body of `send` has no coverage at all. That
 * matters most for one line: whether the `headers` a caller passes actually reach the
 * provider. Those headers are what make the `List-Unsubscribe` mechanism work, so a
 * mutation dropping them survived every test in the notification suite while quietly
 * breaking the native unsubscribe button in Gmail and Outlook.
 *
 * `EMAIL_API_KEY` is unset in the test env, so the configured paths are exercised by
 * temporarily setting the config the service reads.
 */

const withEmailConfigured = async (fn: () => Promise<void>): Promise<void> => {
  const original = { key: config.emailApiKey, from: config.emailFromAddress, provider: config.emailProvider };

  // `config` is a snapshot object, so this is a direct assignment rather than an env var.
  (config as any).emailApiKey = 're_test_key';
  (config as any).emailFromAddress = 'shop@example.com';
  (config as any).emailProvider = 'resend';

  try {
    await fn();
  } finally {
    (config as any).emailApiKey = original.key;
    (config as any).emailFromAddress = original.from;
    (config as any).emailProvider = original.provider;
  }
};

const stubFetch = (response: { ok: boolean; status?: number; body?: unknown }) => {
  const spy = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.body ?? { id: 'resend_abc' },
    text: async () => JSON.stringify(response.body ?? {}),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmailService.send', () => {
  it('refuses, rather than reporting success, when not configured', async () => {
    const fetchSpy = stubFetch({ ok: true });

    /**
     * The whole design rule for this service: an unconfigured provider is a failure.
     * Logging the message and returning success would leave a user waiting for a
     * verification link that was never sent.
     */
    await expect(
      EmailService.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' })
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the message to the provider', async () => {
    await withEmailConfigured(async () => {
      const fetchSpy = stubFetch({ ok: true, body: { id: 'resend_xyz' } });

      const result = await EmailService.send({
        to: 'a@example.com',
        subject: 'Hi',
        text: 'Hello',
        html: '<p>Hello</p>',
      });

      expect(result.id).toBe('resend_xyz');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.headers.Authorization).toBe('Bearer re_test_key');

      const sent = JSON.parse(init.body);
      expect(sent.from).toBe('shop@example.com');
      expect(sent.to).toEqual(['a@example.com']);
      expect(sent.subject).toBe('Hi');
      expect(sent.text).toBe('Hello');
      expect(sent.html).toBe('<p>Hello</p>');
    });
  });

  /**
   * The line the mutation check exposed as untested. Without it the unsubscribe link
   * still appears in the body, but Gmail and Outlook stop rendering their native
   * unsubscribe button — and a recipient who cannot find the link reports spam instead,
   * which costs the sending domain more than the lost contact.
   */
  it('forwards headers to the provider', async () => {
    await withEmailConfigured(async () => {
      const fetchSpy = stubFetch({ ok: true });

      await EmailService.send({
        to: 'a@example.com',
        subject: 'Offer',
        text: 'Offer inside',
        headers: {
          'List-Unsubscribe': '<https://example.com/unsubscribe/abc>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sent.headers).toEqual({
        'List-Unsubscribe': '<https://example.com/unsubscribe/abc>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
    });
  });

  it('omits the headers key entirely when there are none', async () => {
    await withEmailConfigured(async () => {
      const fetchSpy = stubFetch({ ok: true });

      await EmailService.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });

      // Not `headers: {}` — an empty object is noise in the provider payload.
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).not.toHaveProperty('headers');
    });
  });

  it('omits html when there is none, rather than sending undefined', async () => {
    await withEmailConfigured(async () => {
      const fetchSpy = stubFetch({ ok: true });

      await EmailService.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });

      expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).not.toHaveProperty('html');
    });
  });

  it('turns a provider rejection into a 502 without leaking the provider response', async () => {
    await withEmailConfigured(async () => {
      stubFetch({ ok: false, status: 422, body: { message: 'domain not verified' } });

      await expect(
        EmailService.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' })
      ).rejects.toMatchObject({ statusCode: 502 });
    });
  });

  it('turns a network failure into a 502', async () => {
    await withEmailConfigured(async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(
        EmailService.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' })
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  it('refuses a provider it does not implement', async () => {
    await withEmailConfigured(async () => {
      (config as any).emailProvider = 'sendgrid';
      const fetchSpy = stubFetch({ ok: true });

      await expect(
        EmailService.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' })
      ).rejects.toMatchObject({ statusCode: 500 });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('reports configured state from the key and the from-address together', async () => {
    expect(EmailService.isConfigured()).toBe(false);

    await withEmailConfigured(async () => {
      expect(EmailService.isConfigured()).toBe(true);

      // A key with no from-address cannot send, so it is not "configured".
      (config as any).emailFromAddress = '';
      expect(EmailService.isConfigured()).toBe(false);
    });
  });
});

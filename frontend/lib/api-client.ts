export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Error thrown by the API client. Carries the HTTP status and any per-field
 * validation messages the backend returned, so forms can highlight the exact
 * inputs that failed instead of showing one generic banner.
 */
export class ApiError extends Error {
  public status: number;
  public fields?: Record<string, string>;
  public requestId?: string;

  constructor(
    message: string,
    status: number,
    fields?: Record<string, string>,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    this.requestId = requestId;
  }

  /** True when retrying could plausibly succeed (network blip, 5xx, throttle). */
  public get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Bypass Next.js fetch caching. Defaults to true for API reads. */
  noStore?: boolean;
  /** Internal: set once a request has already been retried after a token refresh. */
  _retried?: boolean;
}

/**
 * Endpoints that must never trigger a refresh attempt, because doing so would
 * either recurse or mask a genuine credential failure.
 */
const NO_REFRESH_PATHS = ['/api/auth/refresh', '/api/auth/login', '/api/auth/signup', '/api/auth/logout'];

/**
 * In-flight refresh, shared across callers.
 *
 * Several widgets typically load at once, so an expired access token produces a
 * burst of 401s. Without this they would each rotate the refresh token and all
 * but one would present a token that had just been invalidated — which the
 * backend correctly treats as theft and responds to by dropping every session.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * Single fetch wrapper for every backend call.
 *
 * Previously each of the twelve service files re-declared the base URL and
 * hand-rolled its own error handling, so behaviour drifted between them and
 * validation details from the backend were discarded.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, noStore = true, headers, _retried, ...rest } = options;

  const init: RequestInit = {
    ...rest,
    // Cookie-based auth: the session is an httpOnly cookie, so every request
    // must opt into sending credentials.
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers as Record<string, string>),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(noStore ? { cache: 'no-store' as RequestCache } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    // Network-level failure: status 0 distinguishes "server unreachable" from
    // "server said no", which the UI presents differently.
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      0
    );
  }

  /**
   * Transparent re-auth.
   *
   * Access tokens are deliberately short-lived, so a 401 during a normal session
   * usually means "expired", not "logged out". One refresh is attempted and the
   * request replayed; if the refresh fails the original 401 surfaces and the UI
   * sends the user to sign in.
   */
  if (
    res.status === 401 &&
    !_retried &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p)) &&
    typeof window !== 'undefined'
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  const requestId = res.headers.get('x-request-id') ?? undefined;

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: any = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
  }

  if (!res.ok) {
    throw new ApiError(
      json.message || `Request failed with status ${res.status}`,
      res.status,
      json.fields,
      json.requestId || requestId
    );
  }

  return json as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Resolves a thrown value into a message safe to show a user.
 */
export const toErrorMessage = (err: unknown, fallback = 'Something went wrong.'): string => {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

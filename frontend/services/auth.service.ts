import { AuthResponse, LoginCredentials, SignupData, User } from '../types/auth';
import { apiClient } from '../lib/api-client';

/**
 * Authentication calls.
 *
 * Routed through the shared client so failures carry status codes and field-level
 * validation detail instead of a bare Error. Note the client deliberately does
 * NOT attempt a token refresh on these paths: a 401 from login means wrong
 * credentials, not an expired session.
 */
export class AuthService {
  public static async signup(data: SignupData): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/auth/signup', data);
  }

  public static async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/auth/login', credentials);
  }

  public static async logout(): Promise<void> {
    await apiClient.post<{ success: boolean }>('/api/auth/logout');
  }

  /** Ends every session for the account, not just this browser. */
  public static async logoutAll(): Promise<void> {
    await apiClient.post<{ success: boolean }>('/api/auth/logout-all');
  }

  /**
   * Current session, or null when not signed in.
   *
   * Swallows errors on purpose: callers use this to decide whether to render a
   * signed-in shell, and "not logged in" is a normal answer rather than a fault.
   */
  public static async getMe(): Promise<User | null> {
    try {
      const json = await apiClient.get<AuthResponse>('/api/auth/me');
      return json.user || null;
    } catch {
      return null;
    }
  }

  /** Re-sends the address confirmation email to the signed-in user. */
  public static async requestEmailVerification(): Promise<void> {
    await apiClient.post<{ success: boolean }>('/api/auth/verify-email/request');
  }

  public static async confirmEmailVerification(token: string): Promise<void> {
    await apiClient.post<{ success: boolean }>('/api/auth/verify-email/confirm', { token });
  }

  public static async testProtectedEndpoint(): Promise<{ success: boolean; message: string }> {
    return apiClient.get<{ success: boolean; message: string }>('/api/auth/protected-test');
  }
}

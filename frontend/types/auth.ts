/** Platform scope. 'admin' is BlueCollar AI staff, not a contractor. */
export type UserRole = 'user' | 'admin';

/** Tenant scope — what this user may do inside one contractor's workspace. */
export type BusinessRole = 'owner' | 'dispatcher' | 'technician';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Null for a brand-new owner who has not finished onboarding. */
  businessId?: string | null;
  businessRole?: BusinessRole | null;
  /** Set only for technician accounts, linking them to a dispatch record. */
  technicianId?: string | null;
  /** False until the user has clicked the link in their verification email. */
  emailVerified?: boolean;
  createdAt?: string;
}

/** True when the signed-in user may see billing and team management. */
export const isOwner = (user: User | null): boolean => user?.businessRole === 'owner';

/** Owners and dispatchers run day-to-day operations; technicians do not. */
export const hasDispatchAccess = (user: User | null): boolean =>
  user?.businessRole === 'owner' || user?.businessRole === 'dispatcher';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  businessRole: BusinessRole;
  technicianId?: string | null;
  isActive: boolean;
  emailVerified: boolean;
  /** Marks the row for the signed-in user, which cannot be edited. */
  isSelf: boolean;
  createdAt?: string;
}

export type StaffInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface StaffInvite {
  id: string;
  email: string;
  name?: string;
  businessRole: BusinessRole;
  status: StaffInviteStatus;
  technicianId?: string | null;
  invitedByName?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
}

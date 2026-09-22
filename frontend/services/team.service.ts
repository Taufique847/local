import { apiClient } from '../lib/api-client';
import { AuthResponse, BusinessRole, StaffInvite, TeamMember } from '../types/auth';

export interface InvitePreview {
  email: string;
  name?: string;
  businessRole: BusinessRole;
  businessName: string;
}

/**
 * Team management.
 *
 * Every endpoint except the two invite-acceptance calls is owner-only on the
 * server. The UI hides them from non-owners as well, but that is presentation —
 * the gate that matters is `requireOwner` in team.routes.ts.
 */
export class TeamService {
  public static async listMembers(): Promise<TeamMember[]> {
    const json = await apiClient.get<{ success: boolean; members: TeamMember[] }>(
      '/api/team/members'
    );
    return json.members || [];
  }

  public static async listInvites(): Promise<StaffInvite[]> {
    const json = await apiClient.get<{ success: boolean; invites: StaffInvite[] }>(
      '/api/team/invites'
    );
    return json.invites || [];
  }

  public static async createInvite(input: {
    email: string;
    name?: string;
    businessRole: BusinessRole;
    technicianId?: string;
  }): Promise<StaffInvite> {
    const json = await apiClient.post<{ success: boolean; invite: StaffInvite }>(
      '/api/team/invites',
      input
    );
    return json.invite;
  }

  public static async revokeInvite(inviteId: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/team/invites/${inviteId}`);
  }

  public static async updateMember(
    memberId: string,
    changes: { businessRole?: BusinessRole; isActive?: boolean }
  ): Promise<TeamMember> {
    const json = await apiClient.patch<{ success: boolean; member: TeamMember }>(
      `/api/team/members/${memberId}`,
      changes
    );
    return json.member;
  }

  public static async removeMember(memberId: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/team/members/${memberId}`);
  }

  /** Public: reads an invitation without consuming it, for the acceptance page. */
  public static async peekInvite(token: string): Promise<InvitePreview> {
    const json = await apiClient.get<{ success: boolean; invite: InvitePreview }>(
      `/api/team/invites/peek?token=${encodeURIComponent(token)}`
    );
    return json.invite;
  }

  /** Public: creates the account and signs the new member in. */
  public static async acceptInvite(input: {
    token: string;
    name: string;
    password: string;
  }): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/team/invites/accept', input);
  }
}

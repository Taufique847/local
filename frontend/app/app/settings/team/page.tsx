'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TeamService } from '@/services/team.service';
import { WorkerService } from '@/services/worker.service';
import { useAuth } from '@/context/auth-context';
import { BusinessRole, StaffInvite, TeamMember } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';

interface TechnicianOption {
  _id: string;
  name: string;
}

const ROLE_LABEL: Record<BusinessRole, string> = {
  owner: 'Owner',
  dispatcher: 'Dispatcher',
  technician: 'Technician',
};

const ROLE_DESCRIPTION: Record<BusinessRole, string> = {
  owner: 'Everything, including billing and team management.',
  dispatcher: 'Calls, bookings, dispatch and invoicing. No billing access.',
  technician: 'The field app only, limited to their own assigned jobs.',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  revoked: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function TeamSettingsPage() {
  const toast = useToast();
  const { user } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<BusinessRole>('dispatcher');
  const [inviteTechnicianId, setInviteTechnicianId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwner = user?.businessRole === 'owner';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Settled rather than all: a failure fetching the technician roster should
      // not blank out the team list, which is the point of the page.
      const [membersRes, invitesRes, techRes] = await Promise.allSettled([
        TeamService.listMembers(),
        TeamService.listInvites(),
        WorkerService.getTechnicians(),
      ]);

      if (membersRes.status === 'fulfilled') setMembers(membersRes.value);
      if (invitesRes.status === 'fulfilled') setInvites(invitesRes.value);
      if (techRes.status === 'fulfilled') {
        setTechnicians(
          (techRes.value as any[]).map((t) => ({ _id: t._id, name: t.name }))
        );
      }

      if (membersRes.status === 'rejected') {
        const err = membersRes.reason;
        setLoadError(
          err instanceof Error ? err.message : 'Could not load your team.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    const email = inviteEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Enter a valid email address.');
      return;
    }
    if (inviting) return;

    setInviting(true);
    try {
      await TeamService.createInvite({
        email,
        name: inviteName.trim() || undefined,
        businessRole: inviteRole,
        technicianId:
          inviteRole === 'technician' && inviteTechnicianId ? inviteTechnicianId : undefined,
      });
      toast.success(`Invitation sent to ${email}.`);
      setInviteEmail('');
      setInviteName('');
      setInviteTechnicianId('');
      await load();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'The invitation could not be sent.';
      setInviteError(message);
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (inviteId: string, email: string) => {
    setBusyId(inviteId);
    try {
      await TeamService.revokeInvite(inviteId);
      toast.success(`Invitation for ${email} revoked.`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke that invitation.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = async (member: TeamMember, nextRole: BusinessRole) => {
    if (nextRole === member.businessRole) return;
    setBusyId(member.id);
    try {
      await TeamService.updateMember(member.id, { businessRole: nextRole });
      toast.success(
        `${member.name} is now a ${ROLE_LABEL[nextRole].toLowerCase()}. They have been signed out and will need to log in again.`
      );
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not change that role.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    setBusyId(member.id);
    try {
      await TeamService.updateMember(member.id, { isActive: !member.isActive });
      toast.success(
        member.isActive
          ? `${member.name} has been suspended and signed out everywhere.`
          : `${member.name} can sign in again.`
      );
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update that member.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    setBusyId(member.id);
    try {
      await TeamService.removeMember(member.id);
      toast.success(`${member.name} has been removed from the workspace.`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that member.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Non-owners are shown an explanation rather than an empty page.
   *
   * This is presentation only — `requireOwner` on /api/team is what actually
   * enforces it, so hiding the UI is a courtesy, not the control.
   */
  if (!loading && !isOwner) {
    return (
      <DashboardShell>
        <div className="max-w-2xl">
          <a
            href="/app/settings"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Settings
          </a>
          <div className="p-6 rounded-xl bg-white border border-slate-200 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Owner access required</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Only the workspace owner can invite people or change what they can do. Ask your
                owner if you need access adjusted.
              </p>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="max-w-4xl space-y-8">
        <div>
          <a
            href="/app/settings"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Settings
          </a>
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Give your dispatcher and technicians their own logins instead of sharing yours. Only you
            can see billing.
          </p>
        </div>

        {loadError && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200/90 flex items-start gap-2.5 text-rose-800 text-xs">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{loadError}</span>
          </div>
        )}

        {/* Invite form */}
        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Invite someone</h2>
          </div>

          <form onSubmit={handleInvite} className="p-5 space-y-4">
            {inviteError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/90 flex items-start gap-2.5 text-rose-800 text-xs">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{inviteError}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Email address
                </label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                  className="text-sm"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Name <span className="font-normal text-slate-400 normal-case">(optional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="Jordan Reyes"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  disabled={inviting}
                  className="text-sm"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Role
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['dispatcher', 'technician'] as BusinessRole[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    disabled={inviting}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      inviteRole === role
                        ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      {ROLE_LABEL[role]}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {ROLE_DESCRIPTION[role]}
                    </span>
                  </button>
                ))}
              </div>
              {/*
                Owner is deliberately not offered: a workspace has exactly one, and
                a second owner could remove the first. The server rejects it too.
              */}
              <p className="text-xs text-slate-400">
                A workspace has a single owner, so that role cannot be granted here.
              </p>
            </div>

            {inviteRole === 'technician' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Link to technician record
                </label>
                {technicians.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                    You have no technician records yet. Add one under Dispatch first — without it,
                    this person will sign in but see no jobs, because the field app scopes to their
                    own record.
                  </p>
                ) : (
                  <>
                    <select
                      value={inviteTechnicianId}
                      onChange={(e) => setInviteTechnicianId(e.target.value)}
                      disabled={inviting}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="">Select a technician record</option>
                      {technicians.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      This is what limits them to their own jobs. Without it they can sign in but
                      will see nothing.
                    </p>
                  </>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={inviting}
              isLoading={inviting}
              className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm gap-2"
            >
              <Mail className="h-4 w-4" />
              <span>{inviting ? 'Sending...' : 'Send invitation'}</span>
            </Button>
          </form>
        </section>

        {/* Members */}
        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Members {!loading && <span className="text-slate-400 font-normal">({members.length})</span>}
            </h2>
          </div>

          {loading ? (
            <div className="px-5 py-10 flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading team...
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              No members yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {members.map((member) => (
                <li key={member.id} className="px-5 py-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {member.name}
                      </span>
                      {member.isSelf && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          You
                        </span>
                      )}
                      {!member.isActive && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                          Suspended
                        </span>
                      )}
                      {member.technicianId && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                          <Wrench className="h-2.5 w-2.5" />
                          Linked
                        </span>
                      )}
                    </div>
                    <span className="block text-xs text-slate-500 font-mono truncate mt-0.5">
                      {member.email}
                    </span>
                  </div>

                  {member.businessRole === 'owner' || member.isSelf ? (
                    <span className="text-xs font-semibold text-slate-600 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200">
                      {ROLE_LABEL[member.businessRole]}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={member.businessRole}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as BusinessRole)
                        }
                        disabled={busyId === member.id}
                        className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="dispatcher">Dispatcher</option>
                        <option value="technician">Technician</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(member)}
                        disabled={busyId === member.id}
                        title={member.isActive ? 'Suspend access' : 'Restore access'}
                        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {member.isActive ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemove(member)}
                        disabled={busyId === member.id}
                        title="Remove from workspace"
                        className="p-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Invitations */}
        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Invitations</h2>
          </div>

          {loading ? (
            <div className="px-5 py-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : invites.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No invitations sent yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invites.map((invite) => (
                <li key={invite.id} className="px-5 py-3.5 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800 font-mono truncate">
                      {invite.email}
                    </span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      {ROLE_LABEL[invite.businessRole]}
                      {invite.invitedByName ? ` · invited by ${invite.invitedByName}` : ''}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      STATUS_STYLE[invite.status] || STATUS_STYLE.revoked
                    }`}
                  >
                    {invite.status}
                  </span>

                  {invite.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(invite.id, invite.email)}
                      disabled={busyId === invite.id}
                      className="text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { FamilyLinkPanel } from "@/components/FamilyLinkPanel";
import { FAMILY_LINK_ENABLED } from "@/lib/family-link";
import { MemberRole } from "@/types";
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  Crown,
  Trash2,
  CheckCircle,
  X,
  AlertTriangle,
  UserCheck,
} from "lucide-react";

export default function HouseholdPage() {
  const {
    household,
    members,
    currentProfile,
    isDemoMode,
    switchActiveProfile,
    inviteMember,
    removeMember,
  } = useApp();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteConsent, setInviteConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setErrorMsg("Please enter both name and email.");
      return;
    }
    if (!inviteConsent) {
      setErrorMsg("Please confirm the consent notice before inviting.");
      return;
    }

    inviteMember(inviteName.trim(), inviteEmail.trim(), inviteRole);
    setIsInviteOpen(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("member");
    setInviteConsent(false);
    setErrorMsg("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Household & Family Members
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage who belongs to &ldquo;{household.name}&rdquo; and configure privacy boundaries
          </p>
        </div>
        {isDemoMode && (
          <button
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm transition self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            Invite Family Member
          </button>
        )}
      </div>

      {!isDemoMode && FAMILY_LINK_ENABLED && <FamilyLinkPanel />}

      {!isDemoMode && !FAMILY_LINK_ENABLED && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Family invitations and shared household access are not enabled yet.
          Your account currently has a private household.
        </div>
      )}

      {/* Role & Privacy Policy Box */}
      <div className="bg-slate-100/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-bold text-slate-900 dark:text-white text-sm">
              Household Consent & Privacy Guarantee
            </h2>
            <p>
              Family membership does NOT automatically expose private subscriptions. Each member retains full autonomy over their records:
            </p>
            <ul className="list-disc list-inside space-y-0.5 pt-1 text-slate-700 dark:text-slate-300">
              <li>
                <strong>Shared (Full Details):</strong> Visible to all household members.
              </li>
              <li>
                <strong>Totals Only:</strong> Included in aggregated household math, but service title and details are redacted for other members.
              </li>
              <li>
                <strong>Hidden:</strong> Completely confidential to the paying member; mathematically isolated from group totals to prevent inference leaks.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Member Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => {
          const isCurrentUser = member.user_id === currentProfile.id;

          return (
            <div
              key={member.id}
              className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm flex flex-col justify-between transition ${
                isCurrentUser
                  ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/20"
                  : "border-slate-200/90 dark:border-slate-800"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {member.name.charAt(0)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {member.role === "owner" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        <Crown className="w-3 h-3" />
                        Owner
                      </span>
                    ) : member.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Member
                      </span>
                    )}

                    {isCurrentUser && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {member.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {member.email}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Joined: {new Date(member.joined_at).toLocaleDateString()}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Active
                  </span>
                </div>
              </div>

              {/* Actions */}
              {isDemoMode && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                {!isCurrentUser ? (
                  <button
                    onClick={() => switchActiveProfile(member.user_id)}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Switch view to {member.name.split(" ")[0]}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 italic">Current Session</span>
                )}

                {member.role !== "owner" && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${member.name} from household?`)) {
                        removeMember(member.id);
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition"
                    title="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Invite Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsInviteOpen(false)}
              className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Invite Family Member
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Send an invitation to join &ldquo;{household.name}&rdquo;.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ananya Sharma"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. ananya@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="member">Member (Can add & view shared records)</option>
                  <option value="admin">Admin (Can manage subscriptions & invite members)</option>
                </select>
              </div>

              {/* Consent requirement per README */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteConsent}
                    onChange={(e) => setInviteConsent(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    I confirm that this individual is an adult member of my household and consents to receiving a household sharing link.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

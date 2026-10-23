"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  buildInviteUrl,
  createInvite,
  leaveHousehold,
  listInvites,
  myLinkedHouseholds,
  type LinkedHousehold,
  removeMemberRemote,
  revokeInvite,
  type OpenInvite,
} from "@/lib/family-link";

export function FamilyLinkPanel() {
  const { household, members, currentProfile } = useApp();
  const [invites, setInvites] = useState<OpenInvite[]>([]);
  const [linked, setLinked] = useState<LinkedHousehold[]>([]);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listInvites().then(setInvites).catch((e: Error) => setError(e.message));
    myLinkedHouseholds().then(setLinked).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const token = await createInvite(label);
      setFresh(buildInviteUrl(window.location.origin, token));
      setLabel("");
      setCopied(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(fresh);
    setCopied(true);
  };

  const open = invites.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date());
  const others = members.filter((m) => m.user_id !== currentProfile.id && m.role !== "owner");

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Link2 className="h-4 w-4 text-indigo-600" /> Add a family member
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Send them a one-time link. They sign in with their own account, see exactly what is shared, and agree.
          Their Gmail stays theirs: you never get access to it. The link works once and expires in 7 days.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who is this for? (optional)"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          onClick={create}
          disabled={busy}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Create link
        </button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {fresh && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <p className="font-semibold">Copy this now. For safety it is shown only once.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white p-2" data-testid="invite-url">{fresh}</code>
            <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white">
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {linked.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm" data-testid="linked-households">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">You share with</h3>
          <ul className="mt-2 space-y-2">
            {linked.map((l) => (
              <li key={l.household_id} className="flex items-center justify-between">
                <span>
                  {l.owner_name}&apos;s household <span className="text-xs text-slate-500">(since {new Date(l.joined_at).toLocaleDateString()})</span>
                </span>
                <LeaveHouseholdButton householdId={l.household_id} name={l.owner_name} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {open.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
          {open.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2">
              <span>
                {i.label || "Unnamed link"} · expires {new Date(i.expires_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => revokeInvite(i.id).then(reload).catch((e: Error) => setError(e.message))}
                className="font-semibold text-rose-600 hover:underline"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Linked members</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {others.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>{m.name}</span>
                <button
                  title="Remove member"
                  onClick={() => {
                    if (confirm(`Remove ${m.name}? Their subscriptions stop appearing here.`)) {
                      removeMemberRemote(household.id, m.user_id)
                        .then(() => window.location.reload())
                        .catch((e: Error) => setError(e.message));
                    }
                  }}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Shown to a member of someone else's household so they can stop sharing at any time. */
export function LeaveHouseholdButton({ householdId, name }: { householdId: string; name: string }) {
  return (
    <button
      onClick={() => {
        if (confirm(`Stop sharing with ${name}? Your own data and Gmail connection stay with you.`)) {
          leaveHousehold(householdId).then(() => window.location.reload());
        }
      }}
      className="text-xs font-semibold text-rose-600 hover:underline"
    >
      Stop sharing and leave
    </button>
  );
}

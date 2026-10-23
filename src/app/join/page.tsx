"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  FAMILY_LINK_ENABLED,
  PENDING_JOIN_KEY,
  acceptInvite,
  parseInviteToken,
  previewInvite,
} from "@/lib/family-link";

export default function JoinPage() {
  const { authUser } = useApp();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ household_name: string; owner_name: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let t = parseInviteToken(window.location.hash);
    try {
      if (t) localStorage.setItem(PENDING_JOIN_KEY, t);
      else t = localStorage.getItem(PENDING_JOIN_KEY);
    } catch {
      /* ignore */
    }
    // Remove the token from the address bar and history entry.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setToken(t);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!token || !authUser) return;
    previewInvite(token)
      .then(setInfo)
      .catch((e: Error) => {
        setError(e.message);
        // A dead link must not keep redirecting this person here.
        try {
          localStorage.removeItem(PENDING_JOIN_KEY);
        } catch {
          /* ignore */
        }
      });
  }, [token, authUser]);

  if (!FAMILY_LINK_ENABLED) {
    return <Notice>Family linking is not enabled yet.</Notice>;
  }
  if (!ready) return null;
  if (!token) {
    return <Notice>This link is missing or incomplete. Ask the person who invited you to send a new one.</Notice>;
  }

  if (!authUser) {
    return (
      <Card>
        <h1 className="text-xl font-bold">You were invited to a household</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in or create your own account first. You keep your own account, and you choose what to share.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/login" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">
            Sign in or create account
          </Link>
        </div>
      </Card>
    );
  }

  const join = async () => {
    setBusy(true);
    setError("");
    try {
      await acceptInvite(token);
      try {
        localStorage.removeItem(PENDING_JOIN_KEY);
      } catch {
        /* ignore */
      }
      window.location.assign("/household?auth=signed_in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join.");
      setBusy(false);
    }
  };

  const decline = () => {
    try {
      localStorage.removeItem(PENDING_JOIN_KEY);
    } catch {
      /* ignore */
    }
    router.replace("/");
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Shield className="mt-1 h-5 w-5 shrink-0 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold">
            {info ? `${info.owner_name} invited you to “${info.household_name}”` : "Checking your invitation..."}
          </h1>
          {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {info && (
            <>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Joining lets {info.owner_name} see a summary of your subscriptions in one place.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                <li><strong>Shared:</strong> service name, plan, category, price, billing cycle, renewal date, and who pays.</li>
                <li><strong>Not shared:</strong> your emails, Gmail access, notes, or anything you mark Hidden. Subscriptions marked Totals only show as an amount with no name.</li>
                <li>Your Gmail stays connected to your own account only. {info.owner_name} cannot scan it or use your access.</li>
                <li>You can leave at any time from the Household page. Sharing stops immediately and your data stays yours.</li>
              </ul>
              <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>I understand and agree to share this summary with this household.</span>
              </label>
              <div className="mt-4 flex gap-2">
                <button
                  disabled={!consent || busy}
                  onClick={join}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Joining..." : "Join household"}
                </button>
                <button onClick={decline} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600">
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <Card><p className="text-sm">{children}</p></Card>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const OTP_TYPES: EmailOtpType[] = ["recovery", "signup", "email", "invite", "magiclink", "email_change"];

// Email links land here with a token hash instead of a PKCE code, so they work on any device or
// browser, not only the one that asked for the email. The token is spent only when the person
// presses the button: mail scanners that pre-open links cannot use it up.
export default function ConfirmPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const tokenHash = typeof searchParams?.token_hash === "string" ? searchParams.token_hash : "";
  const rawType = typeof searchParams?.type === "string" ? searchParams.type : "";
  const type = OTP_TYPES.find((t) => t === rawType);
  const isRecovery = type === "recovery";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    tokenHash && type ? "" : "This link is incomplete. Request a new one from the sign-in page."
  );

  const confirm = async () => {
    if (!tokenHash || !type) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Sign-in is not configured.");
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (verifyError) {
      setBusy(false);
      setError(
        isRecovery
          ? "This link has expired or was already used. Request a new one with Forgot password."
          : "This link has expired or was already used. Try signing in; if that fails, sign up again."
      );
      return;
    }
    router.replace(isRecovery ? "/reset-password" : "/?auth=account_confirmed");
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {isRecovery ? "Reset your password" : "Confirm your email"}
        </h1>
        {error ? (
          <>
            <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
            <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Go to sign in
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Please wait..." : isRecovery ? "Continue to set a new password" : "Confirm and sign in"}
          </button>
        )}
      </div>
    </div>
  );
}

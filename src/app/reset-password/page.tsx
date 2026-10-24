"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Sign-in is not configured.");
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Sign out so the first thing the person does is a normal sign-in with the new password.
      await supabase.auth.signOut();
      router.replace(
        "/login?message=" + encodeURIComponent("Password updated. Sign in with your new password.")
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the password. Request a new reset link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Choose a new password</h1>
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            New password
            <input type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} name="password" autoComplete="new-password" minLength={8} required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirm new password
            <input type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} name="confirm" autoComplete="new-password" minLength={8} required value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show password
          </label>
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Please wait..." : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

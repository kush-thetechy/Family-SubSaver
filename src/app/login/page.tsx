"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const allowSignUp = process.env.NEXT_PUBLIC_ALLOW_SIGN_UP === "true";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") ?? ""
  );
  const setupRequired = searchParams.get("setup") === "required";
  const [warning, setWarning] = useState(
    searchParams.get("warning") ?? ""
  );
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setWarning("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Account sign-in is not configured. Add the Supabase URL and anon key to .env.local.");
      return;
    }
    if (mode === "sign_up" && !allowSignUp) {
      setError("New account registration is currently disabled.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "sign_up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage(
            "Your account was created. Check your email to confirm it, then return here to sign in."
          );
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }

      router.replace(
        mode === "sign_up" ? "/?auth=account_created" : "/?auth=signed_in"
      );
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not authenticate. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Link href="/" className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
          FamilySubSaver
        </Link>
        <h1 className="mt-5 text-2xl font-extrabold text-slate-900 dark:text-white">
          {mode === "sign_in" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sign in to manage your household subscriptions securely.
        </p>

        {!isSupabaseConfigured && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {setupRequired
              ? "Sign-in is required, but account storage is not configured yet. Add"
              : "Account sign-in is not configured. Add"}
            {" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and
            {" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable accounts.
            {" "}
            Then apply the Supabase migrations before signing in.
          </div>
        )}
        {isSupabaseConfigured && !allowSignUp && (
          <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
            Private testing is enabled. Sign in with the test account created in
            Supabase; public account registration is turned off.
          </div>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </p>
        )}
        {warning && (
          <p role="status" className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {warning}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "sign_up" && (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Name
              <input
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
            <input
              type="password"
              autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting || !isSupabaseConfigured}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "sign_in"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {allowSignUp && (
          <p className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
            {mode === "sign_in" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign_in" ? "sign_up" : "sign_in");
                setError("");
                setMessage("");
              }}
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {mode === "sign_in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AnalyticsSettings } from "@/components/AnalyticsSettings";
import {
  Download,
  Trash2,
  RotateCcw,
  Shield,
  FileText,
  Lock,
  Database,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

export default function SettingsPage() {
  const {
    currentProfile,
    household,
    isDemoMode,
    resetDemoData,
    exportDataJson,
    deleteAllHouseholdData,
  } = useApp();

  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const router = useRouter();

  const handleExport = () => {
    const dataStr = exportDataJson();
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `family-subscription-saver-export-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleDeleteAll = async () => {
    setActionError("");
    setActionMessage("");
    if (
      confirm(
        `WARNING: This will permanently delete ${
          isDemoMode ? "all local demo records" : "all subscriptions in your personal household"
        }. This action cannot be undone. Are you sure?`
      )
    ) {
      try {
        await deleteAllHouseholdData();
        setDeleteConfirmed(true);
        setTimeout(() => setDeleteConfirmed(false), 4000);
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Could not delete your data."
        );
      }
    }
  };

  const handleWithdrawGmailConsent = async () => {
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch("/api/connectors/gmail/consent", {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Could not withdraw Gmail consent.");
      }
      setActionMessage(
        "Gmail consent was withdrawn. The app will not start new Gmail scans until you consent again. This did not revoke the app's access in your Google Account and did not delete records already imported; use Disconnect Gmail and Delete Gmail-imported records for those."
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not withdraw Gmail consent."
      );
    }
  };

  const handleDeleteAccount = async () => {
    setActionError("");
    setActionMessage("");
    if (!currentProfile.email || !accountPassword) {
      setActionError("Enter your account password to confirm account deletion.");
      return;
    }
    if (
      !window.confirm(
        "Permanently delete your account, personal household, subscriptions, and Gmail consent records? This cannot be undone."
      )
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Account deletion is unavailable because sign-in is not configured.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentProfile.email,
        password: accountPassword,
      });
      if (reauthError) throw new Error("Password confirmation failed.");

      const response = await fetch("/api/account", { method: "DELETE" });
      const result = (await response.json()) as {
        success?: boolean;
        googleRevocationFailed?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not delete your account.");
      }

      await supabase.auth.signOut({ scope: "local" });
      router.replace(
        result.googleRevocationFailed
          ? "/login?account=deleted&warning=google-revoke"
          : "/login?account=deleted"
      );
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not delete your account."
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Settings, Privacy & Data Control
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage household preferences, data portability, and privacy commitments
        </p>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {actionMessage}
        </p>
      )}
      {/* Persistence / Mode Status */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Storage & Persistence Mode
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                {isDemoMode ? "Interactive Demo Mode Active" : "Signed-in personal account"}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isDemoMode
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              }`}>
                {isDemoMode ? "Local demo" : "Private cloud storage"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isDemoMode
                ? "Demo changes persist only in this browser. Configure Supabase to enable sign-in and private cloud storage."
                : "Your subscription records are stored in your Supabase household and protected by database Row Level Security. Family sharing is optional and starts only when someone accepts your invitation on the Household page."}
            </p>
          </div>

          {isDemoMode && (
            <button
              onClick={resetDemoData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shrink-0 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Demo Dataset
            </button>
          )}
        </div>
      </div>

      {/* Data Portability & Deletion */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <AnalyticsSettings />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Data Portability & Erasure
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Export or delete subscription records below. Gmail consent, Gmail connection, Gmail-imported records, and account deletion are separate controls. Provider backup-retention schedules are not controlled by this app.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Export */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Export Household Data
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Download all subscriptions, members, and audit metadata as a structured JSON backup.
              </p>
            </div>

            {!isDemoMode && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                <h3 className="font-bold text-sm text-rose-900 dark:text-rose-200">
                  Permanently delete account
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  This deletes your Supabase account, household records, subscription data, and Gmail consent history. Disconnect/revocation is attempted first; Google may still require you to remove access in your Google Account if revocation fails.
                </p>
                <label className="mt-3 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Confirm with your account password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount}
                  className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-60"
                >
                  {isDeletingAccount ? "Deleting account..." : "Delete account and data"}
                </button>
                <button
                  type="button"
                  onClick={handleWithdrawGmailConsent}
                  className="ml-2 mt-3 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Withdraw Gmail consent
                </button>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Withdrawing consent only stops new scans. It does not revoke Google access (Disconnect Gmail does that) and does not delete imported records (Delete Gmail-imported records does that).
                </p>
              </div>
            )}
            <div className="pt-4">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Download className="w-4 h-4" />
                {downloadSuccess ? "Exported Successfully!" : "Download JSON Backup"}
              </button>
            </div>
          </div>

          {/* Delete */}
          <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-rose-900 dark:text-rose-200">
                {isDemoMode ? "Delete Demo Records" : "Delete Subscriptions"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isDemoMode
                  ? "Permanently remove the demo subscriptions from this browser."
                  : "Permanently remove all subscriptions from your private household."}
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={handleDeleteAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition"
              >
                <Trash2 className="w-4 h-4" />
                {deleteConfirmed
                  ? "Records Deleted"
                  : isDemoMode
                    ? "Delete demo records"
                    : "Delete subscriptions"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Monetization & Business Model Transparency */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Ethical Business Model & Transparency
          </h2>
        </div>

        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            Family Subscription Saver is built on trust and privacy. We follow strict architectural rules:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <strong className="block text-slate-900 dark:text-white font-semibold mb-1">
                No Behavioral Advertising
              </strong>
              <span>
                We never monetize your spending records, bank notifications, or receipt images for personalized ad targeting.
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <strong className="block text-slate-900 dark:text-white font-semibold mb-1">
                No Paywalled Privacy
              </strong>
              <span>
                Access control, hiding private subscriptions, data corrections, and deletion are fundamental rights and will never be locked behind a paywall.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Legal & Product Scope Notice */}
      <div className="bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-xs text-slate-500 dark:text-slate-400 space-y-2">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
          Product & Legal Disclaimers
        </h3>
        <p>
          • <strong>Independent Directory:</strong> Family Subscription Saver is not affiliated with Netflix, Spotify, Google, Apple, Disney+ Hotstar, OpenAI, or telecom operators.
        </p>
        <p>
          • <strong>No Automated Actions:</strong> The app does not cancel, purchase, or modify third-party subscriptions. All savings recommendations require manual action on the provider&apos;s official portal.
        </p>
        <p>
          • <strong>Terms Compliance:</strong> We do not recommend account sharing outside of official household or family terms stipulated by respective providers.
        </p>
      </div>
    </div>
  );
}

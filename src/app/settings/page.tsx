"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
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

  const handleDeleteAll = () => {
    if (
      confirm(
        "WARNING: This will permanently delete all household subscriptions and reset local data. This action cannot be undone. Are you sure?"
      )
    ) {
      deleteAllHouseholdData();
      setDeleteConfirmed(true);
      setTimeout(() => setDeleteConfirmed(false), 4000);
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
                {isDemoMode ? "Interactive Demo Mode Active" : "Supabase Connected"}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">
                Zero Configuration
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Changes persist in browser local storage. Connect Supabase in `.env.local` to enable multi-device sync and live PostgreSQL Row Level Security.
            </p>
          </div>

          <button
            onClick={resetDemoData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shrink-0 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Dataset
          </button>
        </div>
      </div>

      {/* Data Portability & GDPR / DPDP Compliance */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Data Portability & Erasure
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          In compliance with the Indian Digital Personal Data Protection (DPDP) Act and standard data privacy principles, you have complete ownership of your household data.
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
                Delete Household Records
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Permanently purge all subscriptions and reset the household.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={handleDeleteAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition"
              >
                <Trash2 className="w-4 h-4" />
                {deleteConfirmed ? "Records Deleted" : "Purge All Data"}
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


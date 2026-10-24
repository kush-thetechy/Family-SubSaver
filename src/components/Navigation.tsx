"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  LayoutDashboard,
  Layers,
  Sparkles,
  Users,
  Settings,
  ShieldAlert,
  RotateCcw,
  UserCheck,
  FileUp,
  LogOut,
} from "lucide-react";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [signOutError, setSignOutError] = useState("");
  const [reviewCount, setReviewCount] = useState(0);
  const {
    currentProfile,
    authUser,
    accountError,
    isFamilyView,
    allProfiles,
    switchActiveProfile,
    isDemoMode,
    resetDemoData,
    summary,
    signOut,
  } = useApp();

  // Owner-only: the endpoint answers 404 to everyone else, so nothing shows for other users.
  useEffect(() => {
    if (!authUser) {
      setReviewCount(0);
      return;
    }
    fetch("/api/billing/admin-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setReviewCount(d && typeof d.pending === "number" ? d.pending : 0))
      .catch(() => setReviewCount(0));
  }, [authUser, pathname]);

  const navLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/subscriptions", label: "Subscriptions", icon: Layers },
    { href: "/savings", label: "Savings", icon: Sparkles },
    { href: "/import", label: "Import", icon: FileUp },
    { href: "/household", label: "Household", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const handleSignOut = async () => {
    setSignOutError("");
    try {
      const warning = await signOut();
      router.replace(
        warning ? `/login?warning=${encodeURIComponent(warning)}` : "/login"
      );
      router.refresh();
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : "Could not sign out."
      );
    }
  };

  return (
    <>
      {/* Top Banner & Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        {/* Demo Mode Notice Banner */}
        {isDemoMode && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/10 border-b border-amber-200/50 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
              <span className="font-semibold uppercase tracking-wider bg-amber-500 text-white px-1.5 py-0.5 rounded text-[10px]">
                Demo Mode
              </span>
              <span className="truncate">
                Using realistic Indian household demo data. No real charges.
              </span>
            </div>
            <button
              onClick={resetDemoData}
              className="flex items-center gap-1 hover:text-amber-700 dark:hover:text-amber-100 font-medium underline text-[11px] shrink-0 ml-2"
              title="Reset to default demo data"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Demo
            </button>
          </div>
        )}

        {accountError && (
          <div role="alert" className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-center text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {accountError}
          </div>
        )}
        {signOutError && (
          <div role="alert" className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-center text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {signOutError}
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/20">
              ₹
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                FamilySubSaver
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                Indian Household Hub
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Profile Switcher (Key feature to test visibility & privacy!) */}
          <div className="flex items-center gap-2 shrink-0">
            {isDemoMode ? (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <span className="hidden sm:inline-block px-1.5 font-medium text-slate-500 dark:text-slate-400">
                  Viewing as:
                </span>
                <select
                  value={isFamilyView ? "family" : currentProfile.id}
                  onChange={(e) => switchActiveProfile(e.target.value)}
                  className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-semibold py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  aria-label="Choose family or member view"
                >
                  <option value="family">Whole family</option>
                  {allProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : authUser ? (
              <>
                {reviewCount > 0 ? (
                  <Link
                    href="/admin/billing"
                    className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    {reviewCount} payment{reviewCount === 1 ? "" : "s"} to review
                  </Link>
                ) : null}
                <span
                  data-clarity-mask="true"
                  className="hidden sm:block max-w-40 truncate text-xs text-slate-500 dark:text-slate-400"
                >
                  {authUser.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Sign in
              </Link>
            )}

            {isDemoMode && summary.hiddenCountForOthers > 0 && (
              <div
                className="hidden lg:flex items-center gap-1 text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg"
                title="Privacy protection active: 1 subscription hidden from this member"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Privacy Guard Active</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 backdrop-blur pb-safe">
        <nav className="flex items-stretch justify-between gap-0 px-1 py-1.5">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 py-1 px-0 tracking-tighter rounded-lg text-[10px] font-medium transition-colors ${
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                <span className="max-w-full truncate">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { formatINR, calculateMonthlyPaise } from "@/lib/calculations";
import {
  CreditCard,
  AlertTriangle,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  TrendingDown,
  Info,
  ShieldCheck,
  PlusCircle,
  FileUp,
} from "lucide-react";

export default function DashboardPage() {
  const {
    currentProfile,
    isFamilyView,
    summary,
    subscriptions,
    recommendations,
    auditProgress,
    members,
  } = useApp();

  // Find upcoming renewals in next 30 days
  const now = new Date("2026-10-15"); // Reference app date
  const upcomingRenewals = subscriptions
    .filter((s) => {
      if (!s.is_active || !s.renewal_date) return false;
      // A family-wide view excludes all hidden records and redacts totals-only records.
      if (
        (isFamilyView && s.visibility !== "full_details") ||
        (!isFamilyView &&
          s.payer_id !== currentProfile.id &&
          s.visibility === "hidden")
      ) {
        return false;
      }
      const rDate = new Date(s.renewal_date);
      const diffDays = Math.ceil(
        (rDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays >= 0 && diffDays <= 30;
    })
    .map((s) => {
      const rDate = new Date(s.renewal_date!);
      const diffDays = Math.ceil(
        (rDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const payer = members.find((m) => m.user_id === s.payer_id);
      return {
        ...s,
        diffDays,
        payerName: payer ? payer.name.split(" ")[0] : "Household",
      };
    })
    .sort((a, b) => a.diffDays - b.diffDays);

  // High priority alerts
  const urgentAlerts = recommendations.slice(0, 3);

  // Calculate potential savings sum
  const totalPotentialMonthlySavingsPaise = recommendations.reduce(
    (sum, r) => sum + r.potential_monthly_savings_paise,
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Greeting & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Household Spend Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Viewing records as{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {isFamilyView ? "Whole family" : currentProfile.name}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/subscriptions?action=add"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            Add Subscription
          </Link>
          <Link
            href="/import"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-medium text-xs sm:text-sm transition shadow-sm"
          >
            <FileUp className="w-4 h-4 text-indigo-500" />
            Import Receipt
          </Link>
        </div>
      </div>

      {/* Honest Audit Completeness Notice */}
      <div className="bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {auditProgress.label} ({auditProgress.score}% complete)
                </span>
                {!auditProgress.isComplete && (
                  <span className="text-[10px] font-medium uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                    Work in Progress
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                {auditProgress.isComplete
                  ? "All subscriptions have verified payers, users, and billing channels."
                  : `Totals reflect only recorded subscriptions. ${auditProgress.unconfirmedCount} service(s) still lack confirmed renewal details.`}
              </p>
            </div>
          </div>
          <div className="w-full sm:w-48 bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden shrink-0">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${auditProgress.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Primary Spend KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Normalized Monthly Spend */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Monthly Recurring
              </span>
              <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {formatINR(summary.monthlyRecurringPaise)}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                /mo
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            Normalized monthly equivalent
          </p>
        </div>

        {/* Annualized Spend */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Annualized Spend
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {formatINR(summary.annualizedRecurringPaise)}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                /yr
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            Monthly spend × 12
          </p>
        </div>

        {/* Recorded Subscriptions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Active Services
              </span>
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {summary.activeCount}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span>
              Across {members.length} member{members.length === 1 ? "" : "s"}
            </span>
            {summary.hiddenCountForOthers > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {summary.hiddenCountForOthers} private
              </span>
            )}
          </div>
        </div>

        {/* Potential Monthly Savings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Potential Savings
              </span>
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {totalPotentialMonthlySavingsPaise > 0
                ? formatINR(totalPotentialMonthlySavingsPaise)
                : "₹0"}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                /mo
              </span>
            </div>
          </div>
          <Link
            href="/savings"
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between font-medium"
          >
            <span>Review opportunities</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Urgent Renewals & Review Alerts (2 Columns on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approaching Renewals */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Approaching Renewals
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Next 30 Days
            </span>
          </div>

          {upcomingRenewals.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
              No renewals scheduled in the next 30 days.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingRenewals.slice(0, 4).map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {sub.service_name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Paid by {sub.payerName} • {sub.billing_channel || "Direct"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {formatINR(sub.amount_paise)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                        {sub.billing_cycle.replace("_", " ")}
                      </div>
                    </div>
                    <div
                      className={`px-2 py-1 rounded-lg text-xs font-semibold shrink-0 ${
                        sub.diffDays <= 3
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                          : sub.diffDays <= 7
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {sub.diffDays === 0
                        ? "Today"
                        : sub.diffDays === 1
                        ? "Tomorrow"
                        : `In ${sub.diffDays}d`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <Link
              href="/subscriptions"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              View full subscription schedule
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Duplicate & Savings Alerts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Review Alerts & Opportunities
              </h2>
            </div>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full">
              {recommendations.length} Active
            </span>
          </div>

          <div className="space-y-3">
            {urgentAlerts.map((rec) => (
              <div
                key={rec.id}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          rec.state === "confirmed_estimate"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : rec.state === "potential_saving"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {rec.state.replace("_", " ")}
                      </span>
                      {rec.potential_monthly_savings_paise > 0 && (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Save {formatINR(rec.potential_monthly_savings_paise)}/mo
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {rec.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {rec.evidence[0]}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <Link
              href="/savings"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              Analyze all savings opportunities
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Spend Breakdown by Category & Payer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            Spend by Category
          </h2>
          <div className="space-y-3">
            {Object.entries(summary.categoryBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, paise]) => {
                const percent =
                  summary.monthlyRecurringPaise > 0
                    ? Math.round((paise / summary.monthlyRecurringPaise) * 100)
                    : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="capitalize text-slate-700 dark:text-slate-300">
                        {cat}
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        {formatINR(paise)}/mo ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Payer Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            Spend by Family Member (Payer)
          </h2>
          <div className="space-y-3">
            {Object.entries(summary.payerBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([payerId, paise]) => {
                const member = members.find((m) => m.user_id === payerId);
                const percent =
                  summary.monthlyRecurringPaise > 0
                    ? Math.round((paise / summary.monthlyRecurringPaise) * 100)
                    : 0;
                return (
                  <div key={payerId} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-700 dark:text-slate-300">
                        {member?.name || "Unknown Member"}
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        {formatINR(paise)}/mo ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

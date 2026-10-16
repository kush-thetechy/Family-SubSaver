"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatINR, calculateAnnualPaise } from "@/lib/calculations";
import { INDIAN_SUBSCRIPTION_CATALOG } from "@/lib/catalog";
import {
  Sparkles,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Building,
} from "lucide-react";

export default function SavingsPage() {
  const { recommendations, subscriptions, currentProfile } = useApp();
  const [filterState, setFilterState] = useState<string>("all");

  const filteredRecs = recommendations.filter((r) => {
    if (filterState === "all") return true;
    return r.state === filterState;
  });

  const totalMonthlySavingsPaise = recommendations.reduce(
    (sum, r) => sum + r.potential_monthly_savings_paise,
    0
  );
  const totalAnnualSavingsPaise = calculateAnnualPaise(totalMonthlySavingsPaise);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Savings & Household Optimization
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Conservative, evidence-based recommendations. No fabricated claims or terms violations.
        </p>
      </div>

      {/* Savings Summary Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-lg shadow-emerald-700/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2.5 py-1 rounded-full text-emerald-50">
              Verified Household Opportunities
            </span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black tracking-tight">
                {totalMonthlySavingsPaise > 0
                  ? formatINR(totalMonthlySavingsPaise)
                  : "₹0"}
              </span>
              <span className="text-sm font-medium text-emerald-100">
                / month potential savings
              </span>
            </div>
            <p className="text-xs text-emerald-100/90 mt-1">
              Estimated annual savings:{" "}
              <strong className="text-white">
                {formatINR(totalAnnualSavingsPaise)}
              </strong>{" "}
              if eligible consolidation criteria are met.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-xs text-emerald-50 max-w-sm">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-200" />
              <span>
                <strong>Our Principle:</strong> We never assume members can share plans unless verified against official provider terms (e.g. same residential address).
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3-State Recommendation Guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Confirmed Estimate
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Eligibility, price, capacity and feature equivalence are verified with positive savings.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Potential Saving
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            A plausible family tier exists, but key prerequisites (like same address) require confirmation.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Compare Only
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Service overlap exists (e.g. 2 different AI apps), but equivalence or savings are unverified.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setFilterState("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
            filterState === "all"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          All Recommendations ({recommendations.length})
        </button>
        <button
          onClick={() => setFilterState("potential_saving")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
            filterState === "potential_saving"
              ? "bg-amber-600 text-white"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Potential Savings
        </button>
        <button
          onClick={() => setFilterState("compare_only")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
            filterState === "compare_only"
              ? "bg-slate-600 text-white"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Compare Only
        </button>
      </div>

      {/* Recommendations Cards */}
      <div className="space-y-4">
        {filteredRecs.map((rec) => (
          <div
            key={rec.id}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm"
          >
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      rec.state === "confirmed_estimate"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : rec.state === "potential_saving"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {rec.state.replace("_", " ")}
                  </span>
                  <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                    {rec.category}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {rec.title}
                </h2>
              </div>

              {rec.potential_monthly_savings_paise > 0 && (
                <div className="text-left sm:text-right bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 p-3 rounded-xl shrink-0">
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">
                    Potential Savings
                  </span>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {formatINR(rec.potential_monthly_savings_paise)}
                    <span className="text-xs font-normal">/mo</span>
                  </div>
                  <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                    {formatINR(calculateAnnualPaise(rec.potential_monthly_savings_paise))}/year
                  </span>
                </div>
              )}
            </div>

            {/* Evidence & Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Observed Household Evidence
                </h4>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc list-inside">
                  {rec.evidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Key Assumptions & Conditions
                </h4>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc list-inside">
                  {rec.assumptions.map((asmp, i) => (
                    <li key={i}>{asmp}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Suggested Action */}
            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 text-xs">
              <span className="font-bold text-indigo-950 dark:text-indigo-200 block mb-1">
                Recommended Action:
              </span>
              <p className="text-indigo-900 dark:text-indigo-300 leading-relaxed">
                {rec.suggested_action}
              </p>
            </div>

            {/* Verification Date, Official Sources & Disclaimers */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                {rec.verification_date && (
                  <span>Verified: {rec.verification_date}</span>
                )}
                {rec.source_urls?.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    {src.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
              <p className="italic text-[10px] text-slate-400 max-w-md">
                {rec.disclaimer}
              </p>
            </div>
          </div>
        ))}

        {filteredRecs.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No recommendations in this category.
            </p>
          </div>
        )}
      </div>

      {/* Sourced Indian Catalog Reference */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm mt-8">
        <div className="flex items-center gap-2 mb-2">
          <Building className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Sourced Indian Subscription Plans & Sharing Rules
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Verified pricing and official terms from provider documentation in India.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Service</th>
                <th className="p-3">Individual Plan</th>
                <th className="p-3">Family / Multi-user Plan</th>
                <th className="p-3">Sharing & Residency Policy</th>
                <th className="p-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
              {INDIAN_SUBSCRIPTION_CATALOG.map((svc) => {
                const individualPlan = svc.plans.find((p) => p.user_limit === 1);
                const familyPlan = svc.plans.find((p) => p.user_limit > 1);

                return (
                  <tr key={svc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {svc.name}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {individualPlan
                        ? `${formatINR(individualPlan.amount_paise)} / ${individualPlan.billing_cycle}`
                        : "N/A"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {familyPlan ? (
                        <div>
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {formatINR(familyPlan.amount_paise)} / {familyPlan.billing_cycle}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Up to {familyPlan.user_limit} users
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Single user only</span>
                      )}
                    </td>
                    <td className="p-3 max-w-xs text-[11px] leading-relaxed">
                      {svc.sharing_policy_notes}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <a
                        href={svc.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        Official Site
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


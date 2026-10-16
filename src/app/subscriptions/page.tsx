"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  BillingCycle,
  SubscriptionCategory,
  VisibilityLevel,
  Subscription,
} from "@/types";
import {
  formatINR,
  calculateMonthlyPaise,
  rupeesToPaise,
  paiseToRupees,
} from "@/lib/calculations";
import { INDIAN_SUBSCRIPTION_CATALOG } from "@/lib/catalog";
import {
  Plus,
  Search,
  Filter,
  Eye,
  EyeOff,
  Shield,
  Edit2,
  Trash2,
  Calendar,
  X,
  CreditCard,
  Users,
  Check,
  AlertCircle,
} from "lucide-react";

function SubscriptionsContent() {
  const searchParams = useSearchParams();
  const {
    subscriptions,
    currentProfile,
    isFamilyView,
    members,
    addSubscription,
    updateSubscription,
    deleteSubscription,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPayer, setSelectedPayer] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  // Form State
  const [formService, setFormService] = useState("");
  const [formPlan, setFormPlan] = useState("");
  const [formCategory, setFormCategory] =
    useState<SubscriptionCategory>("ott");
  const [formCycle, setFormCycle] = useState<BillingCycle>("monthly");
  const [formAmountRupees, setFormAmountRupees] = useState("");
  const [formValidityDays, setFormValidityDays] = useState("28");
  const [formPayerId, setFormPayerId] = useState(currentProfile.id);
  const [formUserIds, setFormUserIds] = useState<string[]>([currentProfile.id]);
  const [formBillingChannel, setFormBillingChannel] = useState("UPI AutoPay");
  const [formRenewalDate, setFormRenewalDate] = useState("");
  const [formVisibility, setFormVisibility] =
    useState<VisibilityLevel>("full_details");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Check query params for action=add
  useEffect(() => {
    if (searchParams.get("action") === "add") {
      openAddModal();
    }
  }, [searchParams]);

  const openAddModal = () => {
    setEditingSub(null);
    setFormService("");
    setFormPlan("");
    setFormCategory("ott");
    setFormCycle("monthly");
    setFormAmountRupees("");
    setFormValidityDays("28");
    setFormPayerId(currentProfile.id);
    setFormUserIds([currentProfile.id]);
    setFormBillingChannel("UPI AutoPay");
    setFormRenewalDate("");
    setFormVisibility("full_details");
    setFormNotes("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (sub: Subscription) => {
    setEditingSub(sub);
    setFormService(sub.service_name);
    setFormPlan(sub.plan_name || "");
    setFormCategory(sub.category);
    setFormCycle(sub.billing_cycle);
    setFormAmountRupees(paiseToRupees(sub.amount_paise).toString());
    setFormValidityDays(sub.validity_days?.toString() || "28");
    setFormPayerId(sub.payer_id);
    setFormUserIds(sub.user_ids || [sub.payer_id]);
    setFormBillingChannel(sub.billing_channel || "UPI AutoPay");
    setFormRenewalDate(sub.renewal_date || "");
    setFormVisibility(sub.visibility);
    setFormNotes(sub.notes || "");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleCatalogSelect = (catalogId: string) => {
    const item = INDIAN_SUBSCRIPTION_CATALOG.find((c) => c.id === catalogId);
    if (!item) return;
    setFormService(item.name);
    setFormCategory(item.category);
    if (item.plans.length > 0) {
      const defaultPlan = item.plans[0];
      setFormPlan(defaultPlan.name);
      setFormCycle(defaultPlan.billing_cycle);
      setFormAmountRupees(paiseToRupees(defaultPlan.amount_paise).toString());
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formService.trim()) {
      setFormError("Service name is required.");
      return;
    }
    const amountNum = parseFloat(formAmountRupees);
    if (isNaN(amountNum) || amountNum < 0) {
      setFormError("Please enter a valid amount.");
      return;
    }

    const amountPaise = rupeesToPaise(amountNum);
    const validity =
      formCycle === "prepaid" ? parseInt(formValidityDays) || 28 : undefined;

    if (editingSub) {
      updateSubscription(editingSub.id, {
        service_name: formService.trim(),
        plan_name: formPlan.trim() || undefined,
        category: formCategory,
        billing_cycle: formCycle,
        amount_paise: amountPaise,
        validity_days: validity,
        payer_id: formPayerId,
        user_ids: formUserIds,
        billing_channel: formBillingChannel,
        renewal_date: formRenewalDate || undefined,
        visibility: formVisibility,
        notes: formNotes.trim() || undefined,
      });
    } else {
      addSubscription({
        household_id: "hh-demo-sharma",
        service_name: formService.trim(),
        plan_name: formPlan.trim() || undefined,
        category: formCategory,
        billing_cycle: formCycle,
        amount_paise: amountPaise,
        validity_days: validity,
        payer_id: formPayerId,
        user_ids: formUserIds,
        billing_channel: formBillingChannel,
        renewal_date: formRenewalDate || undefined,
        visibility: formVisibility,
        source: "manual",
        is_active: true,
        notes: formNotes.trim() || undefined,
      });
    }

    setIsModalOpen(false);
  };

  // Filter subscriptions based on visibility and search/filter inputs
  const filteredSubscriptions = useMemo(() => {
    return subscriptions
      .filter((sub) => {
        const isOwn = sub.payer_id === currentProfile.id;
        if (
          (isFamilyView && sub.visibility === "hidden") ||
          (!isFamilyView && !isOwn && sub.visibility === "hidden")
        ) {
          return false;
        }

        const canSeeDetails =
          (!isFamilyView && isOwn) || sub.visibility === "full_details";

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesName = (canSeeDetails
            ? sub.service_name
            : "private recurring expense").toLowerCase().includes(q);
          const matchesPlan = canSeeDetails
            ? sub.plan_name?.toLowerCase().includes(q)
            : "details hidden by payer".includes(q);
          const matchesNotes = canSeeDetails
            ? sub.notes?.toLowerCase().includes(q)
            : false;
          if (!matchesName && !matchesPlan && !matchesNotes) return false;
        }

        // Category filter
        const visibleCategory =
          isFamilyView && sub.visibility === "totals_only"
            ? "other"
            : sub.category;
        if (selectedCategory !== "all" && visibleCategory !== selectedCategory) {
          return false;
        }

        // Payer filter
        if (selectedPayer !== "all" && sub.payer_id !== selectedPayer) {
          return false;
        }

        return true;
      })
      .map((sub) => {
        const isOwn = sub.payer_id === currentProfile.id;
        if (
          (isFamilyView && sub.visibility === "totals_only") ||
          (!isFamilyView && !isOwn && sub.visibility === "totals_only")
        ) {
          return {
            ...sub,
            service_name: "Private Recurring Expense",
            plan_name: "Details hidden by payer",
            category: "other" as const,
            billing_channel: undefined,
            renewal_date: undefined,
            notes: undefined,
            isRedacted: true,
          };
        }
        return {
          ...sub,
          isRedacted: false,
        };
      });
  }, [
    subscriptions,
    currentProfile.id,
    isFamilyView,
    searchQuery,
    selectedCategory,
    selectedPayer,
  ]);

  return (
    <div className="space-y-6">
      {/* Header & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Subscription Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isFamilyView
              ? "Shared subscriptions across the family. Private records stay hidden."
              : "Manage, review, and track all household recurring services"}
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Subscription
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by service, plan, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Categories</option>
            <option value="ott">OTT & Streaming</option>
            <option value="music">Music & Audio</option>
            <option value="ai">AI Productivity</option>
            <option value="cloud">Cloud Storage</option>
            <option value="telecom">Telecom & Broadband</option>
            <option value="utilities">Utilities</option>
            <option value="fitness">Fitness & Wellness</option>
            <option value="gaming">Gaming</option>
            <option value="other">Other</option>
          </select>

          <select
            value={selectedPayer}
            onChange={(e) => setSelectedPayer(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Payers</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                Paid by {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Subscription List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSubscriptions.map((sub) => {
          const payer = members.find((m) => m.user_id === sub.payer_id);
          const isOwn = sub.payer_id === currentProfile.id;
          const monthlyEquivalent = calculateMonthlyPaise(
            sub.amount_paise,
            sub.billing_cycle,
            sub.validity_days
          );

          return (
            <div
              key={sub.id}
              className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm flex flex-col justify-between transition hover:shadow-md ${
                sub.visibility === "hidden"
                  ? "border-amber-200 dark:border-amber-900/60 bg-amber-50/20"
                  : "border-slate-200/90 dark:border-slate-800"
              }`}
            >
              <div>
                {/* Top Meta: Category + Visibility */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md capitalize">
                    {sub.isRedacted ? "Household total" : sub.category}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {sub.visibility === "hidden" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 rounded-full">
                        <EyeOff className="w-3 h-3" />
                        Hidden (Only You)
                      </span>
                    )}
                    {sub.visibility === "totals_only" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        <Shield className="w-3 h-3" />
                        Totals Only
                      </span>
                    )}
                    {sub.visibility === "full_details" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                        <Eye className="w-3 h-3" />
                        Shared
                      </span>
                    )}
                  </div>
                </div>

                {/* Service Name & Plan */}
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {sub.service_name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {sub.plan_name || "Standard Plan"}
                </p>

                {/* Amount details */}
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-baseline justify-between">
                    <div>
                      {sub.isRedacted ? (
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Included in family total
                        </span>
                      ) : (
                        <>
                          <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                            {formatINR(sub.amount_paise)}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 ml-1 capitalize">
                            /{sub.billing_cycle.replace("_", " ")}
                          </span>
                        </>
                      )}
                    </div>
                    {!sub.isRedacted && sub.billing_cycle !== "one_time" && (
                      <div className="text-right">
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {formatINR(monthlyEquivalent)}
                          <span className="font-normal text-slate-400">/mo</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payer and Beneficiaries */}
                <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Paid by:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {sub.isRedacted
                        ? "Household member"
                        : `${payer?.name || "Household"} ${isOwn ? "(You)" : ""}`}
                    </span>
                  </div>
                  {sub.renewal_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Next renewal:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {sub.renewal_date}
                      </span>
                    </div>
                  )}
                  {sub.billing_channel && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Channel:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {sub.billing_channel}
                      </span>
                    </div>
                  )}
                </div>

                {sub.notes && (
                  <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    &ldquo;{sub.notes}&rdquo;
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  onClick={() => openEditModal(sub)}
                  disabled={sub.isRedacted}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
                  title="Edit subscription"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to delete "${sub.service_name}"?`
                      )
                    ) {
                      deleteSubscription(sub.id);
                    }
                  }}
                  disabled={sub.isRedacted}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
                  title="Delete subscription"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSubscriptions.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            No subscriptions matched your search or filter.
          </p>
        </div>
      )}

      {/* Add / Edit Subscription Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {editingSub ? "Edit Subscription" : "Add New Subscription"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter details accurately. All amounts stored decimal-safe in paise.
            </p>

            {/* Quick Sourced Catalog Pre-fill */}
            {!editingSub && (
              <div className="mb-4 p-3 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                <span className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 block mb-1.5">
                  Popular Indian Subscriptions (Quick Pre-fill):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {INDIAN_SUBSCRIPTION_CATALOG.map((catItem) => (
                    <button
                      key={catItem.id}
                      type="button"
                      onClick={() => handleCatalogSelect(catItem.id)}
                      className="px-2 py-1 text-xs bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                    >
                      {catItem.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Service & Plan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Service Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Netflix, Spotify"
                    value={formService}
                    onChange={(e) => setFormService(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Plan / Tier
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Premium 4K, Family"
                    value={formPlan}
                    onChange={(e) => setFormPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Category & Billing Cycle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as SubscriptionCategory)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="ott">OTT & Streaming</option>
                    <option value="music">Music & Audio</option>
                    <option value="ai">AI Productivity</option>
                    <option value="cloud">Cloud Storage</option>
                    <option value="telecom">Telecom & Broadband</option>
                    <option value="utilities">Utilities</option>
                    <option value="fitness">Fitness & Wellness</option>
                    <option value="gaming">Gaming</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={formCycle}
                    onChange={(e) =>
                      setFormCycle(e.target.value as BillingCycle)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly (every 3 mos)</option>
                    <option value="half_yearly">Half-Yearly (every 6 mos)</option>
                    <option value="annual">Annual (yearly)</option>
                    <option value="prepaid">Prepaid Validity (days)</option>
                    <option value="one_time">One-Time (excluded from monthly)</option>
                  </select>
                </div>
              </div>

              {/* Amount and Validity Days */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amount in INR (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 499"
                      value={formAmountRupees}
                      onChange={(e) => setFormAmountRupees(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
                    />
                  </div>
                </div>

                {formCycle === "prepaid" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Validity Days (e.g. 28, 84)
                    </label>
                    <input
                      type="number"
                      value={formValidityDays}
                      onChange={(e) => setFormValidityDays(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Renewal Date
                    </label>
                    <input
                      type="date"
                      value={formRenewalDate}
                      onChange={(e) => setFormRenewalDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Payer and Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Who pays?
                  </label>
                  <select
                    value={formPayerId}
                    onChange={(e) => setFormPayerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Billing Channel
                  </label>
                  <select
                    value={formBillingChannel}
                    onChange={(e) => setFormBillingChannel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="UPI AutoPay">UPI AutoPay</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Google Play Store">Google Play Store</option>
                    <option value="Apple App Store">Apple App Store</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Direct">Direct Provider Billing</option>
                  </select>
                </div>
              </div>

              {/* Beneficiary Users (Multi-select) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Who uses this service in the family?
                </label>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const isSelected = formUserIds.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (formUserIds.length > 1) {
                              setFormUserIds(
                                formUserIds.filter((id) => id !== m.user_id)
                              );
                            }
                          } else {
                            setFormUserIds([...formUserIds, m.user_id]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy / Visibility Controls */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Privacy & Member Visibility
                </label>
                <div className="space-y-2 mt-2">
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="full_details"
                      checked={formVisibility === "full_details"}
                      onChange={() => setFormVisibility("full_details")}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Full Details (Shared)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Household members can see the service name, plan, cost, and usage.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="totals_only"
                      checked={formVisibility === "totals_only"}
                      onChange={() => setFormVisibility("totals_only")}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Totals Only (Redacted)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Amount is included in household spend totals, but service name and notes are redacted for other members.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="hidden"
                      checked={formVisibility === "hidden"}
                      onChange={() => setFormVisibility("hidden")}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        Hidden (Private to Payer)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Completely private. Excluded from group dashboard totals so other members cannot infer its existence.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Shared with parents, renewed with credit card offer"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
                >
                  {editingSub ? "Update Subscription" : "Save Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-slate-500">
          Loading subscriptions...
        </div>
      }
    >
      <SubscriptionsContent />
    </Suspense>
  );
}

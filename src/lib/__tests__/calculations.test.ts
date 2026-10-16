import { describe, it, expect } from "vitest";
import {
  calculateMonthlyPaise,
  calculateAnnualPaise,
  calculateHouseholdSummary,
  formatINR,
  getVisibleSubscriptions,
  rupeesToPaise,
} from "../calculations";
import { Subscription } from "@/types";

describe("Subscription Calculations & Normalization", () => {
  it("normalizes monthly billing cycle correctly", () => {
    // ₹649/month = 64900 paise
    expect(calculateMonthlyPaise(64900, "monthly")).toBe(64900);
  });

  it("normalizes quarterly billing cycle correctly (amount / 3)", () => {
    // ₹999/quarter = 99900 paise -> 33300 paise
    expect(calculateMonthlyPaise(99900, "quarterly")).toBe(33300);
  });

  it("normalizes half-yearly billing cycle correctly (amount / 6)", () => {
    // ₹1200/6 months = 120000 paise -> 20000 paise
    expect(calculateMonthlyPaise(120000, "half_yearly")).toBe(20000);
  });

  it("normalizes annual billing cycle correctly (amount / 12)", () => {
    // ₹1499/year = 149900 paise -> 12492 paise
    expect(calculateMonthlyPaise(149900, "annual")).toBe(12492);
  });

  it("normalizes prepaid validity plans correctly (amount / days * 30)", () => {
    // ₹299 for 28 days = 29900 paise -> (29900 / 28) * 30 = 32036 paise
    expect(calculateMonthlyPaise(29900, "prepaid", 28)).toBe(32036);
  });

  it("excludes one-time records from recurring monthly totals", () => {
    // ₹5000 one-time = 500000 paise -> 0 recurring monthly paise
    expect(calculateMonthlyPaise(500000, "one_time")).toBe(0);
  });

  it("calculates annualized cost as monthly * 12", () => {
    expect(calculateAnnualPaise(10000)).toBe(120000);
  });

  it("formats INR currency accurately", () => {
    expect(formatINR(49900)).toBe("₹499");
    expect(formatINR(49950, true)).toBe("₹499.50");
  });

  it("converts rupees to paise safely", () => {
    expect(rupeesToPaise(199)).toBe(19900);
    expect(rupeesToPaise("499.50")).toBe(49950);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(-50)).toBe(0);
  });
});

describe("Privacy & Visibility Controls", () => {
  const dummySubs: Subscription[] = [
    {
      id: "sub-1",
      household_id: "h-1",
      service_name: "Netflix Premium",
      category: "ott",
      billing_cycle: "monthly",
      amount_paise: 64900,
      payer_id: "user-rahul",
      user_ids: ["user-rahul", "user-priya"],
      is_active: true,
      visibility: "full_details",
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "sub-2",
      household_id: "h-1",
      service_name: "Private Counseling / Service",
      category: "utilities",
      billing_cycle: "monthly",
      amount_paise: 150000,
      payer_id: "user-rahul",
      user_ids: ["user-rahul"],
      is_active: true,
      visibility: "hidden", // Completely private
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "sub-3",
      household_id: "h-1",
      service_name: "Work Tool",
      category: "ai",
      billing_cycle: "monthly",
      amount_paise: 200000,
      payer_id: "user-rahul",
      user_ids: ["user-rahul"],
      is_active: true,
      visibility: "totals_only", // Aggregated only
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "sub-4",
      household_id: "h-1",
      service_name: "Lifetime App License",
      category: "gaming",
      billing_cycle: "one_time",
      amount_paise: 299900,
      payer_id: "user-priya",
      user_ids: ["user-priya"],
      is_active: true,
      visibility: "full_details",
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it("allows the owner (Rahul) to see all his subscriptions including hidden ones", () => {
    const summary = calculateHouseholdSummary(dummySubs, "user-rahul");
    // Rahul sees sub-1 (64900), sub-2 (150000), sub-3 (200000) = 414900 recurring monthly paise
    expect(summary.monthlyRecurringPaise).toBe(414900);
    expect(summary.activeCount).toBe(4);
  });

  it("protects hidden subscriptions from leaking to another member (Priya)", () => {
    const summary = calculateHouseholdSummary(dummySubs, "user-priya");
    // Priya does NOT see sub-2 (hidden). She sees sub-1 (64900) + sub-3 (200000) = 264900 recurring paise
    expect(summary.monthlyRecurringPaise).toBe(264900);
    // Hidden count indicator is incremented so the app can honestly state spending may be incomplete
    expect(summary.hiddenCountForOthers).toBe(1);
    // One-time payment (sub-4) is captured in oneTimeSpendPaise, not recurring monthly
    expect(summary.oneTimeSpendPaise).toBe(299900);
  });

  it("shows a family-wide aggregate without including hidden subscriptions", () => {
    const summary = calculateHouseholdSummary(dummySubs);

    expect(summary.monthlyRecurringPaise).toBe(264900);
    expect(summary.annualizedRecurringPaise).toBe(3178800);
    expect(summary.oneTimeSpendPaise).toBe(299900);
    expect(summary.activeCount).toBe(3);
    expect(summary.hiddenCountForOthers).toBe(1);
  });

  it("redacts details for totals_only subscriptions when viewed by non-payer", () => {
    const visibleToPriya = getVisibleSubscriptions(dummySubs, "user-priya");
    // sub-2 is hidden, so visible list should have 3 items (sub-1, sub-3, sub-4)
    expect(visibleToPriya.length).toBe(3);

    const sub3Entry = visibleToPriya.find((v) => v.subscription.id === "sub-3");
    expect(sub3Entry?.isRedacted).toBe(true);
    expect(sub3Entry?.subscription.service_name).toBe("Private Recurring Expense");
  });

  it("redacts totals-only details in a family-wide directory view", () => {
    const visibleToFamily = getVisibleSubscriptions(dummySubs);
    const totalsOnlyEntry = visibleToFamily.find(
      (entry) => entry.subscription.id === "sub-3"
    );

    expect(visibleToFamily).toHaveLength(3);
    expect(totalsOnlyEntry?.isRedacted).toBe(true);
    expect(totalsOnlyEntry?.subscription.service_name).toBe(
      "Private Recurring Expense"
    );
  });
});

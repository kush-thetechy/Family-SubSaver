import {
  Subscription,
  SavingsRecommendation,
  RecommendationState,
} from "@/types";
import { calculateMonthlyPaise } from "./calculations";
import { INDIAN_SUBSCRIPTION_CATALOG } from "./catalog";

/**
 * Analyzes active household subscriptions to find legitimate savings opportunities,
 * duplicate services, and category overlaps.
 * Strictly adheres to the 3 states:
 * - confirmed_estimate: checked eligibility, capacity, positive savings
 * - potential_saving: plausible option, requires family verification (e.g. same address)
 * - compare_only: overlap exists, feature/need equivalence unconfirmed
 */
export function generateSavingsRecommendations(
  subscriptions: Subscription[],
  viewerId?: string
): SavingsRecommendation[] {
  const recommendations: SavingsRecommendation[] = [];
  const activeSubs = subscriptions.filter((s) => s.is_active);

  // Group subscriptions by normalized service name
  const byService: Record<string, Subscription[]> = {};
  const byCategory: Record<string, Subscription[]> = {};

  for (const sub of activeSubs) {
    // If viewer is specified, don't include hidden subscriptions of others
    // Totals-only rows of others only contribute to totals; their service is not shared,
    // so they must not feed named recommendations.
    if (
      viewerId &&
      sub.payer_id !== viewerId &&
      (sub.visibility === "hidden" || sub.visibility === "totals_only")
    ) {
      continue;
    }

    const normService = sub.service_name.trim().toLowerCase();
    if (!byService[normService]) byService[normService] = [];
    byService[normService].push(sub);

    if (!byCategory[sub.category]) byCategory[sub.category] = [];
    byCategory[sub.category].push(sub);
  }

  const processedSubIds = new Set<string>();

  // 1. Direct Duplicates: Multiple subscriptions to the EXACT same service
  for (const [serviceName, subs] of Object.entries(byService)) {
    if (subs.length > 1) {
      // Mark as processed
      subs.forEach((s) => processedSubIds.add(s.id));

      const totalCurrentSpendPaise = subs.reduce((sum, s) => {
        return (
          sum +
          calculateMonthlyPaise(s.amount_paise, s.billing_cycle, s.validity_days)
        );
      }, 0);

      // Check if catalog has a known family/shared plan
      const catalogEntry = INDIAN_SUBSCRIPTION_CATALOG.find(
        (c) =>
          c.name.toLowerCase() === serviceName ||
          serviceName.includes(c.id) ||
          c.id.includes(serviceName)
      );

      // A shared plan only counts if it covers every duplicate account.
      // Pick the cheapest such plan, never a plan with a lower seat limit.
      const familyPlan = catalogEntry?.plans
        .filter(
          (p) =>
            (p.user_limit ?? 0) >= subs.length &&
            (p.user_limit ?? 0) > 1
        )
        .sort(
          (x, y) =>
            calculateMonthlyPaise(x.amount_paise, x.billing_cycle) -
            calculateMonthlyPaise(y.amount_paise, y.billing_cycle)
        )[0];

      if (familyPlan && catalogEntry) {
        const familyMonthlyPaise = calculateMonthlyPaise(
          familyPlan.amount_paise,
          familyPlan.billing_cycle
        );
        const diffPaise = totalCurrentSpendPaise - familyMonthlyPaise;

        if (diffPaise > 0) {
          recommendations.push({
            id: `rec-family-${catalogEntry.id}`,
            title: `Consolidate ${subs.length} ${catalogEntry.name} subscriptions into a ${familyPlan.name} Plan`,
            category: subs[0].category,
            state: "potential_saving",
            potential_monthly_savings_paise: diffPaise,
            current_monthly_spend_paise: totalCurrentSpendPaise,
            proposed_monthly_spend_paise: familyMonthlyPaise,
            evidence: [
              `Household has ${subs.length} separate ${catalogEntry.name} accounts paying a combined ₹${(totalCurrentSpendPaise / 100).toFixed(0)}/month.`,
              `Official ${catalogEntry.name} ${familyPlan.name} is priced at ₹${(familyMonthlyPaise / 100).toFixed(0)}/month for up to ${familyPlan.user_limit} accounts.`,
            ],
            assumptions: [
              "All members must meet the provider's residency policy (residing at the same physical household).",
              "Each member is willing to transition to a shared household billing account.",
            ],
            uncertainties: [
              catalogEntry.sharing_policy_notes,
              "Does not include potential cancellation penalties or unrefunded prepaid balances.",
            ],
            source_urls: [
              { label: `${catalogEntry.name} Official Plans`, url: catalogEntry.official_website },
              { label: "Terms of Service", url: catalogEntry.terms_url },
            ],
            verification_date: catalogEntry.verified_on,
            involved_subscription_ids: subs.map((s) => s.id),
            suggested_action: `Review with family members whether everyone lives at the same address, then consider upgrading one account to ${familyPlan.name} and canceling the other.`,
            disclaimer:
              "This app does not cancel subscriptions or guarantee provider eligibility. Verify terms directly on the provider's website before making changes.",
          });
        } else {
          // If family plan is actually more expensive or equal, do NOT recommend as positive savings
          recommendations.push({
            id: `rec-duplicate-review-${serviceName}`,
            title: `Review duplicate ${subs[0].service_name} records`,
            category: subs[0].category,
            state: "compare_only",
            potential_monthly_savings_paise: 0,
            current_monthly_spend_paise: totalCurrentSpendPaise,
            evidence: [
              `Found ${subs.length} active records for "${subs[0].service_name}".`,
              "Existing individual rates are already lower than or equal to a multi-user plan, or accounts are for distinct non-shareable use.",
            ],
            assumptions: [
              "One may be an accidental duplicate charge or an unrecorded cancellation.",
            ],
            uncertainties: [
              "Whether both accounts are actively utilized by different members.",
            ],
            involved_subscription_ids: subs.map((s) => s.id),
            suggested_action: "Verify bank statements to ensure you are not being double-billed by mistake.",
            disclaimer: "Review only. No automated cancellation is performed.",
          });
        }
      } else {
        // Unknown or no family plan in catalog -> Review alert only! Never invent savings!
        recommendations.push({
          id: `rec-duplicate-unknown-${serviceName}`,
          title: `Review duplicate ${subs[0].service_name} records`,
          category: subs[0].category,
          state: "compare_only",
          potential_monthly_savings_paise: 0,
          current_monthly_spend_paise: totalCurrentSpendPaise,
          evidence: [
            `Found ${subs.length} separate subscriptions for "${subs[0].service_name}".`,
            "No verified family plan exists in catalog or provider restricts multi-user sharing.",
          ],
          assumptions: ["Verify if one account is obsolete or if both are strictly necessary."],
          uncertainties: ["Provider terms regarding simultaneous usage or account transfer."],
          involved_subscription_ids: subs.map((s) => s.id),
          suggested_action: "Check if one member can cancel if usage is infrequent.",
          disclaimer: "No official family plan price verified. Conservative review alert.",
        });
      }
    }
  }

  // 2. Category Overlaps (e.g. Multiple AI productivity tools, or Multiple Music services)
  for (const [category, subs] of Object.entries(byCategory)) {
    // Only inspect subs not already in a direct duplicate recommendation
    const unusedSubs = subs.filter((s) => !processedSubIds.has(s.id));
    if (unusedSubs.length > 1) {
      if (category === "ai") {
        // e.g. ChatGPT Plus and Claude Pro
        const totalAiSpend = unusedSubs.reduce(
          (sum, s) =>
            sum +
            calculateMonthlyPaise(
              s.amount_paise,
              s.billing_cycle,
              s.validity_days
            ),
          0
        );
        recommendations.push({
          id: "rec-ai-overlap",
          title: "Multiple AI subscriptions detected in household",
          category: "ai",
          state: "compare_only",
          potential_monthly_savings_paise: 0,
          current_monthly_spend_paise: totalAiSpend,
          evidence: [
            `Household is subscribed to ${unusedSubs.map((s) => s.service_name).join(" and ")}, spending ~₹${(totalAiSpend / 100).toFixed(0)}/month.`,
          ],
          assumptions: [
            "AI tools have differing models, context lengths, and coding/writing capabilities; they are not strictly identical replacements.",
          ],
          uncertainties: [
            "Personal workflows may require distinct tools for different family members.",
          ],
          involved_subscription_ids: unusedSubs.map((s) => s.id),
          suggested_action:
            "Review whether both tools are regularly utilized, or if a single versatile model suffices for the family's needs.",
          disclaimer:
            "Different AI providers offer distinct features. Compare only; no definitive savings claimed.",
        });
      } else if (category === "music") {
        const totalMusicSpend = unusedSubs.reduce(
          (sum, s) =>
            sum +
            calculateMonthlyPaise(
              s.amount_paise,
              s.billing_cycle,
              s.validity_days
            ),
          0
        );
        recommendations.push({
          id: "rec-music-overlap",
          title: "Multiple streaming music platforms in use",
          category: "music",
          state: "compare_only",
          potential_monthly_savings_paise: 0,
          current_monthly_spend_paise: totalMusicSpend,
          evidence: [
            `Household uses different music services: ${unusedSubs.map((s) => s.service_name).join(", ")}.`,
          ],
          assumptions: [
            "Members may have personalized playlists, algorithmic preferences, or device ecosystems (e.g., Apple vs Android).",
          ],
          uncertainties: [
            "Loss of curated libraries and personal history if switching platforms.",
          ],
          involved_subscription_ids: unusedSubs.map((s) => s.id),
          suggested_action:
            "Discuss if members would be open to standardizing on one family plan (e.g. YouTube Premium Family or Spotify Family) to reduce costs.",
          disclaimer:
            "Music libraries and recommendations vary. Verify feature equivalence before changing.",
        });
      }
    }
  }

  // 3. Telecom Bundle Overlaps (e.g. Jio or Airtel family plan with bundled OTTs)
  const telecomSub = activeSubs.find(
    (s) =>
      s.category === "telecom" &&
      (s.service_name.toLowerCase().includes("airtel") ||
        s.service_name.toLowerCase().includes("jio"))
  );
  if (telecomSub) {
    const ottSubs = activeSubs.filter(
      (s) =>
        s.category === "ott" &&
        (s.service_name.toLowerCase().includes("hotstar") ||
          s.service_name.toLowerCase().includes("prime"))
    );

    if (ottSubs.length > 0) {
      recommendations.push({
        id: "rec-telecom-bundle-check",
        title: `Check for OTT benefits bundled with ${telecomSub.service_name}`,
        category: "telecom",
        state: "compare_only",
        potential_monthly_savings_paise: 0,
        current_monthly_spend_paise: calculateMonthlyPaise(
          telecomSub.amount_paise,
          telecomSub.billing_cycle
        ),
        evidence: [
          `Household has ${telecomSub.service_name} alongside separate OTT subscriptions (${ottSubs.map((s) => s.service_name).join(", ")}).`,
          "Many Airtel Postpaid Family and JioFiber plans include complimentary subscriptions to Disney+ Hotstar or Amazon Prime Video.",
        ],
        assumptions: [
          "The specific telecom tier may include complimentary OTT benefits that haven't been claimed in the telecom app (Airtel Thanks / MyJio).",
        ],
        uncertainties: [
          "Telecom bundled subscriptions frequently change terms, resolution (mobile vs TV), and require active mobile number claiming.",
        ],
        involved_subscription_ids: [telecomSub.id, ...ottSubs.map((s) => s.id)],
        suggested_action: `Open the ${telecomSub.service_name} app to check if your current plan includes free OTT subscriptions. If included, avoid renewing the standalone subscription.`,
        disclaimer:
          "Check telco plan terms. Do not cancel existing subscriptions until telecom benefits are activated and confirmed working.",
      });
    }
  }

  return recommendations;
}


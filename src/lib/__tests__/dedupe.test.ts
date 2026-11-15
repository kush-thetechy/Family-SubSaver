import { describe, expect, it } from "vitest";
import { findExistingCopy, findExtraCopies, isSameService, isSameSubscription } from "@/lib/dedupe";
import { consolidateEvidenceToCandidates } from "@/lib/connectors/gmail-service";
import type { Subscription } from "@/types";

const ME = "me";

function sub(over: Partial<Subscription>): Subscription {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    household_id: "h",
    service_name: "Todoist",
    amount_paise: 33000,
    billing_cycle: "monthly",
    category: "productivity",
    payer_id: ME,
    user_ids: [ME],
    is_active: true,
    visibility: "full_details",
    source: "import",
    created_at: "2026-11-15T17:26:00Z",
    updated_at: "",
    ...over,
  } as Subscription;
}

describe("duplicate detection", () => {
  it("matches service names regardless of case or punctuation", () => {
    expect(isSameService("Claude Pro Subscription", "claude pro subscription")).toBe(true);
    expect(isSameService("SAC: 998434", "SAC 998434")).toBe(true);
    expect(isSameService("Todoist", "Truecaller")).toBe(false);
  });

  it("treats a different price or cycle as possibly a separate plan", () => {
    const a = { service_name: "Todoist", amount_paise: 33000, billing_cycle: "monthly" as const };
    expect(isSameSubscription(a, { ...a })).toBe(true);
    expect(isSameSubscription(a, { ...a, amount_paise: 39900 })).toBe(false);
    expect(isSameSubscription(a, { ...a, billing_cycle: "annual" })).toBe(false);
  });

  it("finds an existing copy only among the person's own active entries", () => {
    const existing = [
      sub({ id: "inactive", is_active: false }),
      sub({ id: "theirs", payer_id: "someone-else" }),
    ];
    const cand = { service_name: "Todoist", amount_paise: 33000, billing_cycle: "monthly" as const };
    expect(findExistingCopy(cand, existing, ME)).toBeUndefined();
    existing.push(sub({ id: "mine" }));
    expect(findExistingCopy(cand, existing, ME)?.id).toBe("mine");
  });

  it("keeps the first-saved entry of each identical group and returns the rest", () => {
    const subs = [
      sub({ id: "claude-2", service_name: "Claude Pro Subscription", amount_paise: 199900, created_at: "2026-11-15T18:17:55Z" }),
      sub({ id: "claude-1", service_name: "Claude Pro Subscription", amount_paise: 199900, created_at: "2026-11-15T17:26:43Z" }),
      sub({ id: "todoist-1", created_at: "2026-11-15T17:26:42Z" }),
      sub({ id: "todoist-2", created_at: "2026-11-15T18:17:53Z" }),
      sub({ id: "todoist-yearly", billing_cycle: "annual", amount_paise: 300000 }),
      sub({ id: "jio", service_name: "Jio", amount_paise: 41182 }),
      sub({ id: "family-copy", payer_id: "someone-else" }),
    ];
    expect(findExtraCopies(subs, ME).map((s) => s.id).sort()).toEqual(["claude-2", "todoist-2"]);
  });

  it("flags a scan result as already tracked when the saved name was stored unnormalized", () => {
    const existing = [sub({ id: "c", service_name: "Claude Pro Subscription", amount_paise: 199900 })];
    const [cand] = consolidateEvidenceToCandidates(
      [
        {
          id: "e1",
          source: "gmail",
          evidence_type: "store_receipt",
          date: "2026-11-03",
          amount_rupees: 1999,
          currency: "INR",
          billing_channel: "Google Play",
          merchant_raw: "Claude Pro Subscription",
          plan_name: "Claude by Anthropic",
          frequency_raw: "monthly",
          summary: "Google Play receipt for Claude Pro Subscription",
          message_id: "m1",
        },
      ],
      existing
    );
    expect(cand).toBeDefined();
    expect(cand.is_possible_duplicate).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  consolidateEvidenceToCandidates,
  parseGeneralGmailMessage,
  type GmailMessage,
} from "../connectors/gmail-service";
import type { DiscoveryEvidence } from "@/types";

// All fixtures are synthetic. Amounts and dates are invented; only the shapes
// of the failure cases come from subscription_app_agent_handoff.md.
const ASOF = new Date("2026-10-24T00:00:00+05:30");

let n = 0;
function ev(p: Partial<DiscoveryEvidence> & Pick<DiscoveryEvidence, "evidence_type">): DiscoveryEvidence {
  n += 1;
  return { id: `e${n}`, source: "gmail", currency: "INR", summary: `${p.merchant_raw ?? "x"} ${p.evidence_type}`, ...p };
}
const consolidate = (list: DiscoveryEvidence[]) => consolidateEvidenceToCandidates(list, [], ASOF);
const find = (cs: ReturnType<typeof consolidate>, name: string) => cs.filter((c) => c.service_name === name);

function msg(subject: string, body: string, from = "billing@example.com", date = "Thu, 15 Oct 2026 10:00:00 +0530"): GmailMessage {
  return {
    id: `m${++n}`,
    snippet: "",
    internalDate: String(Date.parse(date)),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: subject },
        { name: "From", value: from },
        { name: "Date", value: date },
      ],
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}

describe("handoff acceptance cases (synthetic fixtures)", () => {
  it("1. Perplexity welcome + upgrade + UPI debit make one candidate; interval stays unknown", () => {
    const cs = consolidate([
      ev({ evidence_type: "service_event", merchant_raw: "Perplexity", date: "2026-10-06" }),
      ev({ evidence_type: "service_event", merchant_raw: "Perplexity", date: "2026-10-06", plan_name: "Pro" }),
      ev({ evidence_type: "transaction_alert", merchant_raw: "Perplexity AI Inc", amount_rupees: 1100, date: "2026-10-06", billing_channel: "UPI" }),
    ]);
    const p = find(cs, "Perplexity");
    expect(p).toHaveLength(1);
    expect(p[0].billing_cycle).toBe("unknown");
    expect(p[0].payment_count).toBe(1);
    expect(p[0].needs_review_reasons.join(" ")).toMatch(/cycle is unknown/i);
  });

  it("2. A Play receipt and the matching bank debit are one payment", () => {
    const cs = consolidate([
      ev({ evidence_type: "store_receipt", merchant_raw: "Truecaller", amount_rupees: 75, date: "2026-10-03", billing_channel: "Google Play", frequency_raw: "monthly", order_id: "GPA.1" }),
      ev({ evidence_type: "transaction_alert", merchant_raw: "Google Play*Truecaller", amount_rupees: 75, date: "2026-10-03", billing_channel: "Google Play" }),
    ]);
    const t = find(cs, "Truecaller");
    expect(t).toHaveLength(1);
    expect(t[0].payment_count).toBe(1);
  });

  it("3. Apple failures plus Play successes are not assumed to be two active plans", () => {
    const cs = consolidate([
      ev({ evidence_type: "payment_failure", merchant_raw: "Proton VPN", date: "2026-09-10", billing_channel: "Apple" }),
      ev({ evidence_type: "payment_failure", merchant_raw: "Proton VPN", date: "2026-09-17", billing_channel: "Apple" }),
      ev({ evidence_type: "store_receipt", merchant_raw: "Proton VPN", amount_rupees: 400, date: "2026-10-12", billing_channel: "Google Play", frequency_raw: "monthly" }),
    ]);
    const p = find(cs, "Proton VPN");
    const active = p.filter((c) => c.status === "likely_active");
    expect(active).toHaveLength(1);
    expect(active[0].billing_channel).toMatch(/play/i);
    expect(p.every((c) => c.needs_review_reasons.join(" ").match(/another billing channel|confirm whether/i))).toBe(true);
  });

  it("4. A revoked mandate changes mandate state, not access", () => {
    const cs = consolidate([
      ev({ evidence_type: "store_receipt", merchant_raw: "Lovable", amount_rupees: 2000, date: "2026-10-10", frequency_raw: "monthly", billing_channel: "Direct" }),
      ev({ evidence_type: "mandate_registration", merchant_raw: "Lovable", amount_rupees: 2000, date: "2026-10-10", mandate_id: "M1", billing_channel: "Direct" }),
      ev({ evidence_type: "mandate_revocation", merchant_raw: "Lovable", date: "2026-10-15", mandate_id: "M1", billing_channel: "Direct" }),
    ]);
    const c = find(cs, "Lovable");
    expect(c).toHaveLength(1);
    expect(c[0].mandate_state).toBe("revoked");
    expect(c[0].access_state).toBe("active");
    expect(c[0].renewal_state).not.toBe("cancelled");
  });

  it("5. Cancellation after a renewal ends renewal, keeps access to period end, unless reactivated", () => {
    const base = [
      ev({ evidence_type: "merchant_invoice", merchant_raw: "Claude", amount_rupees: 1950, date: "2026-10-12", frequency_raw: "monthly" }),
      ev({ evidence_type: "cancellation_notice", merchant_raw: "Claude", date: "2026-10-14" }),
    ];
    const c = find(consolidate(base), "Claude")[0];
    expect(c.renewal_state).toBe("cancelled");
    expect(c.access_state).toBe("active_until_period_end");
    expect(c.access_end_date).toBe("2026-11-12");
    const reactivated = find(
      consolidate([...base, ev({ evidence_type: "merchant_invoice", merchant_raw: "Claude", amount_rupees: 1950, date: "2026-10-20", frequency_raw: "monthly" })]),
      "Claude",
    )[0];
    expect(reactivated.renewal_state).toBe("renewing");
  });

  it("6. A later successful payment supersedes an earlier failure; a later failure does not", () => {
    const recovered = find(consolidate([
      ev({ evidence_type: "payment_failure", merchant_raw: "Truecaller", date: "2026-10-01" }),
      ev({ evidence_type: "store_receipt", merchant_raw: "Truecaller", amount_rupees: 75, date: "2026-10-03", frequency_raw: "monthly", billing_channel: "Google Play" }),
    ]), "Truecaller")[0];
    expect(recovered.status).toBe("likely_active");
    expect(recovered.renewal_state).not.toBe("payment_failed");
    const failedAfter = find(consolidate([
      ev({ evidence_type: "store_receipt", merchant_raw: "Truecaller", amount_rupees: 75, date: "2026-10-03", frequency_raw: "monthly", billing_channel: "Google Play" }),
      ev({ evidence_type: "payment_failure", merchant_raw: "Truecaller", date: "2026-10-23", billing_channel: "Google Play" }),
    ]), "Truecaller")[0];
    expect(failedAfter.renewal_state).toBe("payment_failed");
  });

  it("7. A 3-month renewal from April does not prove October activity", () => {
    const c = find(consolidate([
      ev({ evidence_type: "service_event", merchant_raw: "Zomato Gold", date: "2026-04-10", frequency_raw: "quarterly", summary: "Zomato Gold renewed for 3 months" }),
    ]), "Zomato Gold")[0];
    expect(c.status).not.toBe("likely_active");
    expect(c.access_state).toBe("ended");
  });

  it("8. A Google AI Pro storage notice does not create a second storage subscription", () => {
    const m = parseGeneralGmailMessage(
      msg("Your Google AI Pro plan now has more storage", "Your Google AI Pro plan now includes 5 TB of storage.", "Google One <no-reply@google.com>"),
    );
    const cs = consolidate([
      ev({ evidence_type: "store_receipt", merchant_raw: "Google AI Pro", amount_rupees: 1950, date: "2026-10-01", frequency_raw: "monthly", billing_channel: "Google Play" }),
      ...(m ? [m] : []),
    ]);
    expect(cs.filter((c) => /google/i.test(c.service_name))).toHaveLength(1);
  });

  it("9. Card-bill autopay is excluded", () => {
    const m = parseGeneralGmailMessage(
      msg("Credit card bill autopay processed", "Autopay for your credit card bill: total amount due ₹12,400 was debited from your account on 15 Oct.", "alerts@bank.example"),
    );
    expect(m).toBeNull();
  });

  it("10. The same invoice forwarded by a family member does not duplicate spend", () => {
    const a = ev({ evidence_type: "merchant_invoice", merchant_raw: "Notion", amount_rupees: 800, date: "2026-10-05", order_id: "INV-77", frequency_raw: "monthly" });
    const b = ev({ evidence_type: "merchant_invoice", merchant_raw: "Notion", amount_rupees: 800, date: "2026-10-06", order_id: "INV-77", frequency_raw: "monthly", message_id: "fwd" });
    const c = find(consolidate([a, b]), "Notion");
    expect(c).toHaveLength(1);
    expect(c[0].payment_count).toBe(1);
    expect(c[0].evidence).toHaveLength(2);
  });

  it("11. Two accounts for one merchant are not merged by name alone", () => {
    const cs = consolidate([
      ev({ evidence_type: "merchant_invoice", merchant_raw: "Notion", amount_rupees: 800, date: "2026-10-05", account_ref: "personal@example.com", frequency_raw: "monthly" }),
      ev({ evidence_type: "merchant_invoice", merchant_raw: "Notion", amount_rupees: 800, date: "2026-10-05", account_ref: "work@example.com", frequency_raw: "monthly" }),
    ]);
    expect(find(cs, "Notion")).toHaveLength(2);
  });

  it("13. Unknown price stays unknown and is flagged, never treated as zero", () => {
    const c = find(consolidate([ev({ evidence_type: "service_event", merchant_raw: "Speechify", date: "2026-09-20" })]), "Speechify")[0];
    expect(c.amount_rupees).toBeUndefined();
    expect(c.price_known).toBe(false);
    expect(c.needs_review_reasons.join(" ")).toMatch(/price is unknown/i);
  });

  it("14. Refunds and credit notes do not create an active subscription", () => {
    const refundOnly = consolidate([ev({ evidence_type: "refund", merchant_raw: "Speechify", amount_rupees: 500, date: "2026-10-02" })]);
    expect(refundOnly.filter((c) => c.status === "likely_active")).toHaveLength(0);
    const m = parseGeneralGmailMessage(msg("Your Speechify refund", "We have refunded ₹500 to your original payment method for your Speechify subscription."));
    expect(m === null || m.evidence_type === "refund").toBe(true);
  });

  it("parses a mandate revocation email as mandate-only evidence", () => {
    const m = parseGeneralGmailMessage(
      msg("E-Mandate revoked", "Your e-mandate for Lovable has been revoked. Mandate ID: M-100", "alerts@bank.example"),
    );
    expect(m?.evidence_type).toBe("mandate_revocation");
    expect(m?.merchant_raw).toBe("Lovable");
    expect(m?.mandate_id).toBe("M-100");
  });

  it("parses a refund email as refund evidence", () => {
    const m = parseGeneralGmailMessage(msg("Your Speechify refund", "We have refunded ₹500 to your original payment method for your Speechify subscription."));
    expect(m?.evidence_type).toBe("refund");
  });
});

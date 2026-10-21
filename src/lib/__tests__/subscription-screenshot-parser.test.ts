import { describe, expect, it } from "vitest";
import { parseSubscriptionScreenshotText } from "../connectors/subscription-screenshot-parser";

describe("subscription screenshot parser", () => {
  it("extracts all subscription rows from a store subscriptions screenshot", () => {
    const text = `Subscriptions
Active
Proton VPN: Secure & Fast VPN
VPN Plus
Next payment: ₹599.00 on 22 Oct 2026
Your plan includes
20,000+ servers in 140+ countries
Truecaller: Phone Call Blocker
Premium Monthly
Next payment: ₹99.00 on 3 Nov 2026
Your plan includes
Auto block Spam calls
Todoist: To Do List & Calendar
Todoist Pro - Monthly
Next payment: ₹330.00 on 10 Nov 2026
Speechify – Text to Speech
Speechify Premium Quarterly
Next payment: ₹1,149.00 on 20 Dec 2026
Expired`;

    expect(parseSubscriptionScreenshotText(text)).toEqual([
      {
        service_name: "Proton VPN",
        plan_name: "VPN Plus",
        amount_rupees: 599,
        billing_cycle: "unknown",
        category: "other",
        renewal_date: "2026-10-22",
        confidence: 0.82,
      },
      {
        service_name: "Truecaller",
        plan_name: "Premium Monthly",
        amount_rupees: 99,
        billing_cycle: "monthly",
        category: "other",
        renewal_date: "2026-11-03",
        confidence: 0.82,
      },
      {
        service_name: "Todoist",
        plan_name: "Todoist Pro - Monthly",
        amount_rupees: 330,
        billing_cycle: "monthly",
        category: "other",
        renewal_date: "2026-11-10",
        confidence: 0.82,
      },
      {
        service_name: "Speechify",
        plan_name: "Speechify Premium Quarterly",
        amount_rupees: 1149,
        billing_cycle: "quarterly",
        category: "other",
        renewal_date: "2026-12-20",
        confidence: 0.82,
      },
    ]);
  });

  it("keeps a missing billing cycle unknown instead of assuming monthly", () => {
    const results = parseSubscriptionScreenshotText(
      "Netflix Premium\nNext payment: ₹649.00 on 15/11/2026"
    );

    expect(results).toMatchObject([
      {
        service_name: "Netflix",
        billing_cycle: "unknown",
      },
    ]);
  });

  it("does not create entries from non-payment amounts or duplicate OCR rows", () => {
    const text = `Netflix Premium
Next payment: ₹649.00 on 15/11/2026
Netflix Premium
Next payment: ₹649.00 on 15/11/2026
Your plan includes 4 screens`;

    const results = parseSubscriptionScreenshotText(text);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      service_name: "Netflix",
      amount_rupees: 649,
      renewal_date: "2026-11-15",
    });
  });

  it("handles OCR that merges service rows and drops the rupee symbol", () => {
    const text =
      "Subscriptions Active Proton VPN: Secure & Fast VPN VPN Plus Next payment 599.00 on 22 Oct 2026 Your plan includes Up to 10 devices Truecaller: Phone Call Blocker Premium Monthly Next payment 99.00 on 3 Nov 2026";

    expect(parseSubscriptionScreenshotText(text)).toMatchObject([
      {
        service_name: "Proton VPN",
        amount_rupees: 599,
        renewal_date: "2026-10-22",
      },
      {
        service_name: "Truecaller",
        amount_rupees: 99,
        renewal_date: "2026-11-03",
      },
    ]);
  });
});

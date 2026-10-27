import { describe, it, expect } from "vitest";
import { parseSubscriptionScreenshotText } from "@/lib/connectors/subscription-screenshot-parser";
describe("date is not a price", () => {
  it("keeps the rupee amount when the date follows on the next line", () => {
    const r = parseSubscriptionScreenshotText("Spotify Premium Individual\nRs 119 per month - next billing 20 Nov 2026");
    expect(r.every((x) => x.amount_rupees !== 20)).toBe(true);
  });
});

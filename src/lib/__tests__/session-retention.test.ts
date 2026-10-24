import { describe, expect, it } from "vitest";
import { checkoutSessionCutoff, CHECKOUT_SESSION_RETENTION_DAYS } from "../session-retention";

describe("checkout session retention", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  const cutoff = new Date(checkoutSessionCutoff(now)).getTime();
  const day = 24 * 60 * 60 * 1000;
  it("keeps sessions long enough for retried and replayed events", () => {
    expect(CHECKOUT_SESSION_RETENTION_DAYS).toBeGreaterThanOrEqual(15);
    for (const age of [0, 1, 3, 14]) expect(now.getTime() - age * day > cutoff).toBe(true);
  });
  it("expires sessions past retention", () => {
    expect(now.getTime() - 31 * day < cutoff).toBe(true);
  });
});

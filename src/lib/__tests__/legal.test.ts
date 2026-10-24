import { describe, expect, it } from "vitest";
import { getLegalConfig } from "../legal";
describe("getLegalConfig", () => {
  it("is off without flag, operator or contact", () => {
    expect(getLegalConfig({})).toBeNull();
    expect(getLegalConfig({ NEXT_PUBLIC_LEGAL_PAGES_ENABLED: "true", NEXT_PUBLIC_OPERATOR_NAME: "A" })).toBeNull();
  });
  it("needs an explicit refund window", () => {
    const base = { NEXT_PUBLIC_LEGAL_PAGES_ENABLED: "true", NEXT_PUBLIC_OPERATOR_NAME: "A", NEXT_PUBLIC_CONTACT_EMAIL: "a@b.c" };
    expect(getLegalConfig(base)!.refundDays).toBeNull();
    expect(getLegalConfig({ ...base, NEXT_PUBLIC_REFUND_WINDOW_DAYS: "7" })!.refundDays).toBe(7);
    expect(getLegalConfig({ ...base, NEXT_PUBLIC_REFUND_WINDOW_DAYS: "0" })!.refundDays).toBe(0);
  });
});

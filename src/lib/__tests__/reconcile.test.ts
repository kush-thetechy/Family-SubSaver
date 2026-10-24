import { describe, expect, it } from "vitest";
import { isBillingAdmin, reconcileProblem } from "../reconcile";

const row = { provider_payment_id: "pay_1", claimed_user_id: "u1", checkout_session_id: "cks_1", mode: "live" };
const good = { payment_id: "pay_1", status: "succeeded", total_amount: 6000, currency: "INR", checkout_session_id: "cks_1", metadata: { user_id: "u1" } };

describe("reconcileProblem", () => {
  it("accepts a fully matching succeeded payment", () => expect(reconcileProblem(row, good)).toBeNull());
  it("rejects each mismatch", () => {
    expect(reconcileProblem(row, { ...good, payment_id: "pay_2" })).toBeTruthy();
    expect(reconcileProblem(row, { ...good, status: "failed" })).toBeTruthy();
    expect(reconcileProblem(row, { ...good, total_amount: 5000 })).toBeTruthy();
    expect(reconcileProblem(row, { ...good, currency: "USD" })).toBeTruthy();
    expect(reconcileProblem(row, { ...good, metadata: { user_id: "u2" } })).toBeTruthy();
    expect(reconcileProblem(row, { ...good, checkout_session_id: "cks_2" })).toBeTruthy();
    expect(reconcileProblem({ ...row, claimed_user_id: null }, good)).toBeTruthy();
  });
});

describe("isBillingAdmin", () => {
  it("fails closed", () => {
    expect(isBillingAdmin("u1", {})).toBe(false);
    expect(isBillingAdmin("u1", { BILLING_ADMIN_USER_IDS: "u2, u1" })).toBe(true);
    expect(isBillingAdmin("u3", { BILLING_ADMIN_USER_IDS: "u2,u1" })).toBe(false);
  });
});

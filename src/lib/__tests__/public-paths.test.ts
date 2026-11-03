import { describe, expect, it } from "vitest";
import { isPublicPath, PUBLIC_LEGAL_PATHS } from "../legal";

describe("isPublicPath", () => {
  it("allows the homepage and every legal page signed-out", () => {
    expect(isPublicPath("/")).toBe(true);
    for (const p of PUBLIC_LEGAL_PATHS) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("keeps app surfaces and auth routes private", () => {
    for (const p of [
      "/subscriptions",
      "/savings",
      "/import",
      "/household",
      "/settings",
      "/admin/billing",
      "/login",
      "/auth/callback",
    ]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

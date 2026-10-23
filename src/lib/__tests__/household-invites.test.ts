import { describe, expect, it } from "vitest";
import {
  createInviteToken,
  hashInviteToken,
  normalizeInviteEmail,
  validateInvite,
} from "../household-invites";

const base = { email: "Friend@Example.com ", role: "member" as const, consentAcknowledged: true };

describe("household invites", () => {
  it("normalizes email and accepts a valid invite", () => {
    expect(normalizeInviteEmail(" A@B.com ")).toBe("a@b.com");
    expect(validateInvite(base, "me@example.com")).toEqual({
      ok: true,
      email: "friend@example.com",
      role: "member",
    });
  });

  it("rejects bad email, self-invite, bad role and missing consent", () => {
    expect(validateInvite({ ...base, email: "nope" }, "me@example.com").ok).toBe(false);
    expect(validateInvite({ ...base, email: "ME@example.com" }, "me@example.com").ok).toBe(false);
    expect(validateInvite({ ...base, role: "owner" as never }, "me@example.com").ok).toBe(false);
    expect(validateInvite({ ...base, consentAcknowledged: false }, "me@example.com").ok).toBe(false);
  });

  it("creates unguessable tokens whose stored hash matches", () => {
    const a = createInviteToken();
    const b = createInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.tokenHash).toHaveLength(64);
    expect(hashInviteToken(a.token)).toBe(a.tokenHash);
    expect(a.tokenHash).not.toContain(a.token);
  });
});

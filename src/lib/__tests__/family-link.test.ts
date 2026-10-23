import { describe, expect, it } from "vitest";
import { buildInviteUrl, generateInviteToken, parseInviteToken, sha256Hex } from "../family-link";

describe("family-link helpers", () => {
  it("makes 64-hex random tokens", () => {
    const a = generateInviteToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateInviteToken()).not.toBe(a);
  });
  it("hashes like node sha256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("keeps the token in the URL fragment and round-trips", () => {
    const t = generateInviteToken();
    const url = buildInviteUrl("https://x.test", t);
    expect(url).toBe(`https://x.test/join#t=${t}`);
    expect(new URL(url).search).toBe("");
    expect(parseInviteToken(new URL(url).hash)).toBe(t);
    expect(parseInviteToken("#t=zzz")).toBeNull();
  });
});

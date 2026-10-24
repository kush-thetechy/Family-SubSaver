import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStandardWebhook } from "../standard-webhooks";

const keyBytes = Buffer.from("0123456789abcdef0123456789abcdef");
const secret = `whsec_${keyBytes.toString("base64")}`;
const now = 1_800_000_000_000;
const ts = String(now / 1000);
const body = '{"type":"payment.succeeded"}';
const sign = (id: string, t: string, b: string) => `v1,${createHmac("sha256", keyBytes).update(`${id}.${t}.${b}`).digest("base64")}`;

describe("verifyStandardWebhook", () => {
  it("accepts a valid signature, including among several", () => {
    const s = sign("msg_1", ts, body);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp: ts, signature: s, rawBody: body, secret }, now)).toBe(true);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp: ts, signature: `v1,AAAA ${s}`, rawBody: body, secret }, now)).toBe(true);
  });
  it("rejects tampered body, id, secret and missing inputs", () => {
    const s = sign("msg_1", ts, body);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp: ts, signature: s, rawBody: body + " ", secret }, now)).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_2", timestamp: ts, signature: s, rawBody: body, secret }, now)).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp: ts, signature: s, rawBody: body, secret: "whsec_AAAA" }, now)).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp: ts, signature: "", rawBody: body, secret }, now)).toBe(false);
  });
  it("rejects stale or non-numeric timestamps", () => {
    const old = String(now / 1000 - 600);
    expect(verifyStandardWebhook({ id: "m", timestamp: old, signature: sign("m", old, body), rawBody: body, secret }, now)).toBe(false);
    expect(verifyStandardWebhook({ id: "m", timestamp: "x", signature: sign("m", "x", body), rawBody: body, secret }, now)).toBe(false);
  });
});

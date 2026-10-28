import { describe, expect, it } from "vitest";
import { gmailJson } from "../connectors/gmail-response";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("private Gmail JSON responses", () => {
  it.each([200, 400, 401, 403, 429, 500, 503])("sets no-store for status %i", async (status) => {
    const response = gmailJson({ success: status === 200 }, { status });
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: status === 200 });
  });
  it("overrides cacheable headers while preserving unrelated headers", () => {
    const response = gmailJson({}, { headers: { "Cache-Control": "public, max-age=600", "X-Test": "retained" } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Test")).toBe("retained");
  });
  it("preserves session cookies added to the response", () => {
    const response = gmailJson({});
    response.cookies.set("test_session", "synthetic", { httpOnly: true, sameSite: "lax" });
    expect(response.cookies.get("test_session")?.value).toBe("synthetic");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("routes all connector JSON output through the private response helper", () => {
    const root = join(process.cwd(), "src/app/api/connectors/gmail");
    for (const dir of readdirSync(root)) {
      const code = readFileSync(join(root, dir, "route.ts"), "utf8");
      expect(code, dir).not.toContain("NextResponse.json(");
      expect(code, dir).not.toMatch(/console\.error\([^;]*,\s*(error|\w+Error)\)/);
    }
    const batched = readFileSync(join(process.cwd(), "src/lib/connectors/batched-scan-handler.ts"), "utf8");
    expect(batched).not.toContain("NextResponse.json(");
  });
});

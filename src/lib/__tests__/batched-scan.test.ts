import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GMAIL_LANE_MESSAGE_CEILING,
  GMAIL_RUN_MESSAGE_CEILING,
  newGmailBatchState,
  runGmailBatch,
  type GmailBatchState,
} from "../connectors/gmail-batch";
import { buildGmailDateFilter, buildGmailLanes, setGmailRetryDelaysForTests } from "../connectors/gmail-service";
import { openScanCursor, sealScanCursor } from "../connectors/scan-cursor";
import { sanitizeBatchEvidence } from "../connectors/batched-scan-handler";

function json(payload: unknown, status = 200): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    clone() { return json(payload, status); },
    text: async () => JSON.stringify(payload),
    body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
  } as unknown as Response;
}

const laneQueries = buildGmailLanes(buildGmailDateFilter("13m")).map((l) => l.query);

/** Fake Gmail: each lane has `perLane` messages, 100 per page. */
function installGmail(perLane: number, opts: { flaky429?: boolean } = {}) {
  let rateLimitedOnce = false;
  const calls = { list: 0, get: 0, maxParallel: 0 };
  let inFlight = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) {
      calls.list += 1;
      const lane = laneQueries.indexOf(url.searchParams.get("q")!);
      const offset = Number(url.searchParams.get("pageToken") ?? 0);
      const n = Math.max(0, Math.min(100, perLane - offset));
      const next = offset + n < perLane ? String(offset + n) : undefined;
      return json({
        messages: Array.from({ length: n }, (_, i) => ({ id: `L${lane}-M${offset + i}` })),
        ...(next ? { nextPageToken: next } : {}),
      });
    }
    if (opts.flaky429 && !rateLimitedOnce) {
      rateLimitedOnce = true;
      return json({ error: { message: "rate" } }, 429);
    }
    calls.get += 1;
    inFlight += 1;
    calls.maxParallel = Math.max(calls.maxParallel, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    const id = url.pathname.split("/").pop()!;
    const date = new Date().toUTCString();
    return json({
      id,
      internalDate: String(Date.now() - 86_400_000),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Your Netflix subscription receipt" },
          { name: "From", value: "Netflix <info@netflix.com>" },
          { name: "Date", value: date },
        ],
        body: { data: Buffer.from("Netflix subscription renewed. Amount paid ₹649 monthly.").toString("base64url") },
      },
    });
  }));
  return calls;
}

async function runAll(state: GmailBatchState, budgetMs = 20_000) {
  let batches = 0;
  const evidence = [];
  let last;
  do {
    last = await runGmailBatch("tok", state, { budgetMs });
    state = last.state;
    evidence.push(...last.evidence);
    batches += 1;
  } while (!last.done && batches < 500);
  return { last, batches, evidence };
}

beforeEach(() => setGmailRetryDelaysForTests([0, 0, 0]));
afterEach(() => vi.unstubAllGlobals());

describe("resumable batched scan", () => {
  it("scans well past the old 200 cap and reaches every lane", async () => {
    installGmail(150);
    const { last } = await runAll(newGmailBatchState("13m"));
    expect(last.done).toBe(true);
    expect(last.state.fetched).toBe(150 * laneQueries.length);
    expect(last.state.lanes.every((l) => l.status === "complete")).toBe(true);
    expect(last.truncated).toBe(false);
  });

  it("does not let one busy lane starve the rest (per-lane ceiling)", async () => {
    installGmail(GMAIL_LANE_MESSAGE_CEILING + 400);
    const { last } = await runAll(newGmailBatchState("13m"));
    // The first lane stops at its ceiling and is reported truncated; later lanes still start.
    expect(last.state.lanes[0].status).toBe("truncated");
    expect(last.state.lanes.slice(1).some((l) => l.pagesFetched > 0)).toBe(true);
    expect(last.truncated).toBe(true);
  });

  it("stops at the run ceiling, reports truncation, and can resume", async () => {
    installGmail(900);
    let { last } = await runAll(newGmailBatchState("13m"));
    expect(last.state.runFetched).toBeGreaterThanOrEqual(GMAIL_RUN_MESSAGE_CEILING);
    expect(last.truncated).toBe(true);
    expect(last.state.lane).toBeLessThan(laneQueries.length);
    const lanePos = last.state.lane;
    const resumed = await runAll({ ...last.state, runFetched: 0 });
    expect(resumed.last.state.lane).toBeGreaterThan(lanePos);
  });

  it("is time-boxed: a tiny budget yields partial progress with a continuing state", async () => {
    installGmail(500);
    const first = await runGmailBatch("tok", newGmailBatchState("13m"), { budgetMs: 0 });
    expect(first.done).toBe(false);
    expect(first.state.seq).toBe(1);
  });

  it("fetches with bounded concurrency", async () => {
    const calls = installGmail(100);
    await runAll(newGmailBatchState("13m"));
    expect(calls.maxParallel).toBeLessThanOrEqual(10);
  });

  it("retries a 429 instead of counting the message as failed", async () => {
    installGmail(20, { flaky429: true });
    const { last } = await runAll(newGmailBatchState("13m"));
    expect(last.state.failures).toBe(0);
  });

  it("treats a 401 as fatal and stops", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 401)));
    const r = await runGmailBatch("tok", newGmailBatchState("13m"));
    expect(r.state.fatalStatus).toBe(401);
    expect(r.done).toBe(true);
  });
});

describe("scan cursor", () => {
  const state = newGmailBatchState("13m");
  it("round-trips for the same user and hides its contents", () => {
    const withToken = { ...state, pageToken: "SECRET-PAGE-TOKEN", lane: 2 };
    const c = sealScanCursor("u1", withToken);
    expect(Buffer.from(c, "base64url").toString("latin1")).not.toContain("SECRET-PAGE-TOKEN");
    expect(openScanCursor("u1", c)?.pageToken).toBe("SECRET-PAGE-TOKEN");
  });
  it("rejects another user, tampering, expiry and garbage", () => {
    const c = sealScanCursor("u1", state, 1_000_000);
    expect(openScanCursor("u2", c, 1_000_000)).toBeNull();
    const bad = c.slice(0, -4) + (c.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(openScanCursor("u1", bad, 1_000_000)).toBeNull();
    expect(openScanCursor("u1", c, 1_000_000 + 31 * 60 * 1000)).toBeNull();
    expect(openScanCursor("u1", "nope", 1_000_000)).toBeNull();
    expect(openScanCursor("u1", undefined)).toBeNull();
  });
  it("rejects a cursor past the batch limit", () => {
    expect(openScanCursor("u1", sealScanCursor("u1", { ...state, seq: 400 }))).toBeNull();
  });
});

describe("evidence sent to the browser", () => {
  it("has no message ids, sender, subject or card digits", () => {
    const out = sanitizeBatchEvidence("u1", {
      id: "gmail-gen-RAWID123",
      source: "gmail",
      evidence_type: "payment",
      message_id: "RAWID123",
      sender: "Netflix <info@netflix.com>",
      subject: "Receipt",
      currency: "INR",
      billing_channel: "Credit card (Card •••• 4242)",
      last4: "4242",
      mandate_id: "MANDATE-9",
      summary: "Netflix payment",
    } as never);
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/RAWID123|info@netflix|Receipt|4242|MANDATE-9/);
    expect(out.message_id).toMatch(/^[0-9a-f]{40}$/);
  });
});

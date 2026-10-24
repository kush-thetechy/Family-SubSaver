import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GMAIL_RUN_MESSAGE_CEILING,
  GMAIL_TOTAL_MESSAGE_CEILING,
  newGmailBatchState,
  resumeGmailBatchState,
  runGmailBatch,
  type GmailBatchState,
} from "../connectors/gmail-batch";
import { buildGmailDateFilter, buildGmailLanes, setGmailRetryDelaysForTests } from "../connectors/gmail-service";
import { openScanCursor, sealScanCursor } from "../connectors/scan-cursor";
import { sanitizeBatchEvidence } from "../connectors/batched-scan-handler";
import { computeImportKey, importKeyFromEvidenceKeys, verifyEvidenceProof } from "../connectors/import-key";

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
function installGmail(perLane: number, opts: { flaky429?: boolean; shared?: number; slow429Ms?: number } = {}) {
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
        messages: Array.from({ length: n }, (_, i) => ({
          id: offset + i < (opts.shared ?? 0) ? `S-M${offset + i}` : `L${lane}-M${offset + i}`,
        })),
        ...(next ? { nextPageToken: next } : {}),
      });
    }
    if (opts.slow429Ms) {
      await new Promise((r) => setTimeout(r, opts.slow429Ms));
      return json({ error: { message: "rate" } }, 429);
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

  it("lists lanes round-robin so a busy lane cannot starve the others", async () => {
    installGmail(5000);
    const first = await runGmailBatch("tok", newGmailBatchState("13m"), { budgetMs: 0 });
    expect(first.state.lanes.every((l) => l.pagesFetched === 0)).toBe(true);
    let state = newGmailBatchState("13m");
    // Stop at the run ceiling: every lane must have been read by then.
    const { last } = await runAll(state);
    expect(last.state.lanes.every((l) => l.pagesFetched > 0)).toBe(true);
    const pages = last.state.lanes.map((l) => l.pagesFetched);
    expect(Math.max(...pages) - Math.min(...pages)).toBeLessThanOrEqual(1);
  });

  it("counts a message matched by several lanes once", async () => {
    installGmail(100, { shared: 60 });
    const { last } = await runAll(newGmailBatchState("13m"));
    const lanes = laneQueries.length;
    const matched = last.state.lanes.reduce((t, l) => t + l.messagesMatched, 0);
    expect(matched).toBe(100 * lanes);
    expect(last.state.selected).toBe(60 + 40 * lanes);
    expect(last.state.attempted).toBe(60 + 40 * lanes);
    expect(last.state.lanes.reduce((t, l) => t + l.uniqueMessagesSelected, 0)).toBe(60 + 40 * lanes);
  });

  it("stops at the run ceiling as resumable, and Continue goes past it without skipping or repeating", async () => {
    const calls = installGmail(900);
    const run1 = await runAll(newGmailBatchState("13m"));
    expect(run1.last.truncated).toBe(true);
    expect(run1.last.resumable).toBe(true);
    expect(run1.last.state.runFetched).toBeGreaterThanOrEqual(GMAIL_RUN_MESSAGE_CEILING);
    expect(run1.last.state.pending).toHaveLength(0);
    let state = run1.last.state;
    let last = run1.last;
    const evidence = [...run1.evidence];
    let runs = 1;
    while (last.resumable && runs < 10) {
      const r = await runAll(resumeGmailBatchState(state));
      last = r.last;
      state = last.state;
      evidence.push(...r.evidence);
      runs += 1;
    }
    // 900 x lanes exceeds two runs of 2,000, so Continue was used more than once.
    expect(runs).toBeGreaterThanOrEqual(3);
    expect(state.runNo).toBe(runs);
    expect(last.done).toBe(true);
    expect(last.truncated).toBe(false);
    // Every message in every lane was fetched exactly once across all runs.
    expect(state.fetched).toBe(900 * laneQueries.length);
    expect(calls.get).toBe(900 * laneQueries.length);
    const keys = evidence.map((e) => e.message_id);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stops for good at the total ceiling and does not offer to resume", async () => {
    installGmail(GMAIL_TOTAL_MESSAGE_CEILING);
    let state = newGmailBatchState("13m");
    let last;
    for (let i = 0; i < 12; i += 1) {
      const r = await runAll(i === 0 ? state : resumeGmailBatchState(state));
      last = r.last;
      state = last.state;
      if (!last.resumable) break;
    }
    expect(last!.state.totalCeilingHit).toBe(true);
    expect(last!.resumable).toBe(false);
    expect(last!.truncated).toBe(true);
    expect(last!.state.selected).toBeGreaterThanOrEqual(GMAIL_TOTAL_MESSAGE_CEILING);
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

  it("slow 429s: the hard deadline stops retry sleeps and unread ids stay pending, never dropped", async () => {
    setGmailRetryDelaysForTests([30, 30, 30]);
    installGmail(30, { slow429Ms: 20 });
    // Listing works (list calls are not rate limited); fetches are slow 429s. Hard deadline 120ms.
    const r = await runGmailBatch("tok", newGmailBatchState("13m"), { budgetMs: 5_000, hardMs: 120 });
    expect(r.done).toBe(false);
    expect(r.state.pending.length).toBeGreaterThan(0);
    // listed = attempted + still pending: nothing silently lost
    expect(r.state.attempted + r.state.pending.length).toBe(r.state.selected);
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
    const withToken = { ...state, tokens: ["SECRET-PAGE-TOKEN", "", "", "", ""], pending: ["RAWPENDINGID"], next: 2 };
    const c = sealScanCursor("u1", withToken);
    const raw = Buffer.from(c, "base64url").toString("latin1");
    expect(raw).not.toContain("SECRET-PAGE-TOKEN");
    expect(raw).not.toContain("RAWPENDINGID");
    expect(openScanCursor("u1", c)?.tokens[0]).toBe("SECRET-PAGE-TOKEN");
    expect(openScanCursor("u1", c)?.pending).toEqual(["RAWPENDINGID"]);
  });
  it("stays small at the total ceiling", () => {
    let seen = "";
    for (let i = 0; i < GMAIL_TOTAL_MESSAGE_CEILING; i += 1) seen += (i * 2654435761 % 2 ** 48).toString(16).padStart(12, "0");
    const c = sealScanCursor("u1", { ...state, seen });
    expect(c.length).toBeLessThan(200_000);
    expect(openScanCursor("u1", c)?.seen.length).toBe(seen.length);
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
  it("has no message ids, sender, subject or card digits, and carries a verifiable proof", () => {
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
    expect(verifyEvidenceProof("u1", out.message_id!, out.key_proof)).toBe(true);
    expect(verifyEvidenceProof("u2", out.message_id!, out.key_proof)).toBe(false);
  });
  it("single-shot and batched paths give the same import key for the same emails", () => {
    const a = sanitizeBatchEvidence("u1", { id: "x", source: "gmail", evidence_type: "payment", message_id: "M1" } as never);
    const b = sanitizeBatchEvidence("u1", { id: "y", source: "gmail", evidence_type: "payment", message_id: "M2" } as never);
    expect(importKeyFromEvidenceKeys("u1", [b.message_id, a.message_id])).toBe(computeImportKey("u1", ["M1", "M2"]));
    expect(importKeyFromEvidenceKeys("u2", [a.message_id, b.message_id])).not.toBe(computeImportKey("u1", ["M1", "M2"]));
  });
});

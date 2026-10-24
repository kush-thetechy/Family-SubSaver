import { createHash, randomUUID } from "crypto";
import { DiscoveryEvidence, GmailHistoryRange, GmailScanLaneCoverage } from "@/types";
import {
  GmailApiError,
  GmailMessage,
  buildGmailDateFilter,
  buildGmailLanes,
  fetchGmailJson,
  getGmailHistoryWindow,
  hasSubscriptionEmailKeywords,
  parseGeneralGmailMessage,
} from "./gmail-service";

/**
 * Resumable, time-boxed Gmail scan. One call does a bounded amount of work and returns a state
 * that the caller passes back (sealed, see scan-cursor.ts) to continue.
 *
 * Fairness: lanes are listed round-robin, one page per lane per turn, so no lane can starve the
 * others and a stop at any point leaves every lane partially covered.
 * Uniqueness: a message matched by several lanes is fetched once. The state carries a 6-byte hash
 * of every message id seen (inside the encrypted cursor only), so counts are unique messages.
 * Nothing is skipped: ids listed but not yet fetched stay in `pending`; Gmail page tokens stay
 * per lane. A continuation picks up exactly there.
 *
 * Limits and why (policy choices, not Gmail limits):
 *  - PAGE_SIZE 100: Gmail's maximum page size for messages.list.
 *  - FETCH_CONCURRENCY 10: stays within Gmail's per-user quota (messages.get costs 5 units).
 *  - RUN_MESSAGE_CEILING 2000: bounds browser memory and the review list in one run. Reaching it
 *    ends the run as truncated + resumable; Continue resets this counter only.
 *  - TOTAL_MESSAGE_CEILING 10000: bounds the whole scan so the encrypted cursor (which carries
 *    the seen-hash list, about 160 KB at the limit) stays small. Reaching it is final and is
 *    reported as truncated, never as the whole inbox.
 *  - SOFT budget 20s stops starting new pages; HARD deadline 40s stops retry sleeps and
 *    starting new fetch chunks. The route sets maxDuration 60.
 */
export const GMAIL_PAGE_SIZE = 100;
export const GMAIL_FETCH_CONCURRENCY = 10;
export const GMAIL_RUN_MESSAGE_CEILING = 2000;
export const GMAIL_TOTAL_MESSAGE_CEILING = 10000;
export const GMAIL_BATCH_BUDGET_MS = 20_000;
export const GMAIL_BATCH_HARD_MS = 40_000;
const HASH_HEX = 12;

export interface GmailBatchState {
  v: 2;
  scanId: string;
  /** which run of this scan (increments on Continue); with scanId it makes coverage idempotent */
  runNo: number;
  range: GmailHistoryRange;
  /** round-robin pointer */
  next: number;
  /** Gmail page token per lane ("" = first page, undefined handled via finished status) */
  tokens: string[];
  lanes: GmailScanLaneCoverage[];
  /** listed but not yet fetched message ids */
  pending: string[];
  /** concatenated 6-byte hashes of every message id seen in this scan */
  seen: string;
  /** unique messages selected (listed, deduplicated across lanes) */
  selected: number;
  attempted: number;
  fetched: number;
  failures: number;
  /** messages fetched in the current run, used for the run ceiling */
  runFetched: number;
  seq: number;
  totalCeilingHit?: boolean;
  fatalStatus?: number;
}

export interface GmailBatchResult {
  evidence: DiscoveryEvidence[];
  state: GmailBatchState;
  done: boolean;
  /** true when the run ended with mail left unread (ceiling or failed lane) */
  truncated: boolean;
  /** true when a Continue can read more (run ceiling reached, nothing fatal) */
  resumable: boolean;
}

function idHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, HASH_HEX);
}

function seenHas(seen: Set<string>, id: string) {
  return seen.has(idHash(id));
}

export function newGmailBatchState(range: GmailHistoryRange): GmailBatchState {
  const lanes = buildGmailLanes(buildGmailDateFilter(range));
  return {
    v: 2,
    scanId: randomUUID(),
    runNo: 1,
    range,
    next: 0,
    tokens: lanes.map(() => ""),
    lanes: lanes.map((l) => ({
      key: l.key,
      label: l.name,
      status: "not_started",
      pagesFetched: 0,
      messagesMatched: 0,
      uniqueMessagesSelected: 0,
    })),
    pending: [],
    seen: "",
    selected: 0,
    attempted: 0,
    fetched: 0,
    failures: 0,
    runFetched: 0,
    seq: 0,
  };
}

/** Prepare a state for Continue: new run, run ceiling reset, everything else preserved. */
export function resumeGmailBatchState(state: GmailBatchState): GmailBatchState {
  return { ...state, runNo: state.runNo + 1, runFetched: 0 };
}

const laneOpen = (l: GmailScanLaneCoverage) => l.status !== "complete" && l.status !== "failed";

export async function runGmailBatch(
  accessToken: string,
  input: GmailBatchState,
  options: { budgetMs?: number; hardMs?: number; now?: () => number } = {}
): Promise<GmailBatchResult> {
  const now = options.now ?? Date.now;
  const start = now();
  const soft = start + (options.budgetMs ?? GMAIL_BATCH_BUDGET_MS);
  const hard = start + (options.hardMs ?? GMAIL_BATCH_HARD_MS);
  const state: GmailBatchState = JSON.parse(JSON.stringify(input));
  state.seq += 1;
  const window = getGmailHistoryWindow(state.range);
  const lanes = buildGmailLanes(buildGmailDateFilter(state.range));
  const seen = new Set<string>();
  for (let i = 0; i + HASH_HEX <= state.seen.length; i += HASH_HEX) seen.add(state.seen.slice(i, i + HASH_HEX));
  const evidence: DiscoveryEvidence[] = [];

  const fetchPending = async () => {
    while (state.pending.length > 0 && !state.fatalStatus && now() < hard) {
      const chunk = state.pending.slice(0, GMAIL_FETCH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (id) => {
          try {
            const msg = await fetchGmailJson<GmailMessage>(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
              accessToken,
              { deadline: hard }
            );
            state.fetched += 1;
            const ts = Number(msg.internalDate);
            if (!Number.isFinite(ts) || ts < window.start.getTime() || ts > window.end.getTime()) return null;
            if (!hasSubscriptionEmailKeywords(msg)) return null;
            return parseGeneralGmailMessage(msg);
          } catch (error) {
            if (error instanceof GmailApiError && (error.status === 401 || error.status === 403)) {
              state.fatalStatus ??= error.status;
            }
            state.failures += 1;
            return null;
          }
        })
      );
      state.pending = state.pending.slice(chunk.length);
      state.attempted += chunk.length;
      state.runFetched += chunk.length;
      for (const ev of results) if (ev) evidence.push(ev);
    }
  };

  let truncatedByCeiling = false;
  while (!state.fatalStatus) {
    await fetchPending();
    if (state.fatalStatus || state.pending.length > 0) break; // fatal, or out of hard time: continue next batch
    if (!state.lanes.some(laneOpen)) break; // every lane finished
    if (state.selected >= GMAIL_TOTAL_MESSAGE_CEILING) {
      state.totalCeilingHit = true;
      truncatedByCeiling = true;
      break;
    }
    if (state.runFetched >= GMAIL_RUN_MESSAGE_CEILING) {
      truncatedByCeiling = true;
      break;
    }
    if (now() >= soft) break;

    // List one page from the next open lane (round-robin).
    let li = state.next;
    for (let k = 0; k < lanes.length && !laneOpen(state.lanes[li]); k += 1) li = (li + 1) % lanes.length;
    state.next = (li + 1) % lanes.length;
    const cov = state.lanes[li];
    try {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", lanes[li].query);
      url.searchParams.set("maxResults", String(GMAIL_PAGE_SIZE));
      if (state.tokens[li]) url.searchParams.set("pageToken", state.tokens[li]);
      const res = await fetchGmailJson<{ messages?: { id: string }[]; nextPageToken?: string }>(
        url.toString(),
        accessToken,
        { deadline: hard }
      );
      cov.pagesFetched += 1;
      const page = (res.messages ?? []).map((m) => m.id).filter(Boolean);
      cov.messagesMatched += page.length;
      const fresh: string[] = [];
      for (const id of page) {
        if (seenHas(seen, id)) continue;
        seen.add(idHash(id));
        state.seen += idHash(id);
        fresh.push(id);
      }
      cov.uniqueMessagesSelected += fresh.length;
      state.selected += fresh.length;
      state.pending.push(...fresh);
      if (res.nextPageToken) {
        state.tokens[li] = res.nextPageToken;
        cov.status = "not_started"; // in progress
      } else {
        state.tokens[li] = "";
        cov.status = "complete";
      }
    } catch (error) {
      cov.status = "failed";
      cov.errorStatus = error instanceof GmailApiError ? error.status : undefined;
      if (error instanceof GmailApiError && (error.status === 401 || error.status === 403)) {
        state.fatalStatus ??= error.status;
      }
    }
  }

  const anyOpen = state.lanes.some(laneOpen);
  const anyFailed = state.lanes.some((l) => l.status === "failed");
  const finished = !anyOpen && state.pending.length === 0;
  const done = Boolean(state.fatalStatus) || finished || truncatedByCeiling;
  const truncated = Boolean(state.fatalStatus) || anyOpen || anyFailed || state.pending.length > 0;
  if (done && anyOpen) {
    for (const l of state.lanes) if (laneOpen(l)) l.status = "truncated";
  }
  const resumable = done && truncatedByCeiling && !state.totalCeilingHit && !state.fatalStatus;
  return { evidence, state, done, truncated, resumable };
}

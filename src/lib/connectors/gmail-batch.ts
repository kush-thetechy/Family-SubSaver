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
 * that the caller passes back to continue. The state holds only counters, the lane position and
 * Gmail's opaque page token; message ids never leave the server.
 *
 * Limits and why:
 *  - PAGE_SIZE 100: Gmail's maximum page size for messages.list.
 *  - FETCH_CONCURRENCY 10: keeps within Gmail's per-user quota (250 units/s; messages.get is 5 units).
 *  - RUN_MESSAGE_CEILING: a per-run policy ceiling. It bounds the browser memory and the review
 *    list a person has to go through. Reaching it is reported as truncated and the scan can be
 *    resumed from the returned state; it is never described as a complete inbox scan.
 *  - BATCH_BUDGET_MS: keeps each request well inside the function duration.
 */
export const GMAIL_PAGE_SIZE = 100;
export const GMAIL_FETCH_CONCURRENCY = 10;
export const GMAIL_RUN_MESSAGE_CEILING = 2000;
export const GMAIL_LANE_MESSAGE_CEILING = 1000;
export const GMAIL_BATCH_BUDGET_MS = 20_000;

export interface GmailBatchState {
  v: 1;
  range: GmailHistoryRange;
  /** index of the lane being listed */
  lane: number;
  pageToken?: string;
  lanes: GmailScanLaneCoverage[];
  /** messages queued for fetching in this run (counts category overlaps twice) */
  selected: number;
  attempted: number;
  fetched: number;
  failures: number;
  /** messages fetched in this run, used for the ceiling */
  runFetched: number;
  seq: number;
  fatalStatus?: number;
}

export interface GmailBatchResult {
  evidence: DiscoveryEvidence[];
  state: GmailBatchState;
  done: boolean;
  /** true when the run ended at the ceiling or a lane limit with more mail left */
  truncated: boolean;
}

export function newGmailBatchState(range: GmailHistoryRange): GmailBatchState {
  const lanes = buildGmailLanes(buildGmailDateFilter(range));
  return {
    v: 1,
    range,
    lane: 0,
    lanes: lanes.map((l) => ({
      key: l.key,
      label: l.name,
      status: "not_started",
      pagesFetched: 0,
      messagesMatched: 0,
      uniqueMessagesSelected: 0,
    })),
    selected: 0,
    attempted: 0,
    fetched: 0,
    failures: 0,
    runFetched: 0,
    seq: 0,
  };
}

export async function runGmailBatch(
  accessToken: string,
  input: GmailBatchState,
  options: { budgetMs?: number; now?: () => number } = {}
): Promise<GmailBatchResult> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? GMAIL_BATCH_BUDGET_MS);
  const state: GmailBatchState = JSON.parse(JSON.stringify(input));
  state.seq += 1;
  const window = getGmailHistoryWindow(state.range);
  const lanes = buildGmailLanes(buildGmailDateFilter(state.range));
  const ids: string[] = [];
  let truncated = false;

  // 1. List pages until the time budget or ceilings stop us.
  while (state.lane < lanes.length && now() < deadline && state.runFetched + ids.length < GMAIL_RUN_MESSAGE_CEILING) {
    const lane = lanes[state.lane];
    const cov = state.lanes[state.lane];
    if (cov.uniqueMessagesSelected >= GMAIL_LANE_MESSAGE_CEILING) {
      cov.status = "truncated";
      truncated = true;
      state.lane += 1;
      state.pageToken = undefined;
      continue;
    }
    try {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", lane.query);
      url.searchParams.set("maxResults", String(GMAIL_PAGE_SIZE));
      if (state.pageToken) url.searchParams.set("pageToken", state.pageToken);
      const res = await fetchGmailJson<{ messages?: { id: string }[]; nextPageToken?: string }>(
        url.toString(),
        accessToken
      );
      cov.pagesFetched += 1;
      const page = (res.messages ?? []).map((m) => m.id).filter(Boolean);
      cov.messagesMatched += page.length;
      cov.uniqueMessagesSelected += page.length;
      ids.push(...page);
      if (res.nextPageToken) {
        state.pageToken = res.nextPageToken;
        cov.status = "not_started"; // still in progress; finalized when the lane ends
      } else {
        cov.status = "complete";
        state.lane += 1;
        state.pageToken = undefined;
      }
    } catch (error) {
      cov.status = "failed";
      cov.errorStatus = error instanceof GmailApiError ? error.status : undefined;
      if (error instanceof GmailApiError && (error.status === 401 || error.status === 403)) {
        state.fatalStatus ??= error.status;
      }
      state.lane += 1;
      state.pageToken = undefined;
      if (state.fatalStatus) break;
    }
  }
  state.selected += ids.length;

  // 2. Fetch the listed messages with bounded concurrency.
  const evidence: DiscoveryEvidence[] = [];
  for (let i = 0; i < ids.length && !state.fatalStatus; i += GMAIL_FETCH_CONCURRENCY) {
    const chunk = ids.slice(i, i + GMAIL_FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          const msg = await fetchGmailJson<GmailMessage>(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
            accessToken
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
    state.attempted += chunk.length;
    state.runFetched += chunk.length;
    for (const ev of results) if (ev) evidence.push(ev);
  }

  const lanesLeft = state.lane < lanes.length;
  const ceilingHit = state.runFetched >= GMAIL_RUN_MESSAGE_CEILING;
  if (ceilingHit && lanesLeft) truncated = true;
  const done = !state.fatalStatus && (!lanesLeft || ceilingHit);
  if (done && lanesLeft) {
    // Mark the lane we stopped in as truncated so coverage says so.
    const cov = state.lanes[state.lane];
    if (cov && cov.status === "not_started" && cov.pagesFetched > 0) cov.status = "truncated";
  }
  if (state.fatalStatus) truncated = true;
  return { evidence, state, done: done || Boolean(state.fatalStatus), truncated };
}

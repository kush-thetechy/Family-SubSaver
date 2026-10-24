import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DiscoveryEvidence, GmailHistoryRange, GmailScanCoverage } from "@/types";
import {
  GmailBatchState,
  newGmailBatchState,
  resumeGmailBatchState,
  runGmailBatch,
} from "./gmail-batch";
import { openScanCursor, sealScanCursor } from "./scan-cursor";
import { evidenceKey, evidenceProof } from "./import-key";
import { getGmailHistoryWindow, MAX_GMAIL_SCANS_PER_DAY } from "./gmail-service";
import { clearSessionCookie, setSessionCookie, ServerUserSession } from "./server-token-store";

const NO_STORE = { "Cache-Control": "no-store" };

/** Evidence for the signed-in person's own browser. No message ids, senders, subjects or ids. */
export function sanitizeBatchEvidence(userId: string, ev: DiscoveryEvidence): DiscoveryEvidence {
  const key = ev.message_id ? evidenceKey(userId, ev.message_id) : undefined;
  return {
    id: `ev-${key ?? "unknown"}`,
    key_proof: key ? evidenceProof(userId, key) : undefined,
    source: "gmail",
    evidence_type: ev.evidence_type,
    message_id: key,
    date: ev.date,
    renewal_date: ev.renewal_date,
    amount_rupees: ev.amount_rupees,
    currency: ev.currency,
    billing_channel: ev.billing_channel?.replace(/\s*\(Card\s+••••\s*\d{4}\)/gi, ""),
    merchant_raw: ev.merchant_raw,
    merchant_inferred: ev.merchant_inferred,
    plan_name: ev.plan_name,
    frequency_raw: ev.frequency_raw,
    max_amount_rupees: ev.max_amount_rupees,
    account_ref: ev.account_ref,
    summary: ev.summary,
  };
}

export function coverageFromState(state: GmailBatchState, truncated: boolean): GmailScanCoverage {
  const w = getGmailHistoryWindow(state.range);
  const lanes = state.lanes;
  return {
    historyRange: state.range,
    windowStart: w.start.toISOString(),
    windowEnd: w.end.toISOString(),
    pagesFetched: lanes.reduce((t, l) => t + l.pagesFetched, 0),
    messagesMatched: lanes.reduce((t, l) => t + l.messagesMatched, 0),
    uniqueMessagesSelected: state.selected,
    messagesAttempted: state.attempted,
    messagesFetched: state.fetched,
    messageFetchFailures: state.failures,
    paginationComplete:
      !truncated && state.failures === 0 && !state.fatalStatus && lanes.every((l) => l.status === "complete"),
    truncated: truncated || lanes.some((l) => l.status === "truncated" || l.status === "not_started"),
    attachmentsScanned: false,
    laneCoverage: lanes,
  };
}

interface Args {
  supabase: SupabaseClient;
  userId: string;
  session: ServerUserSession;
  accessToken: string;
  historyRange: GmailHistoryRange;
  cursor: unknown;
  resume: boolean;
}

/**
 * One batch of a resumable scan. The caller has already checked the session, the release gate
 * and current consent on this request, so withdrawing consent stops the scan at the next batch.
 */
export async function handleBatchedScan(a: Args): Promise<NextResponse> {
  let state: GmailBatchState;
  if (a.cursor === undefined || a.cursor === null) {
    const { data, error } = await a.supabase.rpc("consume_gmail_scan_quota");
    const quota = (data as { allowed: boolean; resets_at?: string; scans_remaining?: number }[] | null)?.[0];
    if (error || !quota) {
      return NextResponse.json(
        { success: false, error: "Gmail scan limits could not be verified. Please try again later." },
        { status: 503, headers: NO_STORE }
      );
    }
    if (!quota.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily Gmail scan limit reached (${MAX_GMAIL_SCANS_PER_DAY} scans). Try again after ${quota.resets_at}.`,
          resetsAt: quota.resets_at,
        },
        { status: 429, headers: NO_STORE }
      );
    }
    state = newGmailBatchState(a.historyRange);
  } else {
    const opened = openScanCursor(a.userId, a.cursor);
    if (!opened || opened.range !== a.historyRange) {
      return NextResponse.json(
        { success: false, error: "This scan expired or is no longer valid. Start a new scan." },
        { status: 400, headers: NO_STORE }
      );
    }
    state = opened;
    if (a.resume) state = resumeGmailBatchState(state);
  }

  const result = await runGmailBatch(a.accessToken, state);
  const warnings: string[] = [];
  const s = result.state;

  if (s.fatalStatus === 401) {
    const response = NextResponse.json(
      { success: false, error: "Gmail authorization expired. Please reconnect your account." },
      { status: 401, headers: NO_STORE }
    );
    clearSessionCookie(response);
    return response;
  }
  if (s.fatalStatus === 403) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Google denied Gmail access. Verify that the Gmail API is enabled and that the Gmail read-only scope is authorized.",
      },
      { status: 502, headers: NO_STORE }
    );
  }

  let coverage: GmailScanCoverage | undefined;
  if (result.done) {
    coverage = coverageFromState(s, result.truncated);
    const { data: coverageId, error } = await a.supabase.rpc("record_own_gmail_scan_coverage_once", {
      p_scan_id: s.scanId,
      p_run_no: s.runNo,
      p_history_range: coverage.historyRange,
      p_window_start: coverage.windowStart,
      p_window_end: coverage.windowEnd,
      p_pages_fetched: coverage.pagesFetched,
      p_messages_matched: coverage.messagesMatched,
      p_unique_messages_selected: coverage.uniqueMessagesSelected,
      p_messages_attempted: coverage.messagesAttempted,
      p_messages_fetched: coverage.messagesFetched,
      p_message_fetch_failures: coverage.messageFetchFailures,
      p_pagination_complete: coverage.paginationComplete,
      p_truncated: coverage.truncated,
      p_lane_coverage: coverage.laneCoverage,
    });
    coverage.recorded = !error && typeof coverageId === "string";
    if (coverage.recorded) coverage.id = coverageId as string;
    else warnings.push("Scan coverage could not be saved to your account.");
    if (coverage.truncated) {
      warnings.push(
        "Coverage is incomplete: this run stopped at a safety limit or a search category failed. Resume to keep scanning; do not treat this as the whole inbox."
      );
    }
    if (s.failures > 0) warnings.push("Some matched Gmail messages could not be read; coverage is incomplete.");
    warnings.push("Attachments are not fetched or parsed; coverage applies only to searchable message content.");
  }

  const resumable = result.resumable;
  const response = NextResponse.json(
    {
      success: true,
      mode: "live",
      batch: true,
      done: result.done,
      truncated: result.truncated,
      evidence: result.evidence.map((e) => sanitizeBatchEvidence(a.userId, e)),
      cursor: !result.done || resumable ? sealScanCursor(a.userId, s) : undefined,
      resumable,
      progress: {
        messagesChecked: s.attempted, uniqueSelected: s.selected,
        lanes: s.lanes.map((l) => ({ label: l.label, status: l.status, pagesFetched: l.pagesFetched, messagesMatched: l.messagesMatched })),
      },
      coverage,
      warnings,
    },
    { headers: NO_STORE }
  );
  setSessionCookie(response, a.session);
  return response;
}

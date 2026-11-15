/**
 * Bulk Gmail page fetch through Composio with skipped/null reconciliation.
 *
 * Why: per-message fetching costs one Composio tool call per email. GMAIL_FETCH_EMAILS
 * can return up to 500 hydrated messages per call (verbose + include_payload), but the
 * docs say messages whose detail fetch hits 404/429/503 are silently skipped and a
 * payload can be null. To keep the "nothing skipped" coverage rule, each page is
 * cross-checked against an ids_only list of the same page; any id missing from the
 * hydrated page, or hydrated without a payload, is re-fetched one by one.
 *
 * ASSUMPTION (unverified, needs live API check): ids_only and hydrated calls with the
 * same query, max_results and page_token list the same message ids. If the live check
 * shows they do not, this module must not be enabled.
 */

import {
  COMPOSIO_GMAIL_FETCH_EMAILS,
  COMPOSIO_GMAIL_FETCH_MESSAGE,
  normalizeComposioMessage,
} from "./composio-gmail";

export type ComposioExecutor = (
  toolSlug: string,
  args: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export const COMPOSIO_BULK_PAGE_SIZE = 500;

export interface BulkPageStats {
  listedIds: number;
  hydratedFromBulk: number;
  recoveredByFallback: number;
  unrecoverable: string[];
  toolCalls: number;
}

export interface BulkPageResult {
  messages: Record<string, unknown>[];
  nextPageToken?: string;
  stats: BulkPageStats;
}

function idOf(m: Record<string, unknown>): string {
  for (const k of ["message_id", "messageId", "id"]) {
    const v = m[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function listOf(data: Record<string, unknown>): Record<string, unknown>[] {
  const raw = data.messages ?? data.results ?? [];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

function hasPayload(m: Record<string, unknown>): boolean {
  const p = m.payload ?? m.message_payload;
  return Boolean(p && typeof p === "object") ||
    typeof m.message_text === "string" || typeof m.body === "string";
}

export async function fetchComposioBulkPage(
  exec: ComposioExecutor,
  options: { query: string; pageToken?: string; pageSize?: number }
): Promise<BulkPageResult> {
  const pageSize = Math.min(options.pageSize ?? COMPOSIO_BULK_PAGE_SIZE, COMPOSIO_BULK_PAGE_SIZE);
  const base: Record<string, unknown> = { query: options.query, max_results: pageSize };
  if (options.pageToken) base.page_token = options.pageToken;
  let toolCalls = 0;

  const idsPage = await exec(COMPOSIO_GMAIL_FETCH_EMAILS, { ...base, ids_only: true });
  toolCalls += 1;
  const listedIds = listOf(idsPage).map(idOf).filter(Boolean);

  const bulk = await exec(COMPOSIO_GMAIL_FETCH_EMAILS, {
    ...base, verbose: true, include_payload: true,
  });
  toolCalls += 1;
  const hydrated = new Map<string, Record<string, unknown>>();
  for (const m of listOf(bulk)) {
    const id = idOf(m);
    if (id && hasPayload(m)) hydrated.set(id, m);
  }

  const unrecoverable: string[] = [];
  let recovered = 0;
  for (const id of listedIds) {
    if (hydrated.has(id)) continue;
    try {
      const one = await exec(COMPOSIO_GMAIL_FETCH_MESSAGE, { message_id: id, format: "full" });
      toolCalls += 1;
      const raw = (one && typeof one === "object" && "message" in one
        ? (one.message as Record<string, unknown>) : one) as Record<string, unknown>;
      if (raw && hasPayload(raw)) {
        hydrated.set(id, { ...raw, id: idOf(raw) || id });
        recovered += 1;
      } else {
        unrecoverable.push(id);
      }
    } catch {
      toolCalls += 1;
      unrecoverable.push(id);
    }
  }

  const messages = listedIds
    .filter((id) => hydrated.has(id))
    .map((id) => normalizeComposioMessage(hydrated.get(id)!));
  const next = (idsPage.nextPageToken ?? idsPage.next_page_token) as string | undefined;
  return {
    messages,
    nextPageToken: typeof next === "string" && next ? next : undefined,
    stats: {
      listedIds: listedIds.length,
      hydratedFromBulk: listedIds.length - recovered - unrecoverable.length,
      recoveredByFallback: recovered,
      unrecoverable,
      toolCalls,
    },
  };
}

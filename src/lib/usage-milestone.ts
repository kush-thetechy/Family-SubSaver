import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Records, once per kind, WHEN a user first saw live subscriptions from a Gmail scan or
 * screenshot import. Stores only the kind, the first time and a count. Never blocks the user:
 * any failure is ignored.
 */
export async function recordUsageMilestone(kind: "gmail_scan_viewed" | "ocr_import_viewed", liveSeen: number): Promise<void> {
  if (!Number.isFinite(liveSeen) || liveSeen < 1) return;
  try {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    await client.rpc("record_usage_milestone", { milestone_kind: kind, live_seen: Math.floor(liveSeen) });
  } catch {
    // The trial clock must never break an import.
  }
}

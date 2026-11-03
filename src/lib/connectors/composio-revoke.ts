/**
 * Revokes a user's Composio access (disconnect, consent withdrawal, account deletion).
 * Grounded: DELETE {base}/connected_accounts/{id}?revoke_on_delete=true deletes the account
 * (it stops working immediately) and starts a background revoke of upstream Google
 * credentials (docs.composio.dev/reference/api-reference/connected-accounts/deleteConnectedAccountsByNanoid).
 * The revoke job result is only visible in the Composio dashboard, so "revocation started"
 * is the strongest claim we can make.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteComposioAccountRow, getComposioAccount } from "./composio-account-store";
import { clearComposioBulkCacheForUser } from "./composio-gmail";
import { COMPOSIO_API_BASE } from "./composio-gmail";

export type ComposioRevokeResult =
  | { ok: true; hadAccount: boolean }
  | { ok: false; error: string };

export async function deleteComposioConnectedAccount(
  apiKey: string,
  accountId: string,
  baseUrl: string = COMPOSIO_API_BASE
): Promise<boolean> {
  const res = await fetch(
    `${baseUrl}/connected_accounts/${encodeURIComponent(accountId)}?revoke_on_delete=true`,
    { method: "DELETE", headers: { "x-api-key": apiKey }, cache: "no-store" }
  );
  // 404: already gone, which is the state we want.
  return res.ok || res.status === 404;
}

export async function revokeComposioAccess(opts: {
  supabase: SupabaseClient;
  userId: string;
  env?: Record<string, string | undefined>;
}): Promise<ComposioRevokeResult> {
  const env = opts.env ?? process.env;
  clearComposioBulkCacheForUser(opts.userId);
  let stored;
  try {
    stored = await getComposioAccount(opts.supabase, opts.userId);
  } catch {
    return { ok: false, error: "Could not check Composio access." };
  }
  if (!stored || (!stored.connectedAccountId && !stored.pendingAccountId)) {
    return { ok: true, hadAccount: false };
  }
  const apiKey = env.COMPOSIO_API_KEY;
  if (!apiKey) return { ok: false, error: "Composio is not configured, so access could not be revoked." };
  try {
    for (const id of [stored.connectedAccountId, stored.pendingAccountId]) {
      if (id && !(await deleteComposioConnectedAccount(apiKey, id))) {
        return { ok: false, error: "Composio could not confirm the access was removed." };
      }
    }
    await deleteComposioAccountRow(opts.supabase, opts.userId);
  } catch {
    return { ok: false, error: "Composio could not confirm the access was removed." };
  }
  return { ok: true, hadAccount: true };
}

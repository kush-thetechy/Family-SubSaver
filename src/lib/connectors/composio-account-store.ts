/** Per-user Composio account state (table gmail_composio_accounts, service role only). */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoredComposioAccount {
  /** Linked (completed) account. Scans use only this. */
  connectedAccountId?: string;
  authConfigId?: string;
  /** Gmail address recorded from GMAIL_GET_PROFILE when the link was completed. */
  gmailEmail?: string;
  pendingAccountId?: string;
  pendingStateHash?: string;
  pendingExpiresAt?: string;
}

export function hashComposioState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function getComposioAccount(
  supabase: SupabaseClient,
  userId: string
): Promise<StoredComposioAccount | null> {
  const { data, error } = await supabase
    .from("gmail_composio_accounts")
    .select(
      "connected_account_id, auth_config_id, gmail_email, pending_account_id, pending_state_hash, pending_expires_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not read Composio account.");
  if (!data) return null;
  const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    connectedAccountId: s(data.connected_account_id),
    authConfigId: s(data.auth_config_id),
    gmailEmail: s(data.gmail_email),
    pendingAccountId: s(data.pending_account_id),
    pendingStateHash: s(data.pending_state_hash),
    pendingExpiresAt: s(data.pending_expires_at),
  };
}

/** Records a connect attempt. Touches only pending_* columns; the linked account is untouched. */
export async function savePendingComposioAccount(
  supabase: SupabaseClient,
  userId: string,
  pending: { accountId: string; stateHash: string; expiresAt: string }
): Promise<void> {
  const { error } = await supabase.from("gmail_composio_accounts").upsert({
    user_id: userId,
    pending_account_id: pending.accountId,
    pending_state_hash: pending.stateHash,
    pending_expires_at: pending.expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Could not save pending Composio account.");
}

export async function clearPendingComposioAccount(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("gmail_composio_accounts")
    .update({
      pending_account_id: null,
      pending_state_hash: null,
      pending_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error("Could not clear pending Composio account.");
}

/** Promotes the verified pending account to linked and clears the pending attempt. */
export async function linkComposioAccount(
  supabase: SupabaseClient,
  userId: string,
  linked: { accountId: string; authConfigId: string; gmailEmail: string }
): Promise<void> {
  const { error } = await supabase
    .from("gmail_composio_accounts")
    .update({
      connected_account_id: linked.accountId,
      auth_config_id: linked.authConfigId,
      gmail_email: linked.gmailEmail,
      pending_account_id: null,
      pending_state_hash: null,
      pending_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error("Could not link Composio account.");
}

export async function deleteComposioAccountRow(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("gmail_composio_accounts")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error("Could not delete Composio account record.");
}

/** Per-user Composio connected account id (table gmail_composio_accounts, service role only). */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoredComposioAccount {
  connectedAccountId: string;
  authConfigId?: string;
  /** Gmail address recorded from GMAIL_GET_PROFILE when the connection was completed. */
  gmailEmail?: string;
}

export async function getComposioAccount(
  supabase: SupabaseClient,
  userId: string
): Promise<StoredComposioAccount | null> {
  const { data, error } = await supabase
    .from("gmail_composio_accounts")
    .select("connected_account_id, auth_config_id, gmail_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not read Composio account.");
  if (!data) return null;
  return {
    connectedAccountId: data.connected_account_id as string,
    authConfigId: (data.auth_config_id as string | null) ?? undefined,
    gmailEmail: (data.gmail_email as string | null) ?? undefined,
  };
}

export async function saveComposioAccount(
  supabase: SupabaseClient,
  userId: string,
  account: StoredComposioAccount
): Promise<void> {
  const { error } = await supabase.from("gmail_composio_accounts").upsert({
    user_id: userId,
    connected_account_id: account.connectedAccountId,
    auth_config_id: account.authConfigId ?? null,
    gmail_email: account.gmailEmail ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Could not save Composio account.");
}

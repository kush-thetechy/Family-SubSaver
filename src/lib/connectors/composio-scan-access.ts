/**
 * Resolves the scan token for composio mode. All checks run server-side and fail closed:
 * the user id comes from the authenticated session (never the client), the account id from
 * our own table, and the binding must validate before a scan token exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getComposioAccount, saveComposioAccount } from "./composio-account-store";
import {
  evaluateComposioConnectedAccount,
  fetchComposioConnectedAccount,
  validateComposioGmailBinding,
} from "./composio-binding";
import {
  buildComposioScanToken,
  COMPOSIO_GMAIL_GET_PROFILE,
  executeComposioTool,
} from "./composio-gmail";

export type ComposioScanAccess =
  | { ok: true; scanToken: string }
  | { ok: false; status: number; error: string };

export async function resolveComposioScanAccess(opts: {
  supabase: SupabaseClient;
  userId: string;
  env?: Record<string, string | undefined>;
}): Promise<ComposioScanAccess> {
  const env = opts.env ?? process.env;
  const apiKey = env.COMPOSIO_API_KEY;
  const authConfigId = env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  if (!apiKey || !authConfigId) {
    return { ok: false, status: 503, error: "Composio Gmail is not configured." };
  }
  let stored;
  try {
    stored = await getComposioAccount(opts.supabase, opts.userId);
  } catch {
    return { ok: false, status: 503, error: "Gmail connection could not be verified." };
  }
  if (!stored) {
    return { ok: false, status: 401, error: "Connect Gmail from your signed-in account before scanning." };
  }
  if (!stored.gmailEmail) {
    return { ok: false, status: 401, error: "Finish connecting Gmail before scanning." };
  }
  try {
    const verdict = await validateComposioGmailBinding(apiKey, {
      connectedAccountId: stored.connectedAccountId,
      expectedUserId: opts.userId,
      expectedAuthConfigId: authConfigId,
      expectedEmail: stored.gmailEmail,
    });
    if (!verdict.ok) {
      return { ok: false, status: 403, error: "Connected Gmail account failed verification." };
    }
  } catch {
    return { ok: false, status: 503, error: "Gmail connection could not be verified." };
  }
  return { ok: true, scanToken: buildComposioScanToken(opts.userId, stored.connectedAccountId) };
}

/**
 * Called after the user returns from the Composio connect link. Validates the account
 * fields (ACTIVE, gmail, our auth config, owner = authenticated user), then records the
 * Gmail address reported by GMAIL_GET_PROFILE on that exact account so every later scan
 * must match it. Design note: this binds scans to the account that connected; it does not
 * prove the Gmail address equals any address the user typed elsewhere.
 */
export async function completeComposioConnection(opts: {
  supabase: SupabaseClient;
  userId: string;
  env?: Record<string, string | undefined>;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const env = opts.env ?? process.env;
  const apiKey = env.COMPOSIO_API_KEY;
  const authConfigId = env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  if (!apiKey || !authConfigId) return { ok: false, error: "Composio Gmail is not configured." };
  try {
    const stored = await getComposioAccount(opts.supabase, opts.userId);
    if (!stored) return { ok: false, error: "No pending Gmail connection was found." };
    const account = await fetchComposioConnectedAccount(apiKey, stored.connectedAccountId);
    const verdict = evaluateComposioConnectedAccount(account, {
      connectedAccountId: stored.connectedAccountId,
      expectedUserId: opts.userId,
      expectedAuthConfigId: authConfigId,
    });
    if (!verdict.ok) return { ok: false, error: "The Gmail connection could not be verified." };
    const profile = await executeComposioTool<{ email?: string; emailAddress?: string }>(
      COMPOSIO_GMAIL_GET_PROFILE,
      opts.userId,
      {},
      { connectedAccountId: stored.connectedAccountId, apiKey }
    );
    const email = profile?.email ?? profile?.emailAddress;
    if (!email) return { ok: false, error: "Gmail did not report an address for this connection." };
    await saveComposioAccount(opts.supabase, opts.userId, { ...stored, authConfigId, gmailEmail: email });
    return { ok: true, email };
  } catch {
    return { ok: false, error: "The Gmail connection could not be completed." };
  }
}

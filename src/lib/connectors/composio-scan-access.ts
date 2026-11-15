/**
 * Resolves the scan token for composio mode. All checks run server-side and fail closed:
 * the user id comes from the authenticated session (never the client), the account id from
 * our own table, and the binding must validate before a scan token exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearPendingComposioAccount,
  getComposioAccount,
  linkComposioAccount,
} from "./composio-account-store";
import { deleteComposioConnectedAccount } from "./composio-revoke";
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
  if (!stored?.connectedAccountId) {
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
 * Called after the user returns from the Composio connect link. The caller has already
 * matched the one-time state (URL param = cookie = hashed pending state, not expired).
 * Validates the PENDING account (ACTIVE, gmail, our auth config, owner = authenticated user),
 * reads the Gmail address from GMAIL_GET_PROFILE on that exact account, and only then links it.
 * If a linked account already exists with a different address, the new one is refused and
 * deleted at Composio: the user's established account is never silently replaced; the user
 * must disconnect first. Any failure clears the pending attempt and never touches the linked one.
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
  let stored;
  try {
    stored = await getComposioAccount(opts.supabase, opts.userId);
  } catch {
    return { ok: false, error: "The Gmail connection could not be completed." };
  }
  const pendingId = stored?.pendingAccountId;
  if (!stored || !pendingId) return { ok: false, error: "No pending Gmail connection was found." };

  const abandon = async (error: string) => {
    try { await deleteComposioConnectedAccount(apiKey, pendingId); } catch { /* best effort */ }
    try { await clearPendingComposioAccount(opts.supabase, opts.userId); } catch { /* best effort */ }
    return { ok: false as const, error };
  };

  try {
    const account = await fetchComposioConnectedAccount(apiKey, pendingId);
    const verdict = evaluateComposioConnectedAccount(account, {
      connectedAccountId: pendingId,
      expectedUserId: opts.userId,
      expectedAuthConfigId: authConfigId,
    });
    if (!verdict.ok) return abandon("The Gmail connection could not be verified.");
    const profile = await executeComposioTool<{ email?: string; emailAddress?: string }>(
      COMPOSIO_GMAIL_GET_PROFILE,
      opts.userId,
      {},
      { connectedAccountId: pendingId, apiKey }
    );
    const email = profile?.email ?? profile?.emailAddress;
    if (!email) return abandon("Gmail did not report an address for this connection.");
    if (
      stored.gmailEmail &&
      stored.connectedAccountId &&
      stored.gmailEmail.toLowerCase() !== email.toLowerCase()
    ) {
      return abandon(
        `This is a different Gmail account (${email}) from the one already connected (${stored.gmailEmail}). Disconnect the current Gmail first to switch.`
      );
    }
    await linkComposioAccount(opts.supabase, opts.userId, { accountId: pendingId, authConfigId, gmailEmail: email });
    // Reconnecting the same address: the previous linked account id is now superseded; remove it.
    if (stored.connectedAccountId && stored.connectedAccountId !== pendingId) {
      try { await deleteComposioConnectedAccount(apiKey, stored.connectedAccountId); } catch { /* best effort */ }
    }
    return { ok: true, email };
  } catch {
    return abandon("The Gmail connection could not be completed.");
  }
}

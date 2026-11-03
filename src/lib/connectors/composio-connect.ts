/**
 * Composio connect-link creation (server side only).
 * POST {base}/connected_accounts/link  {auth_config_id, user_id, callback_url?}
 * -> {redirect_url, connected_account_id, expires_at, link_token}
 * The user_id MUST be the authenticated SubSaver user id derived server-side.
 * The returned connected_account_id must be stored against that user and later
 * validated with composio-binding before any scan.
 */
import { COMPOSIO_API_BASE } from "./composio-gmail";

export interface ComposioConnectLink {
  redirectUrl: string;
  connectedAccountId: string;
  expiresAt?: string;
}

export async function createComposioConnectLink(opts: {
  apiKey: string;
  authConfigId: string;
  appUserId: string;
  callbackUrl?: string;
  baseUrl?: string;
}): Promise<ComposioConnectLink> {
  if (!opts.appUserId) throw new Error("appUserId is required");
  const res = await fetch(`${opts.baseUrl ?? COMPOSIO_API_BASE}/connected_accounts/link`, {
    method: "POST",
    headers: { "x-api-key": opts.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_config_id: opts.authConfigId,
      user_id: opts.appUserId,
      ...(opts.callbackUrl ? { callback_url: opts.callbackUrl } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Composio connect link failed with status ${res.status}.`);
  const j = (await res.json()) as Record<string, unknown>;
  const redirectUrl = j.redirect_url;
  const id = j.connected_account_id;
  if (typeof redirectUrl !== "string" || typeof id !== "string") {
    throw new Error("Composio connect link response missing redirect_url or connected_account_id.");
  }
  return { redirectUrl, connectedAccountId: id, expiresAt: typeof j.expires_at === "string" ? j.expires_at : undefined };
}

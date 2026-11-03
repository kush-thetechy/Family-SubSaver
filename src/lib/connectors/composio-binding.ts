/**
 * Server-side binding validation for Composio connected Gmail accounts.
 *
 * Requirements (build review, 3 Nov 2026) - a composio-mode scan must NEVER run
 * until every check passes, server-side:
 *  1. The connected_account_id used is the exact id stored against the
 *     authenticated SubSaver user at link time - never a client-supplied id,
 *     never "the first active account" under a user_id.
 *  2. GET /connected_accounts/{id} must show status ACTIVE, toolkit gmail, and
 *     our own auth_config_id.
 *  3. The account's owner user_id must equal the authenticated SubSaver user's
 *     id (the id we put in Composio), failing closed when the field is absent.
 *  4. GMAIL_GET_PROFILE on that exact account must return the Gmail address the
 *     user consented with (matches gmail_consents).
 *
 * Grounding (public docs, 3 Nov 2026):
 *  - GET https://backend.composio.dev/api/v3.1/connected_accounts/{id} ->
 *    { status, toolkit: { slug }, ... } (docs.auth-configuration/connected-accounts)
 *  - Execute accepts connected_account_id for exact account selection
 *    (reference tools/postToolsExecuteByToolSlug).
 *  - GMAIL_GET_PROFILE returns the authenticated account's email address
 *    (toolkits/gmail).
 *
 * PENDING API CHECK: exact JSON field names for the owning user id and auth
 * config on the account GET response are not published verbatim; this module
 * reads `user_id` and `auth_config.id`/`auth_config_id` and FAILS CLOSED when
 * an expected value cannot be compared.
 */

import {
  COMPOSIO_API_BASE,
  COMPOSIO_GMAIL_GET_PROFILE,
  executeComposioTool,
} from "./composio-gmail";

export interface ComposioConnectedAccount {
  id?: string;
  status?: string;
  user_id?: string;
  toolkit?: { slug?: string };
  auth_config?: { id?: string };
  auth_config_id?: string;
}

export interface ComposioBindingExpectation {
  /** Exact account id stored against the authenticated user at link time. */
  connectedAccountId: string;
  /** Authenticated SubSaver user id (the Composio user_id we assigned). */
  expectedUserId: string;
  /** Our Gmail auth config id; checked when provided. */
  expectedAuthConfigId?: string;
  /** Gmail address the user consented with (gmail_consents); checked when provided. */
  expectedEmail?: string;
}

export type ComposioBindingResult = { ok: true } | { ok: false; reason: string };

export async function fetchComposioConnectedAccount(
  apiKey: string,
  connectedAccountId: string,
  baseUrl: string = COMPOSIO_API_BASE
): Promise<ComposioConnectedAccount> {
  const response = await fetch(
    `${baseUrl}/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
    { headers: { "x-api-key": apiKey }, cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(
      `Composio connected account lookup failed with status ${response.status}.`
    );
  }
  return (await response.json()) as ComposioConnectedAccount;
}

export function evaluateComposioConnectedAccount(
  account: ComposioConnectedAccount,
  expectation: ComposioBindingExpectation
): ComposioBindingResult {
  const status = (account.status ?? "").toUpperCase();
  if (status !== "ACTIVE") {
    return {
      ok: false,
      reason: `connected account status is ${account.status ?? "missing"}, not ACTIVE`,
    };
  }
  const slug = account.toolkit?.slug;
  if (slug !== "gmail") {
    return {
      ok: false,
      reason: `connected account toolkit is ${slug ?? "missing"}, not gmail`,
    };
  }
  if (expectation.expectedAuthConfigId) {
    const authConfigId = account.auth_config?.id ?? account.auth_config_id;
    if (!authConfigId) {
      return {
        ok: false,
        reason: "connected account carries no auth config id to compare",
      };
    }
    if (authConfigId !== expectation.expectedAuthConfigId) {
      return {
        ok: false,
        reason: "connected account auth config does not match this app's Gmail auth config",
      };
    }
  }
  if (!account.user_id) {
    return { ok: false, reason: "connected account has no owner user id to compare" };
  }
  if (account.user_id !== expectation.expectedUserId) {
    return {
      ok: false,
      reason: "connected account owner does not match the authenticated app user",
    };
  }
  return { ok: true };
}

interface ComposioProfile {
  email?: string;
  emailAddress?: string;
}

/**
 * Full binding validation: account fields (1-3) plus the Gmail profile email
 * check (4). The profile call is pinned to the exact connected account.
 */
export async function validateComposioGmailBinding(
  apiKey: string,
  expectation: ComposioBindingExpectation
): Promise<ComposioBindingResult> {
  const account = await fetchComposioConnectedAccount(
    apiKey,
    expectation.connectedAccountId
  );
  const verdict = evaluateComposioConnectedAccount(account, expectation);
  if (!verdict.ok) return verdict;

  if (expectation.expectedEmail) {
    const profile = await executeComposioTool<ComposioProfile>(
      COMPOSIO_GMAIL_GET_PROFILE,
      expectation.expectedUserId,
      {},
      { connectedAccountId: expectation.connectedAccountId, apiKey }
    );
    const email = profile?.email ?? profile?.emailAddress;
    if (!email) {
      return {
        ok: false,
        reason: "Gmail profile returned no email address to compare",
      };
    }
    if (email.toLowerCase() !== expectation.expectedEmail.toLowerCase()) {
      return {
        ok: false,
        reason: "connected Gmail address does not match the user's consented Gmail",
      };
    }
  }
  return { ok: true };
}

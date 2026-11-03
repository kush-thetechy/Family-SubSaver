/**
 * Composio-managed Gmail access (alternative provider, behind GMAIL_PROVIDER=composio).
 *
 * When enabled, the scan pipeline's Gmail API calls are translated into Composio
 * tool executions (POST https://backend.composio.dev/api/v3.1/tools/execute/{slug})
 * authenticated with the Composio API key. The "accessToken" argument then carries
 * the app's user id, which Composio maps to that user's connected Gmail account;
 * Google tokens never touch this server.
 *
 * IMPORTANT (grounded 3 Nov 2026, Composio docs/guide):
 * - The Composio MANAGED Gmail app requests https://mail.google.com/ (full mailbox),
 *   broader than this app's read-only promise. Enabling this provider for real users
 *   requires the owner's explicit decision and privacy-policy wording changes.
 * - The direct Gmail provider remains the default; this module is inert unless the
 * flag is set AND an API key is configured.
 */

export const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3.1";
export const COMPOSIO_GMAIL_FETCH_EMAILS = "GMAIL_FETCH_EMAILS";
export const COMPOSIO_GMAIL_FETCH_MESSAGE = "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID";
export const COMPOSIO_GMAIL_GET_PROFILE = "GMAIL_GET_PROFILE";

export function isComposioGmailProvider(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    env.GMAIL_PROVIDER === "composio" &&
    typeof env.COMPOSIO_API_KEY === "string" &&
    env.COMPOSIO_API_KEY.length > 0
  );
}

interface ComposioExecuteEnvelope {
  data?: unknown;
  successful?: boolean;
  error?: string | null;
}

export interface ComposioExecuteOptions {
  /** Pin execution to one exact connected account (never "any active account"). */
  connectedAccountId?: string;
  /** Override the env API key (used by server-side binding validation). */
  apiKey?: string;
}

export async function executeComposioTool<T>(
  toolSlug: string,
  userId: string,
  args: Record<string, unknown>,
  options: ComposioExecuteOptions = {}
): Promise<T> {
  const apiKey = options.apiKey ?? (process.env.COMPOSIO_API_KEY as string);
  const response = await fetch(
    `${COMPOSIO_API_BASE}/tools/execute/${encodeURIComponent(toolSlug)}`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        arguments: args,
        ...(options.connectedAccountId
          ? { connected_account_id: options.connectedAccountId }
          : {}),
      }),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    const { GmailApiError } = await import("./gmail-service");
    throw new GmailApiError(
      `Composio tool ${toolSlug} failed with status ${response.status}.`,
      response.status
    );
  }
  const envelope = (await response.json()) as ComposioExecuteEnvelope;
  if (envelope.successful === false) {
    const { GmailApiError } = await import("./gmail-service");
    throw new GmailApiError(
      `Composio tool ${toolSlug} returned an error.`,
      502
    );
  }
  const data = (envelope.data ?? envelope) as Record<string, unknown>;
  // Composio nests tool results differently per tool; unwrap one level when obvious.
  const inner =
    data && typeof data === "object" && "response_data" in data
      ? (data.response_data as T)
      : data && typeof data === "object" && "data" in data && Object.keys(data).length === 1
        ? (data.data as T)
        : (data as T);
  return inner;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toEpochMs(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Gmail internalDate is epoch ms; accept seconds too.
    return String(value > 1e12 ? value : value * 1000);
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) {
      const n = Number(value);
      return String(value.length >= 13 ? n : n * 1000);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return String(parsed);
  }
  return String(Date.now());
}

/** Normalize one Composio message record to the Gmail API message shape the pipeline parses. */
export function normalizeComposioMessage(raw: Record<string, unknown>): Record<string, unknown> {
  const id =
    asString(raw.message_id) ?? asString(raw.messageId) ?? asString(raw.id) ?? "";
  // Already Gmail-shaped (some tools return the raw Gmail payload):
  const payload = (raw.payload ?? raw.message_payload) as Record<string, unknown> | undefined;
  const internalDate = toEpochMs(
    raw.internalDate ?? raw.messageTimestamp ?? raw.date ?? raw.timestamp
  );
  if (payload && typeof payload === "object") {
    return { id: asString(raw.id) ?? id, threadId: raw.threadId ?? raw.thread_id, internalDate, payload };
  }
  const headers = [
    { name: "From", value: asString(raw.sender) ?? asString(raw.from) ?? "" },
    { name: "Subject", value: asString(raw.subject) ?? "" },
    { name: "Date", value: asString(raw.date) ?? new Date(Number(internalDate)).toUTCString() },
  ];
  const bodyText =
    asString(raw.message_text) ?? asString(raw.body) ?? asString(raw.snippet) ?? "";
  return {
    id,
    threadId: raw.threadId ?? raw.thread_id,
    internalDate,
    payload: {
      mimeType: "text/plain",
      headers,
      body: { data: bodyText ? Buffer.from(bodyText, "utf8").toString("base64url") : "" },
    },
  };
}

/**
 * Translate one Gmail REST URL (as used by the scan pipeline) into a Composio tool
 * execution and normalize the response back to the Gmail REST shape, so the rest of
 * the pipeline runs unchanged.
 */
export async function composioGmailRequest<T>(
  url: string,
  composioUserId: string
): Promise<T> {
  const parsed = new URL(url);
  const listMatch = /\/gmail\/v1\/users\/me\/messages$/.test(parsed.pathname);
  const getMatch = parsed.pathname.match(/\/gmail\/v1\/users\/me\/messages\/([^/]+)$/);

  if (listMatch) {
    const args: Record<string, unknown> = {
      query: parsed.searchParams.get("q") ?? "",
      max_results: Number(parsed.searchParams.get("maxResults") ?? "100"),
      verbose: false,
      include_payload: false,
    };
    const pageToken = parsed.searchParams.get("pageToken");
    if (pageToken) args.page_token = pageToken;
    const data = await executeComposioTool<Record<string, unknown>>(
      COMPOSIO_GMAIL_FETCH_EMAILS,
      composioUserId,
      args
    );
    const rawMessages = (data.messages ?? data.results ?? []) as Record<string, unknown>[];
    const messages = rawMessages
      .map((m) => ({
        id:
          asString(m.message_id) ?? asString(m.messageId) ?? asString(m.id) ?? "",
      }))
      .filter((m) => m.id);
    const nextPageToken =
      asString(data.nextPageToken) ?? asString(data.next_page_token) ?? undefined;
    return { messages, nextPageToken } as T;
  }

  if (getMatch) {
    const messageId = decodeURIComponent(getMatch[1]);
    const data = await executeComposioTool<Record<string, unknown>>(
      COMPOSIO_GMAIL_FETCH_MESSAGE,
      composioUserId,
      { message_id: messageId }
    );
    const raw = (data && typeof data === "object" && "message" in data
      ? (data.message as Record<string, unknown>)
      : data) as Record<string, unknown>;
    return normalizeComposioMessage(raw) as T;
  }

  const { GmailApiError } = await import("./gmail-service");
  throw new GmailApiError(`Unsupported Gmail path for Composio provider: ${parsed.pathname}`, 400);
}

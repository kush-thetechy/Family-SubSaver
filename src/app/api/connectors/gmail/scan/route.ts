import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  getSessionFromRequestCookies,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";
import {
  GmailApiError,
  MAX_GMAIL_SCANS_PER_DAY,
  getSampleConsolidatedCandidates,
  normalizeGmailHistoryRange,
  searchGmailMultiLane,
  ScanOptions,
} from "@/lib/connectors/gmail-service";
import {
  hasCurrentGmailConsent,
  isGmailEnabledForUser,
} from "@/lib/connectors/gmail-policy";
import { Subscription } from "@/types";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

interface ScanRequestBody {
  mode?: "live" | "sandbox";
  historyRange?: string;
  existingSubscriptions?: Subscription[];
}

interface GmailScanQuota {
  allowed: boolean;
  scans_remaining: number;
  resets_at: string;
}

async function getSignedInUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !appUrl) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

async function handleGet() {
  const hasGoogleConfiguration = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      isSessionEncryptionConfigured()
  );
  const session = getSessionFromRequestCookies();
  const userId = await getSignedInUserId();
  const gmailEnabled = Boolean(userId && isGmailEnabledForUser(userId));
  let consented = false;
  if (userId && gmailEnabled) {
    try {
      consented = await hasCurrentGmailConsent(
        createSupabaseServerClient(),
        userId
      );
    } catch (error) {
      console.error("Could not verify Gmail consent status:", error);
      return NextResponse.json(
        {
          configured: false,
          connected: false,
          message: "Gmail consent could not be verified.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
  const configured = Boolean(
    isSupabaseConfigured && hasGoogleConfiguration && gmailEnabled
  );
  const connected = Boolean(
    configured &&
    consented &&
    session &&
    !session.isDemo &&
    session.userId === userId
  );

  return NextResponse.json({
    configured,
    gmailEnabled,
    connected,
    email: connected ? session?.email ?? null : null,
    connectionId:
      connected && session
        ? createHash("sha256").update(session.sessionId).digest("hex")
        : null,
    message: !isSupabaseConfigured
      ? "Live Gmail scans require a configured Supabase account."
      : !gmailEnabled
        ? "Gmail discovery is disabled for this account by the server release gate."
      : !consented
        ? "Review the Gmail disclosure and consent before connecting."
      : !hasGoogleConfiguration
        ? "Live Gmail linking needs server OAuth and session-encryption settings."
        : undefined,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function handleDelete(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Untrusted request origin." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  const session = getSessionFromRequestCookies();
  const userId = await getSignedInUserId();
  if (!userId) {
    const response = NextResponse.json(
      { success: false, connected: false, error: "Sign in to disconnect Gmail." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    clearSessionCookie(response);
    return response;
  }
  let revokeFailed = false;

  if (
    session &&
    !session.isDemo &&
    session.userId === userId
  ) {
    const token = session.googleRefreshToken || session.googleAccessToken;
    if (token) {
      try {
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
        revokeFailed = !response.ok && response.status !== 400;
      } catch {
        revokeFailed = true;
      }
    }
  }

  const response = NextResponse.json(
    revokeFailed
      ? {
          success: false,
          connected: false,
          error:
            "Gmail was disconnected from this app, but Google could not confirm revocation. You can also remove access from your Google Account settings.",
        }
      : {
          success: true,
          connected: false,
          message: "Gmail disconnected and credentials removed.",
        },
    {
      status: revokeFailed ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );

  clearSessionCookie(response);
  return response;
}

async function handlePost(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Untrusted request origin." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  if (
    !parsedBody ||
    typeof parsedBody !== "object" ||
    Array.isArray(parsedBody)
  ) {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object." },
      { status: 400 }
    );
  }
  const body = parsedBody as ScanRequestBody;
  const requestMode = (parsedBody as Record<string, unknown>).mode;
  if (
    requestMode !== undefined &&
    requestMode !== "live" &&
    requestMode !== "sandbox"
  ) {
    return NextResponse.json(
      { success: false, error: "Unsupported Gmail scan mode." },
      { status: 400 }
    );
  }
  if (
    body.existingSubscriptions !== undefined &&
    !Array.isArray(body.existingSubscriptions)
  ) {
    return NextResponse.json(
      { success: false, error: "Existing subscriptions must be a list." },
      { status: 400 }
    );
  }
  if (
    body.historyRange !== undefined &&
    body.historyRange !== "30d" &&
    body.historyRange !== "45d"
  ) {
    return NextResponse.json(
      { success: false, error: "Choose a 30-day or 45-day Gmail history window." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const session = getSessionFromRequestCookies();
  const historyRange = normalizeGmailHistoryRange(body.historyRange);

  // 1. Handle the explicit sample-results preview.
  if (body.mode === "sandbox") {
    const sampleCandidates = getSampleConsolidatedCandidates(
      body.existingSubscriptions ?? []
    );
    return NextResponse.json({
      success: true,
      mode: "sandbox",
      count: sampleCandidates.length,
      candidates: sampleCandidates,
      totalMessagesScanned: 18,
      historyRange,
      lanesScanned: [
        "Store Receipts & Renewals",
        "Direct Merchant Invoices",
        "Bank E-Mandates & Alerts",
      ],
      message: "Showing sample discovery candidates across Google Play, Apple, direct billing, and HDFC e-mandate. No live Gmail inbox was scanned.",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Live Gmail scans require a configured, signed-in account.",
      },
      { status: 503 }
    );
  }

  const userId = await getSignedInUserId();
  if (
    !session ||
    !userId ||
    session.userId !== userId
  ) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Please connect Gmail from your signed-in account before scanning.",
      },
      { status: 401 }
    );
    if (session) clearSessionCookie(response);
    return response;
  }

  if (!isGmailEnabledForUser(userId)) {
    return NextResponse.json(
      { success: false, error: "Gmail discovery is disabled for this account by the server release gate." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  const supabase = createSupabaseServerClient();
  try {
    if (!(await hasCurrentGmailConsent(supabase, userId))) {
      return NextResponse.json(
        { success: false, error: "Current Gmail consent is required before scanning." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    console.error("Could not verify Gmail consent before scan:", error);
    return NextResponse.json(
      { success: false, error: "Gmail consent could not be verified." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let accessToken = session.googleAccessToken;
  const tokenExpiry = session.tokenExpiry || 0;

  if (!accessToken || Date.now() > tokenExpiry - 60000) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Gmail access expired. Reconnect your Google account to start a new scan.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    clearSessionCookie(response);
    return response;
  }

  // Execute live multi-lane search
  try {
    const { data: quotaRows, error: quotaError } = await supabase.rpc(
      "consume_gmail_scan_quota"
    );
    if (quotaError) {
      console.error("Could not enforce Gmail scan quota:", quotaError);
      return NextResponse.json(
        {
          success: false,
          error: "Gmail scan limits could not be verified. Please try again later.",
        },
        { status: 503 }
      );
    }

    const quota = (quotaRows as GmailScanQuota[] | null)?.[0];
    if (!quota) {
      console.error("Gmail scan quota function returned no result.");
      return NextResponse.json(
        {
          success: false,
          error: "Gmail scan limits could not be verified. Please try again later.",
        },
        { status: 503 }
      );
    }
    if (!quota.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily Gmail scan limit reached (${MAX_GMAIL_SCANS_PER_DAY} scans). Try again after ${quota.resets_at}.`,
          scansRemaining: quota.scans_remaining,
          resetsAt: quota.resets_at,
        },
        { status: 429 }
      );
    }

    const scanOptions: ScanOptions = {
      historyRange,
      existingSubscriptions: body.existingSubscriptions,
    };

    const { candidates, totalMessagesScanned, lanesScanned, warnings } =
      await searchGmailMultiLane(accessToken, scanOptions);
    const safeCandidates = candidates.map((candidate) => ({
      ...candidate,
      billing_channel: candidate.billing_channel.replace(
        /\s*\(Card\s+••••\s*\d{4}\)/gi,
        ""
      ),
      mandate_details: candidate.mandate_details
        ? {
            max_amount_rupees: candidate.mandate_details.max_amount_rupees,
            start_date: candidate.mandate_details.start_date,
            end_date: candidate.mandate_details.end_date,
            frequency: candidate.mandate_details.frequency,
          }
        : undefined,
      evidence: candidate.evidence.map((evidence, index) => ({
        id: `${evidence.evidence_type}-${index + 1}`,
        source: "gmail" as const,
        evidence_type: evidence.evidence_type,
        date: evidence.date,
        amount_rupees: evidence.amount_rupees,
        currency: evidence.currency,
        billing_channel: evidence.billing_channel?.replace(
          /\s*\(Card\s+••••\s*\d{4}\)/gi,
          ""
        ),
        merchant_raw: evidence.merchant_raw,
        plan_name: evidence.plan_name,
        frequency_raw: evidence.frequency_raw,
        summary: evidence.summary,
      })),
    }));

    const response = NextResponse.json({
      success: true,
      mode: "live",
      count: safeCandidates.length,
      candidates: safeCandidates,
      totalMessagesScanned,
      historyRange: scanOptions.historyRange,
      lanesScanned,
      warnings,
      message:
        candidates.length > 0
          ? `Discovered ${candidates.length} likely subscription candidates from ${totalMessagesScanned} keyword-matched emails in the past ${historyRange === "30d" ? "30" : "45"} days. Review each candidate before saving.`
          : `Checked ${totalMessagesScanned} keyword-matched emails from the past ${historyRange === "30d" ? "30" : "45"} days across ${lanesScanned.length} lanes, but found no recurring subscription receipts.`,
    }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    if (error instanceof GmailApiError) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.status === 403
              ? "Google denied Gmail access. Verify the Gmail API is enabled in your Google Cloud Console and the read-only scope is authorized."
              : error.status === 401
                ? "Gmail authorization expired. Please reconnect your account."
                : error.message,
        },
        { status: error.status === 401 ? 401 : 502 }
      );
    }

    return NextResponse.json(
      { success: false, error: "An error occurred while scanning Gmail." },
      { status: 502 }
    );
  }
}

function markNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET() {
  return markNoStore(await handleGet());
}

export async function DELETE(request: Request) {
  return markNoStore(await handleDelete(request));
}

export async function POST(request: Request) {
  return markNoStore(await handlePost(request));
}

import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  getSessionFromRequestCookies,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";
import {
  GmailApiError,
  getSampleConsolidatedCandidates,
  searchGmailMultiLane,
  ScanOptions,
} from "@/lib/connectors/gmail-service";
import { Subscription } from "@/types";

interface ScanRequestBody {
  mode?: "live" | "sandbox";
  historyRange?: "30d" | "90d" | "180d" | "1y" | "2y" | "all";
  maxMessages?: number;
  existingSubscriptions?: Subscription[];
}

interface GoogleRefreshResponse {
  access_token?: string;
  expires_in?: number;
}

export async function GET() {
  const configured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      isSessionEncryptionConfigured()
  );
  const session = getSessionFromRequestCookies();
  const connected = Boolean(session);
  const isDemo = Boolean(session?.isDemo);

  return NextResponse.json({
    configured,
    connected,
    isDemo,
    email: session?.email || (isDemo ? "rahul.sharma@gmail.com" : null),
  });
}

export async function DELETE() {
  const session = getSessionFromRequestCookies();
  let revokeFailed = false;

  if (session && !session.isDemo) {
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
    { status: revokeFailed ? 502 : 200 }
  );

  clearSessionCookie(response);
  return response;
}

export async function POST(request: Request) {
  let body: ScanRequestBody;
  try {
    body = (await request.json()) as ScanRequestBody;
  } catch {
    body = {};
  }

  const session = getSessionFromRequestCookies();

  // 1. Handle Demo / Sandbox Mode
  if (body.mode === "sandbox" || session?.isDemo) {
    const sampleCandidates = getSampleConsolidatedCandidates(
      body.existingSubscriptions ?? []
    );
    return NextResponse.json({
      success: true,
      mode: session?.isDemo ? "live_demo" : "sandbox",
      count: sampleCandidates.length,
      candidates: sampleCandidates,
      totalMessagesScanned: 18,
      historyRange: body.historyRange || "2y",
      lanesScanned: [
        "Store Receipts & Renewals",
        "Direct Merchant Invoices",
        "Bank E-Mandates & Alerts",
      ],
      message: session?.isDemo
        ? `Found ${sampleCandidates.length} candidate subscriptions with evidence across Google Play, Apple, direct billing, and HDFC e-mandate in demo account.`
        : "Showing sample discovery candidates across Google Play, Apple, direct billing, and HDFC e-mandate. No live Gmail inbox was scanned.",
    });
  }

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: "Please connect your Gmail account before starting a scan.",
      },
      { status: 401 }
    );
  }

  let accessToken = session.googleAccessToken;
  const refreshToken = session.googleRefreshToken;
  const tokenExpiry = session.tokenExpiry || 0;
  let sessionToPersist = session;

  // Refresh token if expired or expiring within 60s
  if (!accessToken || Date.now() > tokenExpiry - 60000) {
    if (!refreshToken) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Gmail session expired. Please reconnect your Google account to scan.",
        },
        { status: 401 }
      );
      clearSessionCookie(response);
      return response;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: "Server Google credentials are not configured." },
        { status: 503 }
      );
    }

    try {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshRes.ok) {
        const res = NextResponse.json(
          {
            success: false,
            error: "Gmail access has expired. Please reconnect your Google account.",
          },
          { status: 401 }
        );
        clearSessionCookie(res);
        return res;
      }

      const tokenData = (await refreshRes.json()) as GoogleRefreshResponse;
      if (!tokenData.access_token) {
        return NextResponse.json(
          { success: false, error: "Google did not return an access token." },
          { status: 502 }
        );
      }

      accessToken = tokenData.access_token;
      sessionToPersist = {
        ...session,
        googleAccessToken: accessToken,
        tokenExpiry: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      };
    } catch {
      return NextResponse.json(
        { success: false, error: "Could not reach Google to refresh authorization." },
        { status: 502 }
      );
    }
  }

  // Execute live multi-lane search
  try {
    const scanOptions: ScanOptions = {
      historyRange: body.historyRange || "2y",
      existingSubscriptions: body.existingSubscriptions,
    };

    const { candidates, totalMessagesScanned, lanesScanned } =
      await searchGmailMultiLane(accessToken, scanOptions);

    const response = NextResponse.json({
      success: true,
      mode: "live",
      count: candidates.length,
      candidates,
      totalMessagesScanned,
      historyRange: scanOptions.historyRange,
      lanesScanned,
      message:
        candidates.length > 0
          ? `Discovered ${candidates.length} likely subscription candidates from ${totalMessagesScanned} receipts and alerts. Review each candidate before saving.`
          : `Scanned ${totalMessagesScanned} messages across ${lanesScanned.length} lanes, but found no recurring subscription receipts in the selected timeframe.`,
    });
    setSessionCookie(response, sessionToPersist);
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

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isGmailEnabledForUser } from "@/lib/connectors/gmail-policy";
import { importKeyFromEvidenceKeys, verifyEvidenceProof } from "@/lib/connectors/import-key";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_GROUPS = 500;
const MAX_KEYS = 300;

function trustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !appUrl) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Server-authoritative import keys for batched-scan candidates. The browser sends the evidence
 * keys (and the server-issued proof for each) of every candidate. A key is only used when its
 * proof verifies for this user, so the browser cannot invent evidence or mix another user's.
 * The key is the same function the single-shot scan uses, so both paths de-duplicate alike.
 */
export async function POST(request: Request) {
  if (!trustedOrigin(request)) {
    return NextResponse.json({ success: false, error: "Untrusted request origin." }, { status: 403, headers: NO_STORE });
  }
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, error: "Not configured." }, { status: 503, headers: NO_STORE });
  }
  const { data, error } = await createSupabaseServerClient().auth.getUser();
  const userId = data?.user?.id;
  if (error || !userId) {
    return NextResponse.json({ success: false, error: "Sign in first." }, { status: 401, headers: NO_STORE });
  }
  if (!isGmailEnabledForUser(userId)) {
    return NextResponse.json({ success: false, error: "Gmail discovery is disabled for this account." }, { status: 403, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400, headers: NO_STORE });
  }
  const groups = (body as { groups?: unknown })?.groups;
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS) {
    return NextResponse.json({ success: false, error: "Invalid groups." }, { status: 400, headers: NO_STORE });
  }
  const keys = groups.map((g) => {
    const entries = (g as { evidence?: unknown })?.evidence;
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_KEYS) return null;
    const ok = entries.every(
      (e) =>
        e &&
        typeof (e as { key?: unknown }).key === "string" &&
        verifyEvidenceProof(userId, (e as { key: string }).key, (e as { proof?: unknown }).proof)
    );
    if (!ok) return null;
    return importKeyFromEvidenceKeys(userId, entries.map((e) => (e as { key: string }).key)) ?? null;
  });
  return NextResponse.json({ success: true, keys }, { headers: NO_STORE });
}

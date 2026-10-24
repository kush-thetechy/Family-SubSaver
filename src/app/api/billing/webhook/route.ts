import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing";
import { getDodoEnv, getDodoMode, toDodoEvent } from "@/lib/dodo";
import { nextStatus } from "@/lib/payments";
import { verifyStandardWebhook } from "@/lib/standard-webhooks";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const fail = (status: number) => new NextResponse(null, { status });

export async function POST(request: Request) {
  if (!getBillingConfig().enabled) return fail(404);
  const { webhookSecret } = getDodoEnv();
  const rawBody = await request.text();
  const ok = verifyStandardWebhook({
    id: request.headers.get("webhook-id") ?? "",
    timestamp: request.headers.get("webhook-timestamp") ?? "",
    signature: request.headers.get("webhook-signature") ?? "",
    rawBody,
    secret: webhookSecret ?? "",
  });
  if (!ok) return fail(401);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return fail(400);
  }
  const event = toDodoEvent(parsed);
  if (!event) return NextResponse.json({ received: true });
  try {
    const admin = createSupabaseAdminClient();
    const mode = getDodoMode();
    if (event.kind === "refund") {
      const { error } = await admin
        .from("payments")
        .update({ status: "refunded" })
        .eq("provider_payment_id", event.paymentId)
        .eq("mode", mode);
      return error ? fail(500) : NextResponse.json({ received: true });
    }
    // The payment must belong to a checkout session this server created, for the same user and mode.
    const { data: session, error: sErr } = await admin
      .from("checkout_sessions")
      .select("user_id, mode")
      .eq("session_id", event.sessionId)
      .maybeSingle();
    if (sErr) return fail(500);
    if (!session || session.user_id !== event.userId || session.mode !== mode) {
      return NextResponse.json({ received: true });
    }
    const { data: existing, error: eErr } = await admin
      .from("payments")
      .select("status")
      .eq("provider_payment_id", event.paymentId)
      .maybeSingle();
    if (eErr) return fail(500);
    const status = nextStatus(existing?.status ?? null, event.status);
    if (!status) return NextResponse.json({ received: true }); // older or duplicate event, nothing to change
    const { error } = await admin.from("payments").upsert(
      {
        user_id: event.userId,
        provider: "dodo",
        provider_payment_id: event.paymentId,
        checkout_session_id: event.sessionId,
        mode,
        amount_minor: event.amountMinor,
        currency: event.currency,
        status,
        paid_at: status === "paid" ? event.occurredAt : null,
      },
      { onConflict: "provider_payment_id" }
    );
    if (error) return fail(500);
  } catch {
    return fail(500);
  }
  return NextResponse.json({ received: true });
}

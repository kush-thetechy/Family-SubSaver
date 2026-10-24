import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing";
import { getDodoEnv, toPaymentRecord } from "@/lib/dodo";
import { verifyStandardWebhook } from "@/lib/standard-webhooks";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!getBillingConfig().enabled) return new NextResponse(null, { status: 404 });
  const { webhookSecret } = getDodoEnv();
  const rawBody = await request.text();
  const ok = verifyStandardWebhook({
    id: request.headers.get("webhook-id") ?? "",
    timestamp: request.headers.get("webhook-timestamp") ?? "",
    signature: request.headers.get("webhook-signature") ?? "",
    rawBody,
    secret: webhookSecret ?? "",
  });
  if (!ok) return new NextResponse(null, { status: 401 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const record = toPaymentRecord(parsed);
  if (!record) return NextResponse.json({ received: true });
  try {
    const admin = createSupabaseAdminClient();
    // Upsert by provider payment id: a repeated delivery never creates a second row.
    const { error } = await admin.from("payments").upsert(
      {
        user_id: record.userId,
        provider: "dodo",
        provider_payment_id: record.paymentId,
        amount_minor: record.amountMinor,
        currency: record.currency,
        status: record.status,
        paid_at: record.status === "paid" ? record.occurredAt : null,
      },
      { onConflict: "provider_payment_id" }
    );
    if (error) return new NextResponse(null, { status: 500 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

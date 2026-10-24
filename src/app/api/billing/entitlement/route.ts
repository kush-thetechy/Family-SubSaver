import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing";
import { assessFeeGate } from "@/lib/fee-gate";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/** The signed-in user's own entitlement summary for UI gating. Reveals nothing about others. */
export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { state: "billing_disabled", newCaptureBlocked: false, feeGateEnabled: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  const gate = await assessFeeGate(data.user.id);
  return NextResponse.json(
    {
      state: gate.entitlement.state,
      newCaptureBlocked: gate.blocked,
      message: gate.message,
      feeGateEnabled: getBillingConfig().feeGateEnabled,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

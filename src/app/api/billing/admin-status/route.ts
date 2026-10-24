import { NextResponse } from "next/server";
import { isBillingAdmin } from "@/lib/reconcile";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Owner-only count of payments needing review. Everyone else gets a bare 404. */
export async function GET() {
  const { data } = await createSupabaseServerClient().auth.getUser();
  if (!data.user || !isBillingAdmin(data.user.id)) return new NextResponse(null, { status: 404 });
  const { count } = await createSupabaseAdminClient()
    .from("unmatched_payments")
    .select("provider_payment_id", { count: "exact", head: true })
    .is("resolved_at", null);
  return NextResponse.json({ pending: count ?? 0 });
}

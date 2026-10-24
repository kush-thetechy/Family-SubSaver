import { NextResponse } from "next/server";
import { checkoutSessionCutoff } from "@/lib/session-retention";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Daily Vercel cron. Deletes checkout sessions past retention. Requires the cron secret. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  const { error, count } = await createSupabaseAdminClient()
    .from("checkout_sessions")
    .delete({ count: "exact" })
    .lt("created_at", checkoutSessionCutoff());
  if (error) return new NextResponse(null, { status: 500 });
  return NextResponse.json({ deleted: count ?? 0 });
}

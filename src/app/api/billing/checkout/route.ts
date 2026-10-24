import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing";
import { canStartCheckout, createDodoCheckout, getDodoEnv, getDodoMode } from "@/lib/dodo";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!getBillingConfig().enabled) return NextResponse.json({ error: "Checkout is not open." }, { status: 404 });
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canStartCheckout(data.user.id)) return NextResponse.json({ error: "Checkout is not open." }, { status: 404 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "Checkout is unavailable." }, { status: 503 });
  try {
    const { checkoutUrl, sessionId } = await createDodoCheckout(
      { userId: data.user.id, returnUrl: `${appUrl}/pricing` },
      getDodoEnv()
    );
    // Remember the session we created so a payment can only be credited to the user it was made for.
    const admin = createSupabaseAdminClient();
    // Retention: a session only matters until its payment webhook arrives. Drop anything older than 7 days.
    await admin
      .from("checkout_sessions")
      .delete()
      .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    const { error } = await admin
      .from("checkout_sessions")
      .insert({ session_id: sessionId, user_id: data.user.id, mode: getDodoMode() });
    if (error) return NextResponse.json({ error: "Checkout is unavailable." }, { status: 503 });
    return NextResponse.json({ checkoutUrl });
  } catch {
    return NextResponse.json({ error: "Checkout is unavailable." }, { status: 503 });
  }
}

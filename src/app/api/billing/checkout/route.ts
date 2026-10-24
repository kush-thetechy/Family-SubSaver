import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing";
import { createDodoCheckout, getDodoEnv } from "@/lib/dodo";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!getBillingConfig().enabled) return NextResponse.json({ error: "Checkout is not open." }, { status: 404 });
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "Checkout is unavailable." }, { status: 503 });
  try {
    const { checkoutUrl } = await createDodoCheckout(
      { userId: data.user.id, returnUrl: `${appUrl}/pricing` },
      getDodoEnv()
    );
    return NextResponse.json({ checkoutUrl });
  } catch {
    return NextResponse.json({ error: "Checkout is unavailable." }, { status: 503 });
  }
}

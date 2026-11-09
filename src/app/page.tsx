import { DashboardHome } from "@/components/DashboardHome";
import { PublicLanding } from "@/components/PublicLanding";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  alternates: { canonical: "/" },
};

export default async function Page() {
  // Demo deployments keep the demo dashboard as the homepage.
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true") {
    return <DashboardHome />;
  }
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? <DashboardHome /> : <PublicLanding />;
  } catch {
    // Auth unavailable or misconfigured: show the public homepage rather than erroring.
    return <PublicLanding />;
  }
}

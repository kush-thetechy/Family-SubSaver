import PayButton from "@/components/PayButton";
import { computeEntitlement, getBillingConfig, type Milestone } from "@/lib/billing";
import { canStartCheckout, getDodoMode } from "@/lib/dodo";
import { livePaidAt } from "@/lib/payments";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/** Signed-in payment control. In test mode it is visible only to listed test users and says so. */
export default async function PaySection() {
  if (!getBillingConfig().enabled || !isSupabaseConfigured) return null;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !canStartCheckout(data.user.id)) return null;
  const mode = getDodoMode();
  const { data: rows } = await supabase.from("payments").select("provider_payment_id, status, mode, paid_at");
  const paidAt = livePaidAt(rows ?? []);
  const { data: ms } = await supabase.from("usage_milestones").select("kind, first_at, live_subscriptions_seen");
  const ent = computeEntitlement((ms ?? []) as Milestone[], paidAt, getBillingConfig());
  if (mode === "live" && paidAt) return <p>Paid on {new Date(paidAt).toLocaleDateString("en-IN")}. Thank you.</p>;
  const { count: pending } = await createSupabaseAdminClient()
    .from("unmatched_payments")
    .select("provider_payment_id", { count: "exact", head: true })
    .eq("claimed_user_id", data.user.id)
    .eq("mode", mode)
    .is("resolved_at", null);
  if (pending) return <p>Your payment was received and is waiting for a quick manual check. It has not failed.</p>;
  const status =
    ent.state === "trial" ? `Free period: ${ent.daysLeft} day(s) left.` :
    ent.state === "fee_due" ? "Free period ended. Nothing is blocked; the Rs 60 payment is due when checkout opens." :
    ent.state === "not_started" ? "Free period starts the first time a scan or import shows your live subscriptions." : null;
  return (
    <div>
      {status ? <p>{status}</p> : null}
      {mode === "test" ? <p>Owner test checkout: simulated payment, no real money moves and it does not unlock anything.</p> : null}
      <PayButton label={mode === "test" ? "Test checkout (Rs 60, simulated)" : "Pay Rs 60"} />
    </div>
  );
}

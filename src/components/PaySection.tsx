import PayButton from "@/components/PayButton";
import { getBillingConfig } from "@/lib/billing";
import { canStartCheckout, getDodoMode } from "@/lib/dodo";
import { livePaidAt } from "@/lib/payments";
import { isSupabaseConfigured } from "@/lib/supabase";
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
  if (mode === "live" && paidAt) return <p>Paid on {new Date(paidAt).toLocaleDateString("en-IN")}. Thank you.</p>;
  return (
    <div>
      {mode === "test" ? <p>Owner test checkout: simulated payment, no real money moves and it does not unlock anything.</p> : null}
      <PayButton label={mode === "test" ? "Test checkout (Rs 60, simulated)" : "Pay Rs 60"} />
    </div>
  );
}

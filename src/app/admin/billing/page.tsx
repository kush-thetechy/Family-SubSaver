import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDodoEnv, getDodoMode } from "@/lib/dodo";
import { fetchDodoPayment, isBillingAdmin, reconcileProblem, sessionConfirmedAtDodo, type UnmatchedRow } from "@/lib/reconcile";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<string> {
  const { data } = await createSupabaseServerClient().auth.getUser();
  if (!data.user || !isBillingAdmin(data.user.id)) notFound();
  return data.user.id;
}

async function resolvePayment(formData: FormData) {
  "use server";
  await requireAdmin();
  const paymentId = String(formData.get("payment_id") ?? "");
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("unmatched_payments")
    .select("provider_payment_id, claimed_user_id, checkout_session_id, mode, amount_minor, currency")
    .eq("provider_payment_id", paymentId)
    .is("resolved_at", null)
    .maybeSingle();
  if (!row || row.mode !== getDodoMode()) return; // only this environment's rows
  const detail = await fetchDodoPayment(paymentId, getDodoEnv());
  if (!detail || reconcileProblem(row as UnmatchedRow, detail)) return;
  if (!(await sessionConfirmedAtDodo(row.checkout_session_id as string, paymentId, getDodoEnv()))) return;
  const { data: profile } = await admin.from("profiles").select("id").eq("id", row.claimed_user_id).maybeSingle();
  if (!profile) return;
  const { data: existing } = await admin.from("payments").select("provider_payment_id").eq("provider_payment_id", paymentId).maybeSingle();
  if (!existing) {
    const paidAt = typeof detail.created_at === "string" && !Number.isNaN(Date.parse(detail.created_at)) ? detail.created_at : new Date().toISOString();
    const { error } = await admin.from("payments").insert({
      user_id: row.claimed_user_id,
      provider: "dodo",
      provider_payment_id: paymentId,
      checkout_session_id: row.checkout_session_id,
      mode: row.mode,
      amount_minor: row.amount_minor,
      currency: row.currency,
      status: "paid",
      paid_at: paidAt,
    });
    if (error) return;
  }
  await admin.from("unmatched_payments").update({ resolved_at: new Date().toISOString() }).eq("provider_payment_id", paymentId);
  revalidatePath("/admin/billing");
}

export default async function AdminBillingPage() {
  await requireAdmin();
  const { data: rows } = await createSupabaseAdminClient()
    .from("unmatched_payments")
    .select("provider_payment_id, claimed_user_id, checkout_session_id, mode, amount_minor, currency, reason, created_at")
    .is("resolved_at", null)
    .order("created_at");
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Payments needing review</h1>
      <p>Mode: {getDodoMode()}. Resolving re-checks the payment at Dodo (status, amount, currency, user, session) before crediting.</p>
      {(rows ?? []).length === 0 ? <p>Nothing needs review.</p> : null}
      {(rows ?? []).map((r) => (
        <form key={r.provider_payment_id} action={resolvePayment} style={{ borderTop: "1px solid #ccc", padding: "12px 0" }}>
          <input type="hidden" name="payment_id" value={r.provider_payment_id} />
          <div>{r.provider_payment_id} ({r.mode}, {r.reason})</div>
          <div>User {r.claimed_user_id}, session {r.checkout_session_id}, {r.amount_minor} {r.currency}, {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
          <button type="submit" style={{ marginTop: 8, padding: "6px 12px", border: "1px solid #4f46e5", borderRadius: 6, background: "#4f46e5", color: "#fff" }} disabled={r.mode !== getDodoMode()}>Verify with Dodo and credit</button>
        </form>
      ))}
    </main>
  );
}

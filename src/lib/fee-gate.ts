import {
  FEE_GATE_MESSAGE,
  computeEntitlement,
  getBillingConfig,
  isNewCaptureBlocked,
  type EntitlementState,
  type Milestone,
} from "@/lib/billing";
import { livePaidAt, type PaymentRow } from "@/lib/payments";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export interface FeeGateAssessment {
  blocked: boolean;
  message: string | null;
  entitlement: EntitlementState;
}

const OPEN: FeeGateAssessment = { blocked: false, message: null, entitlement: { state: "billing_disabled" } };

/**
 * Soft trial gate for the signed-in user. DISABLED unless NEXT_PUBLIC_FEE_GATE_ENABLED=true
 * (and billing is enabled). When on, it blocks only NEW capture - Gmail scans and OCR
 * imports - after the free period ends unpaid. Viewing, exporting and deleting existing
 * data are never gated. Read failures fail OPEN: a gate bug must never lock anyone out.
 */
export async function assessFeeGate(userId: string): Promise<FeeGateAssessment> {
  const config = getBillingConfig();
  if (!config.feeGateEnabled || !isSupabaseConfigured) return OPEN;
  try {
    const supabase = createSupabaseServerClient();
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("provider_payment_id, status, mode, paid_at");
    if (paymentsError) throw paymentsError;
    const { data: milestones, error: milestonesError } = await supabase
      .from("usage_milestones")
      .select("kind, first_at, live_subscriptions_seen");
    if (milestonesError) throw milestonesError;
    const entitlement = computeEntitlement(
      (milestones ?? []) as Milestone[],
      livePaidAt((payments ?? []) as PaymentRow[]),
      config
    );
    const blocked = isNewCaptureBlocked(entitlement, config);
    return { blocked, message: blocked ? FEE_GATE_MESSAGE : null, entitlement };
  } catch (error) {
    console.error("Fee gate check failed open for user", userId, error);
    return OPEN;
  }
}

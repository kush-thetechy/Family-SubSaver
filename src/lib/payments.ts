export interface PaymentRow {
  provider_payment_id: string;
  status: string;
  mode: string;
  paid_at: string | null;
}

/** Only a LIVE, non-refunded paid row grants the paid state. Test rows never do. */
export function livePaidAt(rows: PaymentRow[]): string | null {
  const paid = rows.filter((r) => r.mode === "live" && r.status === "paid" && r.paid_at);
  if (paid.length === 0) return null;
  return paid.map((r) => r.paid_at as string).sort()[0];
}

/** Decides what a new payment event does to an existing row. Never moves paid or refunded back to failed. */
export function nextStatus(existing: string | null, incoming: "paid" | "failed"): "paid" | "failed" | "refunded" | null {
  if (!existing) return incoming;
  if (existing === "refunded") return null;
  if (existing === "paid") return null;
  return incoming; // failed -> paid or failed -> failed
}

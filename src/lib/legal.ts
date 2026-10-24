/**
 * Public policy pages are OFF until the owner supplies the operator identity, a contact
 * address and (for refunds) a window. Nothing here invents a legal entity or a commitment.
 */
export interface LegalConfig {
  operator: string;
  contact: string;
  refundDays: number | null;
  priceRupees: number;
  billingLive: boolean;
}

export function getLegalConfig(env: Record<string, string | undefined> = process.env): LegalConfig | null {
  const operator = env.NEXT_PUBLIC_OPERATOR_NAME?.trim();
  const contact = env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (env.NEXT_PUBLIC_LEGAL_PAGES_ENABLED !== "true" || !operator || !contact) return null;
  const days = Number(env.NEXT_PUBLIC_REFUND_WINDOW_DAYS);
  return {
    operator,
    contact,
    refundDays: Number.isFinite(days) && days >= 0 && env.NEXT_PUBLIC_REFUND_WINDOW_DAYS ? Math.floor(days) : null,
    priceRupees: 60,
    // Live only when the owner switches live mode on; test-mode checkout never counts as open.
    billingLive: env.NEXT_PUBLIC_BILLING_ENABLED === "true" && env.NEXT_PUBLIC_BILLING_LIVE === "true",
  };
}

export const PUBLIC_LEGAL_PATHS = ["/privacy", "/terms", "/pricing", "/refunds", "/contact"];

/**
 * Retention for checkout_sessions. A row only exists so a payment event can be matched to the
 * user it was made for. Dodo sessions are valid 24 hours and failed webhooks are retried for about a
 * day, and a merchant can replay failed events for up to 2 weeks, so rows are kept 30 days.
 * A payment event arriving after that is not credited automatically and needs manual reconciliation.
 */
export const CHECKOUT_SESSION_RETENTION_DAYS = 30;

export function checkoutSessionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - CHECKOUT_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

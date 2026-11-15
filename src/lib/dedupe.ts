import { normalizeServiceName } from "@/lib/connectors/gmail-service";
import type { BillingCycle, Subscription } from "@/types";

/** Comparable form of a service name: "Claude Pro Subscription" and "claude pro subscription" agree. */
export function serviceKey(name: string): string {
  return normalizeServiceName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Names match after normalizing both sides the same way. */
export function isSameService(a: string, b: string): boolean {
  const ka = serviceKey(a);
  return ka.length > 0 && ka === serviceKey(b);
}

interface Comparable {
  service_name: string;
  amount_paise: number;
  billing_cycle: BillingCycle | "unknown";
}

/**
 * The same subscription recorded twice: same service, same price, same billing cycle.
 * A different price or cycle is treated as a possibly separate plan, never merged silently.
 */
export function isSameSubscription(a: Comparable, b: Comparable): boolean {
  return (
    isSameService(a.service_name, b.service_name) &&
    a.amount_paise === b.amount_paise &&
    a.billing_cycle === b.billing_cycle
  );
}

/** The active entry in `existing` that this one would duplicate, if any. */
export function findExistingCopy(
  candidate: Comparable,
  existing: Subscription[],
  payerId: string
): Subscription | undefined {
  return existing.find(
    (sub) => sub.is_active && sub.payer_id === payerId && isSameSubscription(sub, candidate)
  );
}

/**
 * Extra copies among one person's active entries: for each group of identical entries the
 * oldest is kept and the rest are returned. Other people's shared entries are never included.
 */
export function findExtraCopies(subs: Subscription[], payerId: string): Subscription[] {
  const groups = new Map<string, Subscription[]>();
  for (const sub of subs) {
    if (!sub.is_active || sub.payer_id !== payerId) continue;
    const key = `${serviceKey(sub.service_name)}|${sub.amount_paise}|${sub.billing_cycle}`;
    const list = groups.get(key) ?? [];
    list.push(sub);
    groups.set(key, list);
  }
  const extras: Subscription[] = [];
  for (const list of Array.from(groups.values())) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((x, y) => (x.created_at || "").localeCompare(y.created_at || ""));
    extras.push(...sorted.slice(1));
  }
  return extras;
}

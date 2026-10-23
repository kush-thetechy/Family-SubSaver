export type BillingCycle =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "annual"
  | "prepaid"
  | "one_time";

export type SubscriptionCategory =
  | "ott"
  | "music"
  | "ai"
  | "cloud"
  | "telecom"
  | "gaming"
  | "news"
  | "utilities"
  | "fitness"
  | "other";

export type VisibilityLevel = "full_details" | "totals_only" | "hidden";

export type MemberRole = "owner" | "admin" | "member";

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: MemberRole;
  name: string;
  email: string;
  joined_at: string;
  status: "active" | "invited";
}

export interface Subscription {
  id: string;
  household_id: string;
  service_name: string;
  plan_name?: string;
  category: SubscriptionCategory;
  billing_cycle: BillingCycle;
  amount_paise: number; // Stored in integer paise (e.g. 49900 = ₹499.00)
  validity_days?: number; // For prepaid plans (e.g., 28 days, 84 days)
  payer_id: string; // Member who pays
  user_ids: string[]; // Members who use the service
  billing_channel?: string; // e.g. "UPI AutoPay", "Credit Card", "App Store", "Direct"
  renewal_date?: string; // YYYY-MM-DD
  is_active: boolean;
  visibility: VisibilityLevel;
  source: "manual" | "import" | "demo";
  source_type?: "manual" | "screenshot" | "gmail";
  source_connection_id?: string;
  imported_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type RecommendationState =
  | "confirmed_estimate" // Material eligibility, price, capacity checked & positive
  | "potential_saving" // Plausible option exists but material input needed
  | "compare_only"; // Overlap exists, but equivalence/eligibility unconfirmed

export interface SavingsRecommendation {
  id: string;
  title: string;
  category: SubscriptionCategory;
  state: RecommendationState;
  potential_monthly_savings_paise: number;
  current_monthly_spend_paise: number;
  proposed_monthly_spend_paise?: number;
  evidence: string[];
  assumptions: string[];
  uncertainties: string[];
  source_urls?: { label: string; url: string }[];
  verification_date?: string;
  involved_subscription_ids: string[];
  suggested_action: string;
  disclaimer: string;
}

export interface ReceiptImportItem {
  id: string;
  service_name: string;
  plan_name?: string;
  amount_paise: number;
  billing_cycle: BillingCycle;
  renewal_date?: string;
  category: SubscriptionCategory;
  confidence: number; // 0 to 1
  raw_detected_text?: string;
  is_duplicate_warning?: boolean;
}

export interface CatalogService {
  id: string;
  name: string;
  category: SubscriptionCategory;
  icon: string;
  official_website: string;
  terms_url: string;
  verified_on: string;
  plans: {
    name: string;
    billing_cycle: BillingCycle;
    amount_paise: number;
    user_limit: number;
    notes?: string;
  }[];
  sharing_policy_notes: string;
}

export type DiscoveryEvidenceType =
  | "store_receipt"
  | "merchant_invoice"
  | "mandate_registration"
  | "pre_debit_notice"
  | "transaction_alert"
  | "payment_failure"
  | "cancellation_notice"
  | "service_event"
  | "mandate_revocation"
  | "refund"
  | "screenshot_ocr";

export interface DiscoveryEvidence {
  id: string;
  source: "gmail" | "screenshot" | "sms";
  evidence_type: DiscoveryEvidenceType;
  message_id?: string;
  sender?: string;
  subject?: string;
  date?: string; // ISO date or email date
  renewal_date?: string;
  amount_rupees?: number;
  currency: string; // e.g. "INR"
  billing_channel?: string;
  merchant_raw?: string;
  plan_name?: string;
  frequency_raw?: string;
  mandate_id?: string;
  max_amount_rupees?: number;
  order_id?: string;
  last4?: string;
  /** Account the evidence belongs to (email, username, workspace). Never merge accounts by name alone. */
  account_ref?: string;
  summary: string;
}

export type CandidateSubscriptionStatus =
  | "likely_active"
  | "needs_confirmation"
  | "cancelled_or_expired"
  | "payment_failed";

/** Whether the person can use the service now. Separate from whether it will renew. */
export type AccessState = "active" | "active_until_period_end" | "ended" | "unknown";
/** Whether the next renewal is expected. Separate from access. */
export type RenewalState = "renewing" | "cancelled" | "payment_failed" | "unknown";
export type MandateState = "none" | "registered" | "revoked";

export interface ConsolidatedSubscriptionCandidate {
  access_state?: AccessState;
  renewal_state?: RenewalState;
  mandate_state?: MandateState;
  /** Last day of paid access when known or inferred from a payment and billing cycle. */
  access_end_date?: string;
  /** Distinct payments after merging duplicate receipts, debits and forwarded copies. */
  payment_count?: number;
  /** false when no price was ever found. Unknown is never zero. */
  price_known?: boolean;
  id: string;
  service_name: string;
  plan_name?: string;
  category: SubscriptionCategory;
  amount_rupees?: number;
  currency: string;
  billing_cycle: BillingCycle | "unknown";
  billing_channel: string;
  status: CandidateSubscriptionStatus;
  renewal_date?: string;
  renewal_date_inferred?: boolean;
  charge_date?: string;
  mandate_details?: {
    mandate_id?: string;
    max_amount_rupees?: number;
    start_date?: string;
    end_date?: string;
    frequency?: string;
    card_last4?: string;
  };
  payer_hint?: string;
  confidence: number;
  needs_review_reasons: string[];
  evidence: DiscoveryEvidence[];
  is_possible_duplicate?: boolean;
  duplicate_matches?: {
    existing_sub_id?: string;
    service_name: string;
    reason: string;
  }[];
}

export type GmailHistoryRange = "30d" | "45d" | "13m";

export type GmailCoverageLaneStatus =
  | "complete"
  | "truncated"
  | "failed"
  | "not_started";

export interface GmailScanLaneCoverage {
  key: string;
  label: string;
  status: GmailCoverageLaneStatus;
  pagesFetched: number;
  messagesMatched: number;
  uniqueMessagesSelected: number;
  errorStatus?: number;
}

export interface GmailScanCoverage {
  id?: string;
  historyRange: GmailHistoryRange;
  windowStart: string;
  windowEnd: string;
  pagesFetched: number;
  messagesMatched: number;
  uniqueMessagesSelected: number;
  messagesAttempted: number;
  messagesFetched: number;
  messageFetchFailures: number;
  paginationComplete: boolean;
  truncated: boolean;
  attachmentsScanned: false;
  laneCoverage: GmailScanLaneCoverage[];
  fatalErrorStatus?: number;
  recorded?: boolean;
  createdAt?: string;
}

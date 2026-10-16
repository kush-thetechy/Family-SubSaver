import { BillingCycle, SubscriptionCategory } from "@/types";
import { rupeesToPaise } from "../calculations";
import { INDIAN_SUBSCRIPTION_CATALOG } from "../catalog";

export interface ParsedSmsResult {
  service_name: string;
  amount_paise: number;
  amount_rupees: number;
  billing_cycle: BillingCycle;
  category: SubscriptionCategory;
  billing_channel: string;
  detected_date?: string;
  confidence: number;
  raw_sms: string;
  source_bank?: string;
  notes?: string;
}

const KNOWN_MERCHANTS: {
  keywords: string[];
  service_name: string;
  category: SubscriptionCategory;
  default_cycle: BillingCycle;
}[] = [
  {
    keywords: ["netflix"],
    service_name: "Netflix",
    category: "ott",
    default_cycle: "monthly",
  },
  {
    keywords: ["spotify"],
    service_name: "Spotify",
    category: "music",
    default_cycle: "monthly",
  },
  {
    keywords: ["hotstar", "disney", "novi digital"],
    service_name: "Disney+ Hotstar",
    category: "ott",
    default_cycle: "annual",
  },
  {
    keywords: ["prime video", "amazon prime", "amzn prime"],
    service_name: "Amazon Prime Video",
    category: "ott",
    default_cycle: "annual",
  },
  {
    keywords: ["google one", "google storage", "google *google one"],
    service_name: "Google One",
    category: "cloud",
    default_cycle: "annual",
  },
  {
    keywords: ["youtube premium", "google *youtube"],
    service_name: "YouTube Premium",
    category: "music",
    default_cycle: "monthly",
  },
  {
    keywords: ["apple.com/bill", "apple services", "itunes"],
    service_name: "Apple Services",
    category: "cloud",
    default_cycle: "monthly",
  },
  {
    keywords: ["openai", "chatgpt"],
    service_name: "ChatGPT Plus",
    category: "ai",
    default_cycle: "monthly",
  },
  {
    keywords: ["anthropic", "claude"],
    service_name: "Claude Pro",
    category: "ai",
    default_cycle: "monthly",
  },
  {
    keywords: ["airtel", "bharti airtel"],
    service_name: "Airtel Postpaid",
    category: "telecom",
    default_cycle: "monthly",
  },
  {
    keywords: ["jio", "reliance jio"],
    service_name: "JioFiber / Mobile",
    category: "telecom",
    default_cycle: "monthly",
  },
  {
    keywords: ["sonyliv"],
    service_name: "SonyLIV",
    category: "ott",
    default_cycle: "annual",
  },
  {
    keywords: ["zee5"],
    service_name: "Zee5",
    category: "ott",
    default_cycle: "annual",
  },
];

const BANK_NAMES = [
  "HDFC Bank",
  "ICICI Bank",
  "SBI",
  "Axis Bank",
  "Kotak Bank",
  "IndusInd Bank",
  "Paytm Bank",
  "PhonePe",
  "Google Pay",
  "Razorpay",
  "CRED",
];

/**
 * Parses Indian Bank & UPI transactional SMS text.
 * Extracts merchant, debited amount, channel (UPI/Card/AutoPay), and date.
 */
export function parseBankSms(smsText: string): ParsedSmsResult | null {
  if (!smsText || typeof smsText !== "string") return null;

  const text = smsText.trim();
  const lower = text.toLowerCase();

  // 1. Detect Amount (e.g. Rs. 649.00, Rs 119, INR 899, ₹1,199, Rs.1499)
  const amountRegex =
    /(?:(?:rs\.?|inr|₹)\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹))/i;
  const amountMatch = text.match(amountRegex);

  let amountRupees = 0;
  if (amountMatch) {
    const rawAmountStr = (amountMatch[1] || amountMatch[2]).replace(/,/g, "");
    amountRupees = parseFloat(rawAmountStr);
  }

  if (isNaN(amountRupees) || amountRupees <= 0) {
    return null;
  }

  // 2. Detect Merchant / Service Name
  let detectedService = "Recurring Subscription";
  let detectedCategory: SubscriptionCategory = "other";
  let detectedCycle: BillingCycle = "monthly";
  let confidence = 0.5;

  for (const item of KNOWN_MERCHANTS) {
    if (item.keywords.some((k) => lower.includes(k))) {
      detectedService = item.service_name;
      detectedCategory = item.category;
      detectedCycle = item.default_cycle;
      confidence = 0.95;
      break;
    }
  }

  // If merchant not in known list, try extracting "towards X" or "to X" or "BIL*X"
  if (confidence === 0.5) {
    const merchantMatch =
      text.match(/(?:towards|to|at|vpa|bil\*)\s+([A-Za-z0-9\s._-]+?)(?:\s+on|\s+via|\s+ref|\.|\,|$)/i);
    if (merchantMatch && merchantMatch[1]) {
      const candidate = merchantMatch[1].trim();
      if (candidate.length > 2 && !candidate.toLowerCase().includes("account")) {
        detectedService = candidate.toUpperCase();
        confidence = 0.7;
      }
    }
  }

  // 3. Detect Billing Channel
  let channel = "Bank Debit";
  if (lower.includes("autopay") || lower.includes("mandate")) {
    channel = "UPI AutoPay";
  } else if (lower.includes("upi")) {
    channel = "UPI";
  } else if (lower.includes("credit card") || lower.includes("card ending")) {
    channel = "Credit Card";
  } else if (lower.includes("debit card")) {
    channel = "Debit Card";
  } else if (lower.includes("netbanking") || lower.includes("transfer")) {
    channel = "Net Banking";
  }

  // 4. Detect Bank
  let detectedBank: string | undefined;
  for (const b of BANK_NAMES) {
    if (text.toLowerCase().includes(b.toLowerCase())) {
      detectedBank = b;
      break;
    }
  }

  // 5. Detect Date (e.g. 15-OCT-26, 15/10/2026, 15-10-26)
  const dateRegex =
    /\b(\d{1,2}[-/](?:[a-zA-Z]{3}|\d{1,2})[-/](?:\d{4}|\d{2}))\b/;
  const dateMatch = text.match(dateRegex);
  let detectedDate: string | undefined;

  if (dateMatch) {
    detectedDate = dateMatch[1];
  }

  return {
    service_name: detectedService,
    amount_paise: rupeesToPaise(amountRupees),
    amount_rupees: amountRupees,
    billing_cycle: detectedCycle,
    category: detectedCategory,
    billing_channel: channel,
    detected_date: detectedDate,
    confidence,
    raw_sms: text,
    source_bank: detectedBank,
    notes: detectedBank ? `Extracted from ${detectedBank} SMS notification` : "Extracted from SMS notification",
  };
}

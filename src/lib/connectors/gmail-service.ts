import { BillingCycle, SubscriptionCategory, Subscription } from "@/types";
import {
  ConsolidatedSubscriptionCandidate,
  DiscoveryEvidence,
  DiscoveryEvidenceType,
  CandidateSubscriptionStatus,
  GmailHistoryRange,
  GmailScanCoverage,
  GmailScanLaneCoverage,
} from "@/types";
import { rupeesToPaise } from "../calculations";

export const MAX_GMAIL_SCANS_PER_DAY = 5;

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
}

export interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

interface ServiceDescriptor {
  name: string;
  category: SubscriptionCategory;
  keywords: string[];
}

export const KNOWN_SERVICES: ServiceDescriptor[] = [
  { name: "Netflix", category: "ott", keywords: ["netflix"] },
  { name: "Spotify", category: "music", keywords: ["spotify"] },
  { name: "Perplexity", category: "ai", keywords: ["perplexity"] },
  { name: "Google AI Pro", category: "ai", keywords: ["google ai pro"] },
  { name: "Truecaller", category: "utilities", keywords: ["truecaller"] },
  { name: "Proton VPN", category: "utilities", keywords: ["proton vpn", "protonvpn"] },
  { name: "Speechify", category: "utilities", keywords: ["speechify"] },
  { name: "Brilliant", category: "utilities", keywords: ["brilliant.org", "brilliant premium"] },
  { name: "Loom", category: "utilities", keywords: ["loom business", "loom.com"] },
  { name: "Lovable", category: "utilities", keywords: ["lovable.dev", "lovable labs"] },
  { name: "Wispr Flow", category: "utilities", keywords: ["wispr flow"] },
  { name: "NBA League Pass", category: "gaming", keywords: ["nba league pass"] },
  { name: "V2T Whisper", category: "utilities", keywords: ["v2t", "whisper ai transcription"] },
  { name: "ExpressVPN", category: "utilities", keywords: ["expressvpn"] },
  { name: "Zomato Gold", category: "other", keywords: ["zomato gold"] },
  {
    name: "Disney+ Hotstar",
    category: "ott",
    keywords: ["hotstar", "disney plus", "disney+"],
  },
  { name: "YouTube Premium", category: "ott", keywords: ["youtube premium"] },
  { name: "Apple One", category: "ott", keywords: ["apple one"] },
  { name: "iCloud+", category: "cloud", keywords: ["icloud+"] },
  { name: "Google One", category: "cloud", keywords: ["google one"] },
  { name: "ChatGPT", category: "ai", keywords: ["chatgpt"] },
  { name: "OpenAI", category: "ai", keywords: ["openai"] },
  { name: "Claude", category: "ai", keywords: ["claude.ai", "anthropic"] },
  { name: "Apple", category: "other", keywords: ["apple.com", "apple services", "apple store"] },
  { name: "Amazon Prime Video", category: "ott", keywords: ["prime video", "amazon prime"] },
  { name: "Airtel", category: "telecom", keywords: ["airtel"] },
  { name: "Jio", category: "telecom", keywords: ["jio"] },
  { name: "SonyLIV", category: "ott", keywords: ["sonyliv"] },
  { name: "Zee5", category: "ott", keywords: ["zee5"] },
  { name: "Todoist", category: "utilities", keywords: ["todoist", "doist inc"] },
  { name: "Duolingo", category: "utilities", keywords: ["duolingo"] },
  { name: "Cult.fit", category: "fitness", keywords: ["cult.fit", "cult fit", "curefit"] },
  { name: "Strava", category: "fitness", keywords: ["strava"] },
  { name: "Notion", category: "utilities", keywords: ["notion"] },
  { name: "Microsoft 365", category: "utilities", keywords: ["microsoft 365", "office 365", "microsoft subscription"] },
  { name: "Adobe", category: "utilities", keywords: ["adobe", "creative cloud"] },
  { name: "Dropbox", category: "cloud", keywords: ["dropbox"] },
  { name: "Canva", category: "utilities", keywords: ["canva"] },
  { name: "Grammarly", category: "utilities", keywords: ["grammarly"] },
  { name: "LinkedIn Premium", category: "utilities", keywords: ["linkedin premium"] },
  { name: "Audible", category: "ott", keywords: ["audible"] },
  { name: "Zoom", category: "utilities", keywords: ["zoom"] },
  { name: "Xbox Game Pass", category: "gaming", keywords: ["xbox game pass", "game pass"] },
  { name: "iCloud", category: "cloud", keywords: ["icloud"] },
];

export function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export function getBodyText(part: GmailMessagePart): string[] {
  const maxDepth = 8;
  const maxParts = 100;
  const maxTextLength = 256_000;
  const pending: Array<{ part: GmailMessagePart; depth: number }> = [
    { part, depth: 0 },
  ];
  const textParts: string[] = [];
  let visitedParts = 0;
  let totalTextLength = 0;

  while (
    pending.length > 0 &&
    visitedParts < maxParts &&
    totalTextLength < maxTextLength
  ) {
    const current = pending.pop();
    if (!current || current.depth > maxDepth) continue;
    visitedParts += 1;

    const currentPart = current.part;
    const isAttachment = Boolean(
      currentPart.filename || currentPart.body?.attachmentId
    );
    if (
      !isAttachment &&
      currentPart.body?.data &&
      (currentPart.mimeType === "text/plain" ||
        currentPart.mimeType === "text/html" ||
        !currentPart.mimeType)
    ) {
      const remainingLength = maxTextLength - totalTextLength;
      const decodedText = decodeBase64Url(currentPart.body.data).slice(
        0,
        remainingLength
      );
      textParts.push(decodedText);
      totalTextLength += decodedText.length;
    }

    const children = currentPart.parts ?? [];
    const remainingSlots = Math.max(
      0,
      maxParts - visitedParts - pending.length
    );
    const childCount = Math.min(children.length, remainingSlots);
    for (let childIndex = childCount - 1; childIndex >= 0; childIndex -= 1) {
      pending.push({
        part: children[childIndex],
        depth: current.depth + 1,
      });
    }
  }
  return textParts;
}

export function getHeader(headers: GmailHeader[] = [], name: string): string {
  const target = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === target)?.value ?? "";
}

/**
 * Clean HTML while preserving table/block boundaries.
 * Converting </td>, </th>, </tr> to spaces/newlines prevents words and numbers
 * across different table columns from colliding into ambiguous text.
 */
export function cleanHtmlText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8377;|&inr;/gi, "₹")
    .replace(/&#(\d+);/g, (_, code: string) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch {
        return "";
      }
    })
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Zero-width spaces
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/**
 * Normalizes service names so e.g. "Doist Inc." becomes "Todoist",
 * "Netflix Entertainment Services India" becomes "Netflix".
 */
export function normalizeServiceName(rawName: string): string {
  const clean = rawName.trim();
  const lower = clean.toLowerCase();

  for (const service of KNOWN_SERVICES) {
    if (service.keywords.some((kw) => lower.includes(kw))) {
      return service.name;
    }
  }

  // Strip generic corporate suffixes
  return clean
    .replace(/\s+(entertainment|services|technologies|private|ltd|limited|india|inc|corp)\b/gi, "")
    .trim() || clean;
}

export function inferCategory(serviceName: string, text: string): SubscriptionCategory {
  const combined = `${serviceName} ${text}`.toLowerCase();
  for (const service of KNOWN_SERVICES) {
    if (service.keywords.some((kw) => combined.includes(kw))) {
      return service.category;
    }
  }

  if (/\b(netflix|hotstar|prime video|sonyliv|zee5|hulu|disney|cinema|movie|tv|stream|ott)\b/.test(combined)) {
    return "ott";
  }
  if (/\b(spotify|gaana|wynk|apple music|jiosaavn|youtube music|podcast|audio|sound|music)\b/.test(combined)) {
    return "music";
  }
  if (/\b(chatgpt|openai|claude|anthropic|midjourney|copilot|perplexity|ai)\b/.test(combined)) {
    return "ai";
  }
  if (/\b(google one|icloud|dropbox|onedrive|drive|cloud|storage)\b/.test(combined)) {
    return "cloud";
  }
  if (/\b(airtel|jio|vi |vodafone|bsnl|telecom|recharge|prepaid|postpaid)\b/.test(combined)) {
    return "telecom";
  }
  if (/\b(strava|cult\.fit|cult fit|fitbit|gym|fitness|workout|health|runkeeper|myfitnesspal)\b/.test(combined)) {
    return "fitness";
  }
  if (/\b(xbox|playstation|nintendo|steam|game pass|gaming)\b/.test(combined)) {
    return "gaming";
  }
  if (/\b(times of india|the hindu|wsj|nyt|newspaper|news|economist|bloomberg)\b/.test(combined)) {
    return "news";
  }
  return "utilities";
}

/**
 * Extracts explicit INR amounts. Never treats an unrecognized amount as INR
 * unless an explicit ₹, INR, or Rs indicator is present.
 */
export function findInrAmount(text: string): number | undefined {
  const amountPattern = /(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)/gi;
  let match: RegExpExecArray | null;
  while ((match = amountPattern.exec(text)) !== null) {
    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return undefined;
}

/**
 * Strictly identifies billing cycles. If no clear indicator is present,
 * returns "unknown" rather than silently defaulting to monthly.
 */
export function extractBillingCycle(text: string): BillingCycle | "unknown" {
  const lower = text.toLowerCase();
  if (/\b(half[- ]yearly|semi[- ]annual|6[- ]month|every 6 months)\b/.test(lower)) {
    return "half_yearly";
  }
  if (/\b(quarterly|every 3 months|3[- ]month)\b/.test(lower)) {
    return "quarterly";
  }
  if (/\b(annual(?:ly)?|yearly|per year|\/year|\/yr|12[- ]months?|1[- ]year)\b/.test(lower)) {
    return "annual";
  }
  if (/\b(monthly|per month|\/month|\/mo|every month|1[- ]month)\b/.test(lower)) {
    return "monthly";
  }
  if (/\b(prepaid|recharge)\b/.test(lower)) {
    return "prepaid";
  }
  return "unknown";
}

export function parseDateToIso(dateStr: string): string | undefined {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return undefined;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return undefined;
  }
}

function parseAppleRenewalDate(
  renewalText: string,
  emailDate: string
): string | undefined {
  if (/\b\d{4}\b/.test(renewalText)) {
    return parseDateToIso(renewalText);
  }

  const emailDateIso = parseDateToIso(emailDate);
  if (!emailDateIso) return undefined;

  const emailYear = Number(emailDateIso.slice(0, 4));
  const renewalDate = parseDateToIso(`${renewalText} ${emailYear}`);
  if (!renewalDate) return undefined;

  return renewalDate <= emailDateIso
    ? parseDateToIso(`${renewalText} ${emailYear + 1}`)
    : renewalDate;
}

export function addCycleToDate(isoDate: string, cycle: BillingCycle | "unknown"): string {
  if (cycle === "unknown") return isoDate;
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return isoDate;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));

  if (cycle === "annual") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else if (cycle === "half_yearly") {
    date.setUTCMonth(date.getUTCMonth() + 6);
  } else if (cycle === "quarterly") {
    date.setUTCMonth(date.getUTCMonth() + 3);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================================================
// Specialized Parsers for Required References
// ============================================================================

/**
 * 1. Google Play Order Receipt Parser
 * Reference: Todoist Pro - Monthly, ₹330/month, GPA.3371-..., UPI: GPay.
 */
export function parseGooglePlayEmail(
  message: GmailMessage,
  cleanText: string,
  subject: string,
  sender: string,
  emailDate: string
): DiscoveryEvidence | null {
  const isPlay =
    sender.toLowerCase().includes("googleplay-noreply@google.com") ||
    sender.toLowerCase().includes("google play") ||
    subject.toLowerCase().includes("google play") ||
    (cleanText.toLowerCase().includes("google play") &&
      (cleanText.includes("GPA.") || cleanText.toLowerCase().includes("order receipt")));

  if (!isPlay) return null;

  // Extract Order ID
  const gpaMatch = cleanText.match(/GPA\.(\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d+)?)/i);
  const orderId = gpaMatch ? `GPA.${gpaMatch[1]}` : undefined;

  // Extract raw item string
  let rawItem = "";
  const itemPriceMatch = cleanText.match(
    /(?:Item\s+Price\s+)(.+?)(?=\s+(?:(?:Total:\s*)?(?:₹|Rs\.?|INR)|Auto-renewing|\d+\s*item))/i
  );
  if (itemPriceMatch && itemPriceMatch[1].trim()) {
    rawItem = itemPriceMatch[1].trim();
  } else {
    const itemPlayMatch = cleanText.match(
      /([^\n\r]+?)(?=\s+1\s+item\s+from\s+Google\s+Play)/i
    );
    if (itemPlayMatch && itemPlayMatch[1].trim()) {
      rawItem = itemPlayMatch[1].trim();
    }
  }

  let serviceName = "";
  let planName: string | undefined;

  if (rawItem) {
    const parenMatch = rawItem.match(/^(.+?)\s*\((.+?)\)$/);
    if (parenMatch) {
      const partBefore = parenMatch[1].trim();
      const partInside = parenMatch[2].trim();

      if (/[:–-]/.test(partInside)) {
        // e.g. "Todoist: To Do List & Calendar" -> "Todoist"
        serviceName = normalizeServiceName(partInside.split(/[:–-]/)[0].trim());
        planName = partBefore;
      } else {
        serviceName = normalizeServiceName(partBefore);
        planName = partInside;
      }
    } else {
      planName = rawItem;
      serviceName = normalizeServiceName(rawItem);
    }
  }

  if (!serviceName) {
    const devMatch = cleanText.match(/Your\s+subscription\s+from\s+([^.]+?)\s+on\s+Google\s+Play/i);
    if (devMatch && devMatch[1].trim()) {
      serviceName = normalizeServiceName(devMatch[1].trim());
    } else {
      serviceName = "Google Play App";
    }
  }

  // Extract Amount and Interval
  const priceMatches = [
    ...cleanText.matchAll(
      /(?:Total:\s*)?(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)(?:\s*\/\s*(month|year|annual|yr|quarter|half[- ]year|week))?/gi
    ),
  ];

  let amountRupees: number | undefined;
  let cycleFromPrice: BillingCycle | undefined;

  for (const m of priceMatches) {
    const val = Number(m[1].replace(/,/g, ""));
    if (m[2]) {
      amountRupees = val;
      const unit = m[2].toLowerCase();
      if (unit.startsWith("year") || unit === "yr" || unit === "annual") {
        cycleFromPrice = "annual";
      } else if (unit.startsWith("quarter")) {
        cycleFromPrice = "quarterly";
      } else if (unit.includes("half")) {
        cycleFromPrice = "half_yearly";
      } else {
        cycleFromPrice = "monthly";
      }
      break;
    }
    if (!amountRupees && Number.isFinite(val) && val > 0) {
      amountRupees = val;
    }
  }

  if (!amountRupees) {
    amountRupees = findInrAmount(cleanText);
  }
  if (!amountRupees) return null;

  // Billing Channel / Payment Method
  let billingChannel = "Google Play";
  const paymentMatch = cleanText.match(
    /Payment\s+method:\s*([^\n\r]+?)(?=\s*(?:Play Points|By subscribing|Keep this|Order date|Your account|Questions|\(Includes GST|$))/i
  );
  if (paymentMatch && paymentMatch[1].trim()) {
    billingChannel = `Google Play (${paymentMatch[1].trim()})`;
  }

  // Order Date
  const orderDateMatch = cleanText.match(
    /Order\s+date:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i
  );
  const subjDateMatch = subject.match(
    /(?:from\s+)?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i
  );
  const dateStr = orderDateMatch?.[1] || subjDateMatch?.[1] || emailDate;
  const isoOrderDate = dateStr ? parseDateToIso(dateStr) : undefined;

  const cycle = cycleFromPrice ?? extractBillingCycle(`${planName ?? ""} ${cleanText}`);

  return {
    id: `gmail-play-${message.id}`,
    source: "gmail",
    evidence_type: "store_receipt",
    message_id: message.id,
    sender,
    subject,
    date: isoOrderDate || parseDateToIso(emailDate),
    amount_rupees: amountRupees,
    currency: "INR",
    billing_channel: billingChannel,
    merchant_raw: serviceName,
    plan_name: planName,
    frequency_raw: cycle !== "unknown" ? cycle : undefined,
    order_id: orderId,
    summary: `Google Play order receipt for ${serviceName}${planName ? ` (${planName})` : ""}: ₹${amountRupees}${cycle !== "unknown" ? `/${cycle}` : ""}.`,
  };
}

/**
 * 2. Apple Receipt Parser
 * Reference: Subject "Your receipt from Apple", YouTube Premium (Monthly), Renews 28 October,
 * Gross recurring amount: ₹195.00, Subtotal: ₹165.25, IGST: ₹29.75.
 * Crucial rule: MUST NOT mistake subtotal or IGST for the price!
 */
export function parseAppleReceipt(
  message: GmailMessage,
  cleanText: string,
  subject: string,
  sender: string,
  emailDate: string
): DiscoveryEvidence | null {
  const isApple =
    sender.toLowerCase().includes("apple.com") ||
    subject.toLowerCase().includes("receipt from apple") ||
    subject.toLowerCase().includes("invoice from apple") ||
    cleanText.toLowerCase().includes("your receipt from apple");

  if (!isApple) return null;

  // Look for items with renewal text
  // e.g. "YouTube Premium (Monthly)\nRenews 28 October" or "Renews 28 October 2026"
  const itemMatch = cleanText.match(
    /([^\n\r]+?(?:\((?:monthly|annual|yearly|quarterly|individual|family|student)\))?)\s*\n\s*Renews\s+(\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?)/i
  );

  let rawItem = "";
  let renewalText = "";
  if (itemMatch) {
    rawItem = itemMatch[1].trim();
    renewalText = itemMatch[2].trim();
  } else {
    // Check general item line before price
    const genericItemMatch = cleanText.match(
      /([A-Za-z0-9+.\s]+?(?:\((?:Monthly|Annual|Yearly)\))?)\s+(?:Renews|Total|₹|Rs\.?)/i
    );
    if (genericItemMatch) rawItem = genericItemMatch[1].trim();
  }

  // Avoid treating one-time Apple purchases as subscriptions merely because
  // the standard receipt footer mentions subscription settings.
  const hasRecurringItemSignal = Boolean(itemMatch) ||
    /\b(monthly|annual|yearly|quarterly|weekly|subscription)\b/i.test(rawItem);
  if (!hasRecurringItemSignal) return null;

  let serviceName = "Apple Subscription";
  let planName: string | undefined;

  if (rawItem) {
    const parenMatch = rawItem.match(/^(.+?)\s*\((.+?)\)$/);
    if (parenMatch) {
      serviceName = normalizeServiceName(parenMatch[1].trim());
      planName = parenMatch[2].trim();
    } else {
      serviceName = normalizeServiceName(rawItem);
    }
  }

  // Robust Apple amount extraction:
  // Must extract the final charged Total / Gross amount, avoiding Subtotal or GST/IGST!
  let amountRupees: number | undefined;

  // Pattern for Total / Charged (strictly not preceded by sub)
  const totalMatch =
    cleanText.match(/(?<!sub)\btotal:\s*(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)/i) ||
    cleanText.match(/\b(?:amount charged|billed to card|gross amount):\s*(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)/i);
  if (totalMatch) {
    amountRupees = Number(totalMatch[1].replace(/,/g, ""));
  }

  if (!amountRupees) {
    // If no explicit "Total:" prefix, scan amounts but skip any preceded by Subtotal or IGST/CGST/tax
    const lines = cleanText.split("\n");
    for (const line of lines) {
      if (/subtotal|igst|cgst|sgst|tax/i.test(line)) continue;
      const amt = findInrAmount(line);
      if (amt) {
        amountRupees = amt;
        break;
      }
    }
  }

  if (!amountRupees) {
    amountRupees = findInrAmount(cleanText);
  }
  if (!amountRupees) return null;

  const cycle = extractBillingCycle(`${rawItem} ${cleanText}`);

  return {
    id: `gmail-apple-${message.id}`,
    source: "gmail",
    evidence_type: "store_receipt",
    message_id: message.id,
    sender,
    subject,
    date: parseDateToIso(emailDate),
    renewal_date: renewalText
      ? parseAppleRenewalDate(renewalText, emailDate)
      : undefined,
    amount_rupees: amountRupees,
    currency: "INR",
    billing_channel: "Apple",
    merchant_raw: serviceName,
    plan_name: planName,
    frequency_raw: cycle !== "unknown" ? cycle : undefined,
    summary: `Apple App Store receipt for ${serviceName}${planName ? ` (${planName})` : ""}: ₹${amountRupees}${renewalText ? `, renews ${renewalText}` : ""}.`,
  };
}

/**
 * 3. HDFC / Bank E-Mandate Registration Parser
 * Reference: E-mandate (Auto payment), Current transaction amount ₹490,
 * Maximum transaction amount ₹15,000 (cap, NOT price!), Frequency: Monthly,
 * SI Hub ID, Card last 4: 4412.
 */
export function parseBankMandateEmail(
  message: GmailMessage,
  cleanText: string,
  subject: string,
  sender: string,
  emailDate: string
): DiscoveryEvidence | null {
  const lower = `${subject} ${cleanText}`.toLowerCase();
  const isMandate =
    lower.includes("e-mandate") ||
    lower.includes("standing instruction") ||
    lower.includes("si hub") ||
    lower.includes("autopay registered") ||
    lower.includes("mandate registration");

  if (!isMandate) return null;

  // Current Transaction Amount (Subscription price candidate)
  let currentAmount: number | undefined;
  const currentAmtMatch = cleanText.match(
    /(?:Current\s+transaction\s+amount|Transaction\s+amount|Debited\s+amount|Charge\s+amount):\s*(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)/i
  );
  if (currentAmtMatch) {
    currentAmount = Number(currentAmtMatch[1].replace(/,/g, ""));
  }

  // Maximum Transaction Amount / Cap
  let maxAmount: number | undefined;
  const maxAmtMatch = cleanText.match(
    /(?:Maximum\s+transaction\s+amount|Mandate\s+limit|Max\s+amount):\s*(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)/i
  );
  if (maxAmtMatch) {
    maxAmount = Number(maxAmtMatch[1].replace(/,/g, ""));
  }

  // Fallback: If current amount not explicitly labelled, pick the smaller amount if max amount is present
  if (!currentAmount) {
    const allAmounts = [
      ...cleanText.matchAll(/(?:₹|INR|Rs\.?)\s*([0-9][\d,]*(?:\.\d{1,2})?)/gi),
    ].map((m) => Number(m[1].replace(/,/g, "")));

    if (maxAmount && allAmounts.length > 1) {
      currentAmount = allAmounts.find((a) => a !== maxAmount && a < maxAmount);
    } else if (allAmounts.length > 0) {
      currentAmount = allAmounts[0];
    }
  }

  // Merchant Descriptor
  let merchantRaw = "";
  const merchantMatch = cleanText.match(
    /(?:Merchant|Provider|Company|Payee|Biller)\s*(?:Name)?:\s*([^\n\r]+)/i
  );
  if (merchantMatch) {
    merchantRaw = merchantMatch[1].trim();
  } else {
    // Search known services in text
    for (const svc of KNOWN_SERVICES) {
      if (svc.keywords.some((kw) => lower.includes(kw))) {
        merchantRaw = svc.name;
        break;
      }
    }
  }
  if (!merchantRaw) merchantRaw = "E-Mandate Merchant";

  // Card Last 4
  let last4: string | undefined;
  const cardMatch = cleanText.match(/(?:Card|Account)\s*(?:ending\s+with|ending|no\.?)?\s*[*Xx]*(\d{4})/i);
  if (cardMatch) {
    last4 = cardMatch[1];
  }

  // Mandate ID / SI Hub ID
  let mandateId: string | undefined;
  const siMatch = cleanText.match(/(?:SI\s*Hub\s*ID|Mandate\s*(?:Reference|ID|No\.?)|URN):\s*([A-Za-z0-9_-]+)/i);
  if (siMatch) {
    mandateId = siMatch[1].trim();
  }

  // Frequency
  let frequencyRaw: string | undefined;
  const freqMatch = cleanText.match(/Frequency:\s*([^\n\r]+)/i);
  if (freqMatch) {
    frequencyRaw = freqMatch[1].trim();
  }

  const bankName = lower.includes("hdfc")
    ? "HDFC Bank"
    : lower.includes("icici")
      ? "ICICI Bank"
      : lower.includes("sbi")
        ? "SBI"
        : lower.includes("axis")
          ? "Axis Bank"
          : "Bank";

  return {
    id: `gmail-mandate-${message.id}`,
    source: "gmail",
    evidence_type: "mandate_registration",
    message_id: message.id,
    sender,
    subject,
    date: parseDateToIso(emailDate),
    amount_rupees: currentAmount,
    currency: "INR",
    billing_channel: `${bankName} E-Mandate${last4 ? ` (Card •••• ${last4})` : ""}`,
    merchant_raw: merchantRaw,
    frequency_raw: frequencyRaw,
    mandate_id: mandateId,
    max_amount_rupees: maxAmount,
    last4,
    summary: `${bankName} E-mandate registered for ${merchantRaw}: current debit ₹${currentAmount ?? "unspecified"}${maxAmount ? ` (max cap ₹${maxAmount})` : ""}${frequencyRaw ? `, frequency: ${frequencyRaw}` : ""}.`,
  };
}

/**
 * 4. General Inbound Parser (Direct Merchant Invoices, Transaction Alerts, Pre-Debits, Failures, Cancellations)
 */
export function parseGeneralGmailMessage(
  message: GmailMessage
): DiscoveryEvidence | null {
  const payload = message.payload;
  const headers = payload?.headers ?? [];
  const subject = getHeader(headers, "subject") || "Subscription email";
  const sender = getHeader(headers, "from") || "Unknown sender";
  const emailDate = getHeader(headers, "date");

  const rawBody = [subject, message.snippet, ...getBodyText(payload ?? {})]
    .filter(Boolean)
    .join("\n");
  const clean = cleanHtmlText(rawBody);
  const lower = clean.toLowerCase();

  // 1. Check Google Play
  const playEvidence = parseGooglePlayEmail(message, clean, subject, sender, emailDate);
  if (playEvidence) return playEvidence;

  // 2. Check Apple
  const appleEvidence = parseAppleReceipt(message, clean, subject, sender, emailDate);
  if (appleEvidence) return appleEvidence;
  if (
    sender.toLowerCase().includes("apple.com") ||
    subject.toLowerCase().includes("receipt from apple") ||
    subject.toLowerCase().includes("invoice from apple")
  ) {
    return null;
  }

  // 3. Check Bank E-Mandate
  const mandateEvidence = parseBankMandateEmail(message, clean, subject, sender, emailDate);
  if (mandateEvidence) return mandateEvidence;

  // 4. Classify Evidence Type
  let evidenceType: DiscoveryEvidenceType = "merchant_invoice";

  if (/\b(cancelled|canceled|subscription ended|membership expired|cancellation confirmation)\b/i.test(lower)) {
    evidenceType = "cancellation_notice";
  } else if (/\b(payment failed|declined|unsuccessful payment|action required|auto-renewal failed)\b/i.test(lower)) {
    evidenceType = "payment_failure";
  } else if (/\b(pre-debit|upcoming debit|scheduled to debit|auto-debit alert)\b/i.test(lower)) {
    evidenceType = "pre_debit_notice";
  } else if (/\b(debited|spent|transacted|transaction alert)\b/i.test(lower) && !/\binvoice\b/i.test(lower)) {
    evidenceType = "transaction_alert";
  } else if (hasAnyKeyword(lower, SERVICE_LIFECYCLE_KEYWORDS)) {
    evidenceType = "service_event";
  }

  // Find Service
  let matchedService: string | undefined;
  for (const svc of KNOWN_SERVICES) {
    if (svc.keywords.some((kw) => lower.includes(kw))) {
      matchedService = svc.name;
      break;
    }
  }

  // Find Amount (explicit INR)
  const amountRupees = findInrAmount(clean);
  if (
    !amountRupees &&
    evidenceType !== "cancellation_notice" &&
    evidenceType !== "service_event"
  ) {
    return null;
  }

  if (!matchedService) {
    if (evidenceType === "service_event") return null;
    const merchantMatch = clean.match(/(?:at|to|for|towards|merchant:?)\s+([A-Za-z0-9&.\s]{3,30})(?:\s+on|\s+via|\s+ref|\s+dated|$)/i);
    if (merchantMatch && merchantMatch[1].trim()) {
      matchedService = normalizeServiceName(merchantMatch[1].trim());
    } else {
      matchedService = "Subscription Service";
    }
  }

  const cycle = extractBillingCycle(clean);

  return {
    id: `gmail-gen-${message.id}`,
    source: "gmail",
    evidence_type: evidenceType,
    message_id: message.id,
    sender,
    subject,
    date: parseDateToIso(emailDate),
    amount_rupees: amountRupees,
    currency: "INR",
    billing_channel: "Direct Email Invoice",
    merchant_raw: matchedService,
    frequency_raw: cycle !== "unknown" ? cycle : undefined,
    summary: `${matchedService} email notice (${evidenceType.replace(/_/g, " ")}): ${amountRupees ? `₹${amountRupees}` : "amount unknown"}${cycle !== "unknown" ? `/${cycle}` : ""}.`,
  };
}

// ============================================================================
// Cross-Source Consolidation & Deduplication Engine
// ============================================================================

/**
 * Consolidates multiple discovery evidence items (receipts, mandates, debits, cancellations)
 * into unified, deduped subscription candidates with attached evidence history.
 */
export function consolidateEvidenceToCandidates(
  evidenceList: DiscoveryEvidence[],
  existingSubscriptions: Subscription[] = []
): ConsolidatedSubscriptionCandidate[] {
  const candidateMap = new Map<string, ConsolidatedSubscriptionCandidate>();

  for (const ev of evidenceList) {
    const normService = normalizeServiceName(ev.merchant_raw || ev.summary);
    // Keep distinct store/direct subscriptions separate, but merge a bank
    // mandate into a matching store receipt for the same known service.
    const channelFamily = ev.billing_channel?.toLowerCase().includes("play")
      ? "google_play"
      : ev.billing_channel?.toLowerCase().includes("apple")
        ? "apple"
        : "direct";

    const exactKey = `${normService.toLowerCase()}_${channelFamily}`;
    const matchingCrossChannelKey = Array.from(candidateMap.entries()).find(
      ([, candidate]) =>
        candidate.service_name.toLowerCase() === normService.toLowerCase() &&
        ((ev.evidence_type === "mandate_registration" &&
          candidate.evidence.some((evidence) => evidence.evidence_type === "store_receipt")) ||
          (ev.evidence_type === "store_receipt" &&
            candidate.evidence.some((evidence) => evidence.evidence_type === "mandate_registration") &&
            !candidate.evidence.some((evidence) => evidence.evidence_type === "store_receipt")))
    )?.[0];
    const key = matchingCrossChannelKey ?? exactKey;

    if (!candidateMap.has(key)) {
      const cycle: BillingCycle | "unknown" =
        (ev.frequency_raw as BillingCycle | undefined) || "unknown";
      let status: CandidateSubscriptionStatus = "needs_confirmation";

      if (ev.evidence_type === "store_receipt") {
        status = "likely_active";
      } else if (ev.evidence_type === "cancellation_notice") {
        status = "cancelled_or_expired";
      } else if (ev.evidence_type === "payment_failure") {
        status = "payment_failed";
      }

      // Check renewal date
      let renewalDate = ev.renewal_date;
      let renewalInferred = false;
      if (!renewalDate && ev.date && cycle !== "unknown") {
        renewalDate = addCycleToDate(ev.date, cycle);
        renewalInferred = true;
      }

      const needsReview: string[] = [];
      if (cycle === "unknown") {
        needsReview.push("Billing cycle is unknown and needs confirmation");
      }
      if (!ev.amount_rupees) {
        needsReview.push("Price is unknown; confirm the current amount before saving");
      }
      if (ev.evidence_type === "mandate_registration") {
        needsReview.push("Mandate registered; confirm if service is currently active");
        if (ev.max_amount_rupees && ev.amount_rupees && ev.max_amount_rupees > ev.amount_rupees) {
          needsReview.push(`Mandate maximum cap is ₹${ev.max_amount_rupees}, recurring amount is ₹${ev.amount_rupees}`);
        }
      }

      candidateMap.set(key, {
        id: `cand-${normService.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`,
        service_name: normService,
        plan_name: ev.plan_name || (ev.merchant_raw !== normService ? ev.merchant_raw : undefined),
        category: inferCategory(normService, ev.summary),
        amount_rupees: ev.amount_rupees,
        currency: "INR",
        billing_cycle: cycle,
        billing_channel: ev.billing_channel || "Email receipt",
        status,
        renewal_date: renewalDate,
        renewal_date_inferred: renewalInferred,
        charge_date: ev.date,
        mandate_details: ev.mandate_id || ev.max_amount_rupees ? {
          mandate_id: ev.mandate_id,
          max_amount_rupees: ev.max_amount_rupees,
          frequency: ev.frequency_raw,
          card_last4: ev.last4,
        } : undefined,
        confidence:
          ev.evidence_type === "store_receipt"
            ? 0.95
            : ev.evidence_type === "service_event"
              ? 0.7
              : 0.85,
        needs_review_reasons: needsReview,
        evidence: [ev],
      });
    } else {
      // Merge with existing candidate
      const cand = candidateMap.get(key)!;
      cand.evidence.push(ev);

      if (
        (ev.evidence_type === "mandate_registration" &&
          cand.evidence.some((evidence) => evidence.evidence_type === "store_receipt")) ||
        (ev.evidence_type === "store_receipt" &&
          cand.evidence.some((evidence) => evidence.evidence_type === "mandate_registration"))
      ) {
        const duplicateNote = "Bank mandate may be payment evidence for this app-store subscription; review both sources together";
        if (!cand.needs_review_reasons.includes(duplicateNote)) {
          cand.needs_review_reasons.push(duplicateNote);
        }
      }

      if (!cand.plan_name && ev.plan_name) {
        cand.plan_name = ev.plan_name;
      }

      // Upgrade amount if candidate had 0 or was undefined
      if (
        (!cand.amount_rupees || cand.amount_rupees <= 0) &&
        ev.amount_rupees &&
        ev.amount_rupees > 0
      ) {
        cand.amount_rupees = ev.amount_rupees;
      }

      // Upgrade billing cycle if candidate was unknown
      if (cand.billing_cycle === "unknown" && ev.frequency_raw && ev.frequency_raw !== "unknown") {
        cand.billing_cycle = ev.frequency_raw as BillingCycle;
        if (!ev.renewal_date && cand.charge_date) {
          cand.renewal_date = addCycleToDate(cand.charge_date, cand.billing_cycle);
          cand.renewal_date_inferred = true;
        }
        cand.needs_review_reasons = cand.needs_review_reasons.filter(
          (r) => !r.includes("Billing cycle is unknown")
        );
      }

      if (ev.renewal_date) {
        cand.renewal_date = ev.renewal_date;
        cand.renewal_date_inferred = false;
      }

      // If a cancellation notice arrives, update status
      if (ev.evidence_type === "cancellation_notice") {
        cand.status = "cancelled_or_expired";
        cand.needs_review_reasons.push("Cancellation notice received");
      }

      // Attach mandate details if present
      if (ev.mandate_id || ev.max_amount_rupees) {
        cand.mandate_details = {
          mandate_id: ev.mandate_id || cand.mandate_details?.mandate_id,
          max_amount_rupees: ev.max_amount_rupees || cand.mandate_details?.max_amount_rupees,
          frequency: ev.frequency_raw || cand.mandate_details?.frequency,
          card_last4: ev.last4 || cand.mandate_details?.card_last4,
        };
      }
    }
  }

  // Cross-reference with existing subscriptions in the household
  const results = Array.from(candidateMap.values());
  for (const cand of results) {
    const matchedExisting = existingSubscriptions.filter(
      (sub) =>
        sub.is_active &&
        normalizeServiceName(sub.service_name).toLowerCase() ===
          cand.service_name.toLowerCase()
    );

    if (matchedExisting.length > 0) {
      cand.is_possible_duplicate = true;
      cand.duplicate_matches = matchedExisting.map((m) => ({
        existing_sub_id: m.id,
        service_name: m.service_name,
        reason: `Service already exists in household subscriptions (${m.service_name}: ₹${m.amount_paise / 100}/${m.billing_cycle}).`,
      }));
      cand.needs_review_reasons.push(
        `Already exists in household (${matchedExisting[0].service_name})`
      );
    }
  }

  return results;
}

// ============================================================================
// Multi-Lane Paginated Scanner Engine
// ============================================================================

export interface ScanOptions {
  historyRange?: GmailHistoryRange;
  existingSubscriptions?: Subscription[];
}

export const MAX_GMAIL_MESSAGES_PER_SCAN = 200;
const MAX_GMAIL_PAGES_PER_LANE = 100;

export function normalizeGmailHistoryRange(value?: unknown): GmailHistoryRange {
  return value === "30d" || value === "13m" ? value : "45d";
}

export function getGmailHistoryRangeLabel(range: GmailHistoryRange): string {
  if (range === "13m") return "13 months";
  return range === "30d" ? "30 days" : "45 days";
}

export function getGmailHistoryWindow(
  range: GmailHistoryRange,
  now = new Date()
): { start: Date; end: Date } {
  const end = new Date(now);
  if (range !== "13m") {
    const days = range === "30d" ? 30 : 45;
    return { start: new Date(end.getTime() - days * 24 * 60 * 60 * 1000), end };
  }

  const start = new Date(end);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 13);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)
  ).getUTCDate();
  start.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return { start, end };
}

const STORE_SUBSCRIPTION_KEYWORDS = [
  "subscription",
  "auto-renewing",
  "auto-renew",
  "renewal",
  "renewed",
  "renews",
  "monthly",
  "annual",
];

const SUBSCRIPTION_EVENT_KEYWORDS = [
  "subscription",
  "renewal",
  "subscription renewal",
  "subscription renewed",
  "renewed",
  "renews",
  "auto-renew",
  "auto renewal",
  "automatic renewal",
  "recurring payment",
  "recurring billing",
  "recurring charge",
  "membership renewed",
  "membership renewal",
  "cancellation confirmation",
  "subscription ended",
  "membership expired",
  "cancelled",
  "canceled",
  "payment failed",
  "auto-renewal failed",
  "trial ending",
  "trial ends",
  "trial expires",
  "next billing date",
  "next payment date",
  "next charge date",
  "upcoming renewal",
  "upcoming payment",
  "monthly plan",
  "monthly subscription",
  "annual plan",
  "annual subscription",
  "yearly plan",
  "membership",
  "activated",
  "upgraded",
  "welcome to",
  "trial started",
  "service active",
];

const BILLING_KEYWORDS = [
  "invoice",
  "receipt",
  "payment",
  "charged",
  "charge",
  "billed",
  "billing",
  "amount due",
  "payment confirmation",
  "payment failed",
  "declined",
  "cancellation confirmation",
  "subscription ended",
  "membership expired",
  "cancelled",
  "canceled",
  "paid",
  "debited",
  "transaction",
  "purchase",
  "renewal",
];

const SERVICE_LIFECYCLE_KEYWORDS = [
  "welcome to",
  "activated",
  "upgraded",
  "membership",
  "trial started",
  "trial begins",
  "plan includes",
  "service active",
  "renewed",
  "renewal",
];

const PAYMENT_ACTIVITY_KEYWORDS = [
  "paid",
  "payment",
  "debited",
  "charged",
  "purchase",
  "transaction",
  "invoice",
  "receipt",
  "renewed",
  "renewal",
];

const MANDATE_KEYWORDS = [
  "e-mandate",
  "e mandate",
  "e-nach",
  "nach mandate",
  "upi autopay",
  "ach debit",
  "mandate registration",
  "mandate registered",
  "standing instruction",
  "merchant mandate",
  "card mandate",
  "si hub",
  "autopay debit",
  "auto debit alert",
  "auto-debit alert",
  "merchant initiated transaction",
  "recurring transaction",
  "recurring debit",
  "pre-debit",
  "pre debit",
  "scheduled debit",
];

const KNOWN_PROVIDER_SEARCH_TERMS = Array.from(
  new Set(KNOWN_SERVICES.flatMap((service) => service.keywords))
).filter(
  (term) => !["apple.com", "apple services", "apple store"].includes(term)
);

function gmailAnyOf(terms: string[]): string {
  return `{${terms.map((term) => `"${term}"`).join(" ")}}`;
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasSubscriptionEmailKeywords(message: GmailMessage): boolean {
  const headers = message.payload?.headers ?? [];
  const searchableText = cleanHtmlText(
    [
      getHeader(headers, "from"),
      getHeader(headers, "subject"),
      message.snippet,
      ...getBodyText(message.payload ?? {}),
    ]
      .filter(Boolean)
      .join("\n")
  ).toLowerCase();

  if (hasAnyKeyword(searchableText, MANDATE_KEYWORDS)) return true;

  const mentionsKnownService = KNOWN_SERVICES.some((service) =>
    service.keywords.some((keyword) => searchableText.includes(keyword))
  );
  if (
    mentionsKnownService &&
    hasAnyKeyword(searchableText, [
      ...BILLING_KEYWORDS,
      ...SERVICE_LIFECYCLE_KEYWORDS,
    ])
  ) {
    return true;
  }

  const hasBillingSignal = hasAnyKeyword(searchableText, BILLING_KEYWORDS);
  const hasSubscriptionSignal = hasAnyKeyword(searchableText, [
    ...SUBSCRIPTION_EVENT_KEYWORDS,
    "monthly",
    "yearly",
    "annual",
    "per month",
    "per year",
  ]);

  return hasBillingSignal && hasSubscriptionSignal;
}

export async function fetchGmailJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GmailApiError(
      `Gmail API request failed with status ${response.status}.`,
      response.status
    );
  }

  const maximumResponseBytes = 2 * 1024 * 1024;
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maximumResponseBytes || !response.body) {
    throw new GmailApiError(
      "Gmail API response exceeded the processing limit.",
      413
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumResponseBytes) {
        await reader.cancel();
        throw new GmailApiError(
          "Gmail API response exceeded the processing limit.",
          413
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new GmailApiError("Gmail API returned an invalid response.", 502);
  }
}

/**
 * Searches bounded, independent discovery lanes, records pagination coverage,
 * and parses matched message content in memory.
 */
export async function searchGmailMultiLane(
  accessToken: string,
  options: ScanOptions = {}
): Promise<{
  candidates: ConsolidatedSubscriptionCandidate[];
  totalMessagesScanned: number;
  lanesScanned: string[];
  warnings: string[];
  coverage: GmailScanCoverage;
  fatalErrorStatus?: number;
}> {
  const historyRange = normalizeGmailHistoryRange(options.historyRange);
  const historyWindow = getGmailHistoryWindow(historyRange);
  const cutoffTime = historyWindow.start.getTime();
  const dateFilter =
    historyRange === "13m"
      ? `after:${historyWindow.start.toISOString().slice(0, 10).replace(/-/g, "/")} -in:spam -in:trash `
      : `newer_than:${historyRange === "30d" ? 30 : 45}d -in:spam -in:trash `;
  const billingTerms = gmailAnyOf(BILLING_KEYWORDS);
  const recurringTerms = gmailAnyOf(SUBSCRIPTION_EVENT_KEYWORDS);
  const knownProviderTerms = gmailAnyOf(KNOWN_PROVIDER_SEARCH_TERMS);
  const storeTerms = gmailAnyOf(STORE_SUBSCRIPTION_KEYWORDS);
  const mandateTerms = gmailAnyOf(MANDATE_KEYWORDS);
  const lifecycleTerms = gmailAnyOf(SERVICE_LIFECYCLE_KEYWORDS);
  const paymentActivityTerms = gmailAnyOf(PAYMENT_ACTIVITY_KEYWORDS);

  const lanes = [
    {
      key: "store_receipts",
      name: "Store Receipts & Renewals",
      query: `${dateFilter}((from:googleplay-noreply@google.com OR from:no_reply@email.apple.com OR from:do_not_reply@apple.com OR subject:("Google Play Order Receipt" OR "receipt from Apple" OR "invoice from Apple")) ${storeTerms})`,
    },
    {
      key: "direct_billing",
      name: "Direct Merchant Invoices",
      query: `${dateFilter}((${recurringTerms} ${billingTerms}) OR (${knownProviderTerms} ${billingTerms} ${gmailAnyOf(["subscription", "renewal", "renewed", "recurring", "monthly", "annual", "yearly", "auto-renew"])}))`,
    },
    {
      key: "known_merchant_payments",
      name: "Known Merchant Payments",
      query: `${dateFilter}${knownProviderTerms} ${paymentActivityTerms}`,
    },
    {
      key: "merchant_lifecycle",
      name: "Memberships, Trials & Activations",
      query: `${dateFilter}${knownProviderTerms} ${lifecycleTerms}`,
    },
    {
      key: "bank_mandates",
      name: "Bank E-Mandates & Alerts",
      query: `${dateFilter}${mandateTerms}`,
    },
  ];

  const uniqueMessageIds = new Set<string>();
  const warnings: string[] = [];
  const laneCoverage: GmailScanLaneCoverage[] = lanes.map((lane) => ({
    key: lane.key,
    label: lane.name,
    status: "not_started",
    pagesFetched: 0,
    messagesMatched: 0,
    uniqueMessagesSelected: 0,
  }));

  // Run paginated list across lanes. Gmail returns IDs here; full contents are
  // fetched only after a message has matched the keyword query.
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    const laneResult = laneCoverage[laneIndex];
    try {
      let pageToken: string | undefined;
      const seenPageTokens = new Set<string>();
      while (laneResult.pagesFetched < MAX_GMAIL_PAGES_PER_LANE) {
        if (uniqueMessageIds.size >= MAX_GMAIL_MESSAGES_PER_SCAN) break;
        const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        listUrl.searchParams.set("q", lane.query);
        listUrl.searchParams.set(
          "maxResults",
          String(Math.min(100, MAX_GMAIL_MESSAGES_PER_SCAN - uniqueMessageIds.size))
        );
        if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

        const listRes = await fetchGmailJson<{
          messages?: { id: string }[];
          nextPageToken?: string;
        }>(listUrl.toString(), accessToken);
        laneResult.pagesFetched += 1;
        laneResult.messagesMatched += listRes.messages?.length ?? 0;

        if (listRes.messages) {
          for (const message of listRes.messages) {
            if (!message.id || uniqueMessageIds.has(message.id)) continue;
            uniqueMessageIds.add(message.id);
            laneResult.uniqueMessagesSelected += 1;
            if (uniqueMessageIds.size >= MAX_GMAIL_MESSAGES_PER_SCAN) break;
          }
        }
        if (uniqueMessageIds.size >= MAX_GMAIL_MESSAGES_PER_SCAN) {
          laneResult.status = listRes.nextPageToken ? "truncated" : "complete";
          break;
        }
        const nextPageToken = listRes.nextPageToken;
        if (!nextPageToken) {
          laneResult.status = "complete";
          break;
        }
        if (seenPageTokens.has(nextPageToken)) {
          laneResult.status = "truncated";
          warnings.push(`${lane.name} returned a repeated page token.`);
          break;
        }
        seenPageTokens.add(nextPageToken);
        pageToken = nextPageToken;
      }
      if (
        laneResult.status === "not_started" &&
        laneResult.pagesFetched >= MAX_GMAIL_PAGES_PER_LANE
      ) {
        laneResult.status = "truncated";
      }
    } catch (error) {
      laneResult.status = "failed";
      laneResult.errorStatus =
        error instanceof GmailApiError ? error.status : undefined;
    }
    if (uniqueMessageIds.size >= MAX_GMAIL_MESSAGES_PER_SCAN) {
      break;
    }
  }

  if (laneCoverage.some((lane) => lane.status === "failed")) {
    warnings.push(
      "Some Gmail search categories failed; coverage is incomplete."
    );
  }
  if (
    uniqueMessageIds.size >= MAX_GMAIL_MESSAGES_PER_SCAN ||
    laneCoverage.some(
      (lane) => lane.status === "truncated" || lane.status === "not_started"
    )
  ) {
    warnings.push(
      `Coverage is incomplete because the scan reached a pagination or ${MAX_GMAIL_MESSAGES_PER_SCAN}-message safety limit.`
    );
  }

  // Fetch only query-matched message contents in parallel batches of 5.
  const messageIdList = Array.from(uniqueMessageIds);
  const evidenceList: DiscoveryEvidence[] = [];
  let failedMessageFetches = 0;
  let successfulMessageFetches = 0;
  let fatalErrorStatus: number | undefined;

  for (let i = 0; i < messageIdList.length; i += 5) {
    const chunk = messageIdList.slice(i, i + 5);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        try {
          const msg = await fetchGmailJson<GmailMessage>(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
            accessToken
          );
          successfulMessageFetches += 1;
          const messageTimestamp = Number(msg.internalDate);
          if (
            !Number.isFinite(messageTimestamp) ||
            messageTimestamp < cutoffTime ||
            messageTimestamp > historyWindow.end.getTime()
          ) {
            return null;
          }
          if (!hasSubscriptionEmailKeywords(msg)) return null;
          return parseGeneralGmailMessage(msg);
        } catch (error) {
          if (
            error instanceof GmailApiError &&
            (error.status === 401 || error.status === 403)
          ) {
            fatalErrorStatus ??= error.status;
          }
          failedMessageFetches += 1;
          return null;
        }
      })
    );

    for (const ev of chunkResults) {
      if (ev) evidenceList.push(ev);
    }
    if (fatalErrorStatus) break;
  }
  if (failedMessageFetches > 0) {
    warnings.push(
      "Some matched Gmail messages could not be read; coverage is incomplete."
    );
  }
  warnings.push(
    "Attachments are not fetched or parsed; coverage applies only to searchable message content."
  );

  const candidates = consolidateEvidenceToCandidates(
    evidenceList,
    options.existingSubscriptions ?? []
  );
  const coverage: GmailScanCoverage = {
    historyRange,
    windowStart: historyWindow.start.toISOString(),
    windowEnd: historyWindow.end.toISOString(),
    pagesFetched: laneCoverage.reduce((total, lane) => total + lane.pagesFetched, 0),
    messagesMatched: laneCoverage.reduce(
      (total, lane) => total + lane.messagesMatched,
      0
    ),
    uniqueMessagesSelected: messageIdList.length,
    messagesAttempted: fatalErrorStatus ? successfulMessageFetches + failedMessageFetches : messageIdList.length,
    messagesFetched: successfulMessageFetches,
    messageFetchFailures: failedMessageFetches,
    paginationComplete:
      laneCoverage.every((lane) => lane.status === "complete") &&
      failedMessageFetches === 0 &&
      !fatalErrorStatus &&
      uniqueMessageIds.size < MAX_GMAIL_MESSAGES_PER_SCAN,
    truncated:
      uniqueMessageIds.size >= MAX_GMAIL_MESSAGES_PER_SCAN ||
      laneCoverage.some(
        (lane) => lane.status === "truncated" || lane.status === "not_started"
      ),
    attachmentsScanned: false,
    laneCoverage,
  };

  return {
    candidates,
    totalMessagesScanned: messageIdList.length,
    lanesScanned: laneCoverage
      .filter((lane) => lane.status === "complete" || lane.status === "truncated")
      .map((lane) => lane.label),
    warnings,
    coverage,
    fatalErrorStatus,
  };
}

// ============================================================================
// Comprehensive Sample Dataset for Demo / Offline Sandbox
// ============================================================================

export const SAMPLE_DISCOVERY_EVIDENCE: DiscoveryEvidence[] = [
  // 1. Google Play Todoist
  {
    id: "demo-ev-1",
    source: "gmail",
    evidence_type: "store_receipt",
    message_id: "demo-msg-todoist",
    sender: "Google Play <googleplay-noreply@google.com>",
    subject: "Your Google Play Order Receipt from 10 Oct 2026",
    date: "2026-10-10",
    amount_rupees: 330,
    currency: "INR",
    billing_channel: "Google Play (UPI: GPay)",
    merchant_raw: "Todoist Pro - Monthly (Todoist: To Do List & Calendar)",
    frequency_raw: "monthly",
    order_id: "GPA.3371-9881-7499-93667..1",
    summary: "Google Play order receipt: Todoist Pro - Monthly, ₹330/month (Order GPA.3371-9881-7499-93667..1).",
  },
  // 2. Apple Receipt - YouTube Premium
  {
    id: "demo-ev-2",
    source: "gmail",
    evidence_type: "store_receipt",
    message_id: "demo-msg-apple-yt",
    sender: "Apple <no_reply@email.apple.com>",
    subject: "Your receipt from Apple",
    date: "2026-10-05",
    amount_rupees: 195,
    currency: "INR",
    billing_channel: "Apple",
    merchant_raw: "YouTube Premium (Monthly)",
    frequency_raw: "monthly",
    summary: "Apple receipt: YouTube Premium (Monthly) ₹195.00 gross (renews 28 October; subtotal ₹165.25 + IGST ₹29.75).",
  },
  // 3. HDFC E-Mandate for Netflix
  {
    id: "demo-ev-3",
    source: "gmail",
    evidence_type: "mandate_registration",
    message_id: "demo-msg-hdfc-netflix",
    sender: "HDFC Bank <alerts@hdfcbank.net>",
    subject: "Confirmation of E-mandate (Auto payment) registration on your Debit card",
    date: "2026-10-01",
    amount_rupees: 490,
    currency: "INR",
    billing_channel: "HDFC Bank E-Mandate (Card •••• 4412)",
    merchant_raw: "NETFLIX ENTERTAINMENT SERVICES INDIA",
    frequency_raw: "Monthly",
    mandate_id: "SIHUB889123491",
    max_amount_rupees: 15000,
    last4: "4412",
    summary: "HDFC Bank E-mandate registered for NETFLIX: current debit ₹490, max cap ₹15,000, frequency: Monthly (SI Hub URN: SIHUB889123491).",
  },
  // 4. Netflix Direct Invoice
  {
    id: "demo-ev-4",
    source: "gmail",
    evidence_type: "merchant_invoice",
    message_id: "demo-msg-netflix-direct",
    sender: "Netflix <info@mailer.netflix.com>",
    subject: "Your Netflix invoice for October 2026",
    date: "2026-10-15",
    amount_rupees: 649,
    currency: "INR",
    billing_channel: "Credit Card ending 4412",
    merchant_raw: "Netflix",
    frequency_raw: "monthly",
    summary: "Direct Netflix Premium Invoice: ₹649/month billed to Card ending 4412.",
  },
  // 5. Spotify Monthly Debit Alert
  {
    id: "demo-ev-5",
    source: "gmail",
    evidence_type: "transaction_alert",
    message_id: "demo-msg-spotify-autopay",
    sender: "ICICI Bank Alerts <ibanksms@icicibank.com>",
    subject: "Transaction Alert: AutoPay debit towards Spotify India",
    date: "2026-10-12",
    amount_rupees: 119,
    currency: "INR",
    billing_channel: "UPI AutoPay (ICICI)",
    merchant_raw: "Spotify",
    frequency_raw: "monthly",
    summary: "Bank AutoPay debit: ₹119 debited towards Spotify India via UPI mandate.",
  },
];

export function getSampleConsolidatedCandidates(
  existingSubscriptions: Subscription[] = []
): ConsolidatedSubscriptionCandidate[] {
  return consolidateEvidenceToCandidates(
    SAMPLE_DISCOVERY_EVIDENCE,
    existingSubscriptions
  );
}

// Backward compatibility alias for legacy tests
export const SAMPLE_GMAIL_INVOICES = SAMPLE_DISCOVERY_EVIDENCE.map((ev) => ({
  id: ev.id,
  service_name: normalizeServiceName(ev.merchant_raw || ev.summary),
  plan_name: ev.merchant_raw,
  amount_paise: rupeesToPaise(ev.amount_rupees ?? 0),
  amount_rupees: ev.amount_rupees ?? 0,
  billing_cycle: ((ev.frequency_raw as BillingCycle) || "monthly") as BillingCycle,
  category: inferCategory(ev.merchant_raw || "", ev.summary),
  billing_channel: ev.billing_channel || "Email invoice",
  renewal_date: ev.date ? addCycleToDate(ev.date, (ev.frequency_raw as BillingCycle) || "monthly") : undefined,
  email_subject: ev.subject || "Email receipt",
  email_date: ev.date || "2026-10-10",
  email_sender: ev.sender || "demo@example.invalid",
  confidence: 0.95,
}));

export function parseGmailMessage(message: GmailMessage) {
  const ev = parseGeneralGmailMessage(message);
  if (!ev || !ev.amount_rupees) return null;
  const cycle = ((ev.frequency_raw as BillingCycle) || "monthly") as BillingCycle;
  return {
    id: ev.id,
    service_name: normalizeServiceName(ev.merchant_raw || ev.summary),
    plan_name: ev.merchant_raw,
    amount_paise: rupeesToPaise(ev.amount_rupees),
    amount_rupees: ev.amount_rupees,
    billing_cycle: cycle,
    category: inferCategory(ev.merchant_raw || "", ev.summary),
    billing_channel: ev.billing_channel || "Email invoice",
    renewal_date: ev.date ? addCycleToDate(ev.date, cycle) : undefined,
    email_subject: ev.subject,
    email_date: ev.date,
    email_sender: ev.sender,
    confidence: 0.95,
  };
}

export async function searchGmailInvoices(accessToken: string) {
  const { candidates } = await searchGmailMultiLane(accessToken);
  return candidates
    .filter(
      (candidate): candidate is ConsolidatedSubscriptionCandidate & {
        amount_rupees: number;
      } =>
        typeof candidate.amount_rupees === "number" &&
        candidate.amount_rupees > 0
    )
    .map((c) => ({
    id: c.id,
    service_name: c.service_name,
    plan_name: c.plan_name,
    amount_paise: rupeesToPaise(c.amount_rupees),
    amount_rupees: c.amount_rupees,
    billing_cycle: (c.billing_cycle === "unknown" ? "monthly" : c.billing_cycle) as BillingCycle,
    category: c.category,
    billing_channel: c.billing_channel,
    renewal_date: c.renewal_date,
    email_subject: c.evidence[0]?.subject || "Subscription invoice",
    email_date: c.charge_date || "",
    email_sender: c.evidence[0]?.sender || "",
    confidence: c.confidence,
    }));
}

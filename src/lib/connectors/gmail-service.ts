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
  { name: "Lovable", category: "utilities", keywords: ["lovable.dev", "lovable labs", "lovable"] },
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
  { name: "Swiggy One", category: "other", keywords: ["swiggy one"] },
  { name: "Cursor", category: "ai", keywords: ["cursor.com", "cursor pro", "anysphere"] },
  { name: "GitHub Copilot", category: "ai", keywords: ["github copilot"] },
  { name: "Midjourney", category: "ai", keywords: ["midjourney"] },
  { name: "Replit", category: "utilities", keywords: ["replit"] },
  { name: "Medium", category: "news", keywords: ["medium membership"] },
  { name: "Tata Play Binge", category: "ott", keywords: ["tata play", "tataplay"] },
  { name: "Google Play Pass", category: "gaming", keywords: ["google play pass"] },
  { name: "Bumble", category: "other", keywords: ["bumble"] },
  { name: "Tinder", category: "other", keywords: ["tinder"] },
  { name: "Headspace", category: "fitness", keywords: ["headspace"] },
  { name: "Calm", category: "fitness", keywords: ["calm premium"] },
  { name: "1Password", category: "utilities", keywords: ["1password"] },
  { name: "NordVPN", category: "utilities", keywords: ["nordvpn"] },
  { name: "Obsidian", category: "utilities", keywords: ["obsidian sync", "obsidian publish"] },
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
  if (isCardBillAutopay(lower)) return null;
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
/**
 * Credit-card bill payments (autopay of the statement itself) are not subscriptions.
 * Excluding them keeps card repayments out of subscription spend.
 */
export function isCardBillAutopay(text: string): boolean {
  const t = text.toLowerCase();
  const billSignal =
    /\b(credit card (bill|statement|payment)|card (bill|statement)|total amount due|minimum amount due|statement due|bill payment for (your )?card)\b/.test(t);
  const autopaySignal = /\b(autopay|auto-pay|auto debit|auto-debit|standing instruction|si )\b/.test(t);
  return billSignal && (autopaySignal || /\bcredit card\b/.test(t));
}

const REFUND_PATTERN =
  /\b(has been refunded|have refunded|we('| ha)ve refunded|refund (has been )?(initiated|processed|issued|of)|your refund|credit note|payment reversed|reversal of)\b/i;


const GENERIC_SENDER_NAMES = /^(billing|noreply|no-reply|no_reply|donotreply|do-not-reply|support|team|alerts?|info|payments?|notifications?|accounts?|receipts?|invoice|invoices|hello|care|help|admin|service|customer.?care)$/i;
const SHARED_SENDER_DOMAINS = /(^|\.)(gmail|googlemail|outlook|hotmail|yahoo|icloud|google|apple|amazon|razorpay|paytm|phonepe|npci|sendgrid|mailchimp|stripe|paypal|payu|payumoney|billdesk|cashfree|juspay|ccavenue|instamojo|cashfree|amazonpay|mobikwik|freecharge|zohocorp|intuit|squareup)\./i;

/** Best-effort merchant name from the sender: display name, else the domain label. */
const PAYMENT_PROCESSOR_NAMES = /\b(stripe|paypal|payu|payumoney|billdesk|cashfree|juspay|ccavenue|instamojo|razorpay|paytm|phonepe|amazon pay|mobikwik|freecharge|square)\b/i;

/** Names come from untrusted email text: keep letters, digits and a few safe symbols, cap length. */
export function sanitizeServiceLabel(raw: string): string | undefined {
  const cleaned = raw.replace(/[^A-Za-z0-9&.' -]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  if (!/[A-Za-z]{3}/.test(cleaned)) return undefined;
  // A sentence-like display name is more likely an instruction than a service name.
  if (cleaned.split(" ").length > 5) return undefined;
  return cleaned;
}

export function merchantFromSender(sender: string): string | undefined {
  const raw = merchantFromSenderRaw(sender);
  if (!raw) return undefined;
  return sanitizeServiceLabel(raw);
}

function merchantFromSenderRaw(sender: string): string | undefined {
  const m = sender.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const display = (m ? m[1] : "").trim();
  const addr = (m ? m[2] : sender).trim().toLowerCase();
  const [local, domain = ""] = addr.split("@");
  if (/bank|alerts?\b|upi|nach|mandate/i.test(`${domain} ${local} ${display}`)) return undefined;
  if (PAYMENT_PROCESSOR_NAMES.test(display)) return undefined;
  if (display && !GENERIC_SENDER_NAMES.test(display) && /[A-Za-z]{3}/.test(display) && !/@/.test(display)) {
    return normalizeServiceName(display.replace(/\b(billing|team|support|notifications?|receipts?|no-?reply)\b/gi, "").trim() || display);
  }
  if (!domain || SHARED_SENDER_DOMAINS.test(`${domain}.`)) return undefined;
  const parts = domain.split(".");
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (!label || label.length < 3) return undefined;
  return normalizeServiceName(label.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
}


// --- Precision gate for generic (non-store, non-bank) messages -------------------------------
// A generic message becomes payment evidence only when it reads like a transaction: a receipt or
// payment phrase, and an amount tied to payment words. Newsletters, job alerts and campus mail
// that merely mention a brand or a rupee figure are not evidence.
const RECEIPT_SIGNAL =
  /\b(receipt|tax invoice|invoice (?:no|number|#|for|from|is)|payment (?:successful|received|confirmation|confirmed|of|made)|order (?:confirmation|confirmed|summary|#)|thank you for (?:your )?(?:payment|purchase|order|subscribing)|you(?:'ve| have) (?:paid|been charged)|amount (?:paid|charged|debited|due)|(?:has|have) been (?:charged|debited)|we(?:'ve| have) received your payment|(?:subscription|membership|plan) (?:has been |was |is )?(?:renewed|confirmed|started|activated|will renew|renews)|auto-?renew|(?:₹|inr|rs\.?)\s*[0-9][\d,]*(?:\.\d{1,2})?\s+(?:has been |was )?(?:debited|charged|paid|deducted)|(?:debited|charged|deducted) (?:from|with|by|via)|upi (?:autopay|txn|transaction|payment|mandate)|billed (?:for|at|monthly|annually|yearly|every)|your (?:next )?(?:billing|renewal) date)\b/i;
const AMOUNT_LABEL_NEAR =
  /(?:total|amount|paid|charged|charge|price|billed|payment|debited|credited|refunded?|plan|subtotal|due|renews?|renewal)[^\n]{0,40}(?:₹|inr|rs\.?)\s*[0-9]|(?:₹|inr|rs\.?)\s*[0-9][\d,]*(?:\.\d{1,2})?[^\n]{0,40}(?:paid|charged|billed|debited|refunded|per (?:month|year)|\/(?:mo|month|yr|year)|only|total)/i;
const NON_PAYMENT_AMOUNT =
  /(?:stipend|salary|ctc|lpa|prize|reimburs|scholarship|bounty|funding|valuation|crore|lakh|billion|million|hiring|internship|per month!)/i;

function headerPresent(headers: GmailHeader[] | undefined, name: string): boolean {
  return Boolean(getHeader(headers ?? [], name));
}

/** True when the sender looks like an individual's mailbox (first.last@org) rather than a merchant. */
export function looksLikePersonSender(sender: string): boolean {
  const m = sender.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const display = (m ? m[1] : "").trim();
  const addr = (m ? m[2] : sender).trim().toLowerCase();
  const local = addr.split("@")[0] ?? "";
  const personLocal = /^[a-z]{2,}(?:[._-][a-z]{1,})+\d{0,4}$/.test(local) && !/(billing|support|noreply|no-reply|receipt|invoice|payment|team|care|help|info|hello|admin|club|office|ops|alerts?)/.test(local);
  const twoWords = /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(display);
  return personLocal || (twoWords && /^[a-z]+\d{0,4}$/.test(local) && !/(billing|support|team|care|help|info|hello)/.test(local));
}

/** A known-service keyword counts only in the sender or subject, or right after a payee phrase. */
function keywordIsPayee(keyword: string, sender: string, subject: string, clean: string): boolean {
  const k = keyword.toLowerCase();
  if (sender.toLowerCase().includes(k) || subject.toLowerCase().includes(k)) return true;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:paid to|payment to|merchant:?|billed by|invoice from|receipt from|order from|subscription to|your)\\s+${escaped}\\b`, "i").test(clean);
}

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

  if (isCardBillAutopay(`${subject}\n${clean}`)) return null;

  // Mandate revoked: changes the bank authorisation only, never the access state.
  if (
    /\b(e-?mandate|autopay|standing instruction|si hub)\b/.test(lower) &&
    /\b(revoked|revocation|de-?registered|mandate (has been )?(cancelled|canceled|removed|deleted))\b/.test(lower)
  ) {
    const svc = KNOWN_SERVICES.find((x) => x.keywords.some((kw) => lower.includes(kw)));
    const named = clean.match(/(?:Merchant|Biller|Payee)\s*(?:Name)?:\s*([^\n\r]+)/i)?.[1]?.trim();
    const mandateId = clean.match(/(?:SI\s*Hub\s*ID|Mandate\s*(?:Reference|ID|No\.?)|URN):\s*([A-Za-z0-9_-]+)/i)?.[1];
    const merchant = svc?.name ?? named ?? "E-Mandate Merchant";
    return {
      id: `gmail-rev-${message.id}`,
      source: "gmail",
      evidence_type: "mandate_revocation",
      message_id: message.id,
      sender,
      subject,
      date: parseDateToIso(emailDate),
      currency: "INR",
      billing_channel: "Bank E-Mandate",
      merchant_raw: merchant,
      mandate_id: mandateId,
      summary: `${merchant} bank mandate revoked. This does not by itself mean the service was cancelled.`,
    };
  }

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

  if (REFUND_PATTERN.test(lower)) {
    evidenceType = "refund";
  } else if (/\b(cancelled|canceled|subscription ended|membership expired|cancellation confirmation)\b/i.test(lower)) {
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

  const hasReceiptSignal = RECEIPT_SIGNAL.test(`${subject}\n${clean}`);
  const isBulk =
    headerPresent(headers, "list-unsubscribe") || /^(bulk|list|junk)$/i.test(getHeader(headers, "precedence"));
  const personSender = looksLikePersonSender(sender);

  // Find Service: a keyword must be the payee (sender, subject or payee phrase), or sit next to
  // an amount in a message that reads like a receipt. A passing mention is not enough.
  const keywordNearAmount = (kw: string): boolean => {
    const i = lower.indexOf(kw);
    if (i < 0) return false;
    const around = clean.slice(Math.max(0, i - 80), i + kw.length + 80);
    return /(?:₹|inr|rs\.?)\s*[0-9]/i.test(around);
  };
  let matchedService: string | undefined;
  for (const svc of KNOWN_SERVICES) {
    if (
      svc.keywords.some(
        (kw) =>
          lower.includes(kw) &&
          (keywordIsPayee(kw, sender, subject, clean) ||
            (hasReceiptSignal && !isBulk && !personSender && keywordNearAmount(kw)))
      )
    ) {
      matchedService = svc.name;
      break;
    }
  }

  if (matchedService && (evidenceType === "cancellation_notice" || evidenceType === "service_event")) {
    const svc = KNOWN_SERVICES.find((x) => x.name === matchedService);
    const inSender = svc?.keywords.some((kw) => sender.toLowerCase().includes(kw));
    const bulk = headerPresent(headers, "list-unsubscribe") || /^(bulk|list|junk)$/i.test(getHeader(headers, "precedence"));
    if (!inSender && (bulk || !RECEIPT_SIGNAL.test(`${subject}\n${clean}`))) return null;
  }

  // Lifecycle and status notices need the service named by the sender or subject.
  if ((evidenceType === "cancellation_notice" || evidenceType === "service_event") && !matchedService) {
    const fromSender = personSender ? undefined : merchantFromSender(sender);
    if (!fromSender || isBulk) return null;
  }
  // Payment-like evidence must read like a transaction, not a newsletter or campus mail.
  if (
    evidenceType === "merchant_invoice" ||
    evidenceType === "transaction_alert"
  ) {
    if (!hasReceiptSignal) return null;
    if (isBulk && !matchedService) return null;
  }

  // Find Amount (explicit INR), tied to payment words and not a stipend/prize/market figure.
  let amountRupees: number | undefined;
  if (AMOUNT_LABEL_NEAR.test(clean) && !(NON_PAYMENT_AMOUNT.test(subject) && !matchedService)) {
    amountRupees = findInrAmount(clean);
  }
  if (
    !amountRupees &&
    evidenceType !== "cancellation_notice" &&
    evidenceType !== "service_event"
  ) {
    return null;
  }

  let merchantInferred = false;
  if (!matchedService) {
    if (evidenceType === "service_event") return null;
    merchantInferred = true;
    const fromSender = personSender ? undefined : merchantFromSender(sender);
    const merchantMatch = fromSender ? null : clean.match(/(?:at|to|for|towards|merchant:?)\s+([A-Za-z0-9&.\s]{3,30})(?:\s+on|\s+via|\s+ref|\s+dated|$)/i);
    if (fromSender) {
      matchedService = fromSender;
    } else if (merchantMatch && merchantMatch[1].trim()) {
      matchedService = normalizeServiceName(merchantMatch[1].trim());
    } else if (evidenceType === "merchant_invoice") {
      // No payee named by sender, subject or payment phrase: not usable as subscription evidence.
      return null;
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
    merchant_inferred: merchantInferred || undefined,
    frequency_raw: cycle !== "unknown" ? cycle : undefined,
    summary: `${matchedService} email notice (${evidenceType.replace(/_/g, " ")}): ${amountRupees ? `₹${amountRupees}` : "amount unknown"}${cycle !== "unknown" ? `/${cycle}` : ""}.`,
  };
}

// ============================================================================
// Cross-Source Consolidation & Deduplication Engine
// ============================================================================

const PAYMENT_TYPES: DiscoveryEvidenceType[] = [
  "store_receipt",
  "merchant_invoice",
  "transaction_alert",
  "screenshot_ocr",
];

function isoDay(value?: string): string | undefined {
  if (!value) return undefined;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return m ? m[0] : undefined;
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

function channelFamilyOf(channel?: string): "google_play" | "apple" | "direct" {
  const c = channel?.toLowerCase() ?? "";
  if (c.includes("play")) return "google_play";
  if (c.includes("apple")) return "apple";
  return "direct";
}

/** Receipts, debits and forwarded copies of the same charge collapse to one payment. */
function clusterPayments(payments: DiscoveryEvidence[]): { date?: string; amount: number }[] {
  const clusters: { date?: string; amount: number; orderIds: Set<string> }[] = [];
  const sorted = [...payments].sort((a, b) => (isoDay(a.date) ?? "").localeCompare(isoDay(b.date) ?? ""));
  for (const p of sorted) {
    const d = isoDay(p.date);
    const amount = p.amount_rupees ?? 0;
    const hit = clusters.find(
      (c) =>
        (p.order_id && c.orderIds.has(p.order_id)) ||
        (c.amount === amount && c.date && d && dayDiff(c.date, d) <= 3)
    );
    if (hit) {
      if (p.order_id) hit.orderIds.add(p.order_id);
      if (d && (!hit.date || d > hit.date)) hit.date = d;
    } else {
      clusters.push({ date: d, amount, orderIds: new Set(p.order_id ? [p.order_id] : []) });
    }
  }
  return clusters.map((c) => ({ date: c.date, amount: c.amount }));
}

interface EvidenceGroup {
  service: string;
  account: string;
  family: "google_play" | "apple" | "direct";
  evidence: DiscoveryEvidence[];
}

/**
 * Consolidates discovery evidence into deduped subscription candidates.
 *
 * Reasoning is chronological and keeps three things apart:
 *  - access (can the person use it now),
 *  - renewal (will it charge again: cancelled, failing, renewing),
 *  - mandate (bank authorisation, which is neither of the above).
 * Unknown price is never zero. Refunds never create subscriptions.
 */
export function consolidateEvidenceToCandidates(
  evidenceList: DiscoveryEvidence[],
  existingSubscriptions: Subscription[] = [],
  asOf: Date = new Date()
): ConsolidatedSubscriptionCandidate[] {
  const today = asOf.toISOString().slice(0, 10);
  const groups: EvidenceGroup[] = [];
  const serviceOf = (ev: DiscoveryEvidence) => normalizeServiceName(ev.merchant_raw || ev.summary);
  const accountOf = (ev: DiscoveryEvidence) => (ev.account_ref ?? "").trim().toLowerCase();

  // Pass 1: evidence that names a store channel or is itself a receipt/invoice opens groups.
  // Pass 2: everything else attaches to the matching service/account group.
  const opensGroup = (ev: DiscoveryEvidence) =>
    ev.evidence_type === "store_receipt" ||
    ev.evidence_type === "merchant_invoice" ||
    (ev.billing_channel && channelFamilyOf(ev.billing_channel) !== "direct");

  const place = (ev: DiscoveryEvidence, open: boolean) => {
    const service = serviceOf(ev);
    const account = accountOf(ev);
    const family = channelFamilyOf(ev.billing_channel);
    const same = groups.filter((g) => g.service === service && g.account === account);
    let target = open ? same.find((g) => g.family === family) : undefined;
    if (!target && !open) {
      target =
        same.find((g) => g.family === family && family !== "direct") ??
        (same.length === 1 ? same[0] : same.find((g) => g.family === "direct"));
    }
    if (!target) {
      target = { service, account, family: open ? family : "direct", evidence: [] };
      groups.push(target);
    }
    target.evidence.push(ev);
  };
  evidenceList.filter(opensGroup).forEach((ev) => place(ev, true));
  evidenceList.filter((ev) => !opensGroup(ev)).forEach((ev) => place(ev, false));

  const results: ConsolidatedSubscriptionCandidate[] = [];
  let seq = 0;

  for (const group of groups) {
    const evs = [...group.evidence].sort((a, b) =>
      (isoDay(a.date) ?? "").localeCompare(isoDay(b.date) ?? "")
    );
    // A group made only of refunds is not a subscription.
    if (evs.every((e) => e.evidence_type === "refund")) continue;

    const payments = evs.filter((e) => PAYMENT_TYPES.includes(e.evidence_type) && (e.amount_rupees ?? 0) > 0);
    const clusters = clusterPayments(payments);
    const lastPayment = clusters.filter((c) => c.date).sort((a, b) => a.date!.localeCompare(b.date!)).pop();

    const cycleEvidence = [...evs].reverse().find((e) => e.frequency_raw && e.frequency_raw !== "unknown");
    const cycle: BillingCycle | "unknown" = (cycleEvidence?.frequency_raw as BillingCycle | undefined) ?? "unknown";

    // Access periods come from payments and from service events that state a period.
    const periodStarts: string[] = [];
    for (const c of clusters) if (c.date) periodStarts.push(c.date);
    for (const e of evs) {
      if (e.evidence_type === "service_event" && e.frequency_raw && e.frequency_raw !== "unknown" && isoDay(e.date)) {
        periodStarts.push(isoDay(e.date)!);
      }
    }
    const latestStart = periodStarts.sort().pop();
    const accessEnd = latestStart && cycle !== "unknown" ? addCycleToDate(latestStart, cycle) : undefined;

    const lastDay = (types: DiscoveryEvidenceType[]) =>
      evs.filter((e) => types.includes(e.evidence_type)).map((e) => isoDay(e.date) ?? "").sort().pop();
    const cancelledOn = lastDay(["cancellation_notice"]);
    const failedOn = lastDay(["payment_failure"]);
    const registeredOn = lastDay(["mandate_registration"]);
    const revokedOn = lastDay(["mandate_revocation"]);

    const reactivated = Boolean(cancelledOn && lastPayment?.date && lastPayment.date > cancelledOn);
    const isCancelled = Boolean(cancelledOn) && !reactivated;
    const failureStands = Boolean(failedOn) && (!lastPayment?.date || failedOn! > lastPayment.date);

    let mandate: "none" | "registered" | "revoked" = "none";
    if (registeredOn || revokedOn) {
      mandate = revokedOn && (!registeredOn || revokedOn >= registeredOn) ? "revoked" : "registered";
    }

    let access: "active" | "active_until_period_end" | "ended" | "unknown" = "unknown";
    if (accessEnd) {
      access = accessEnd >= today ? (isCancelled ? "active_until_period_end" : "active") : "ended";
    } else if (isCancelled) {
      access = "unknown";
    } else if (evs.some((e) => e.evidence_type === "store_receipt")) {
      access = "active";
    }

    const renewal: "renewing" | "cancelled" | "payment_failed" | "unknown" = isCancelled
      ? "cancelled"
      : failureStands
        ? "payment_failed"
        : lastPayment && (cycle !== "unknown" || mandate === "registered")
          ? "renewing"
          : "unknown";

    let status: CandidateSubscriptionStatus = "needs_confirmation";
    if (failureStands) status = "payment_failed";
    else if (access === "ended" || (isCancelled && access === "unknown")) status = "cancelled_or_expired";
    else if (access === "active" || access === "active_until_period_end") status = "likely_active";

    const explicitRenewal = [...evs].reverse().find((e) => e.renewal_date)?.renewal_date;
    let renewalDate = explicitRenewal;
    let renewalInferred = false;
    if (!renewalDate && accessEnd && !isCancelled) {
      renewalDate = accessEnd;
      renewalInferred = true;
    }

    const first = evs[0];
    const normService = group.service;
    const amount = lastPayment?.amount || evs.find((e) => (e.amount_rupees ?? 0) > 0 && e.evidence_type !== "refund")?.amount_rupees;
    const priceKnown = Boolean(amount && amount > 0);
    const needsReview: string[] = [];
    const nameInferred = evs.some((e) => e.merchant_inferred);
    if (nameInferred) needsReview.push("Service name was guessed from the sender; confirm it is the right service");
    if (cycle === "unknown") needsReview.push("Billing cycle is unknown and needs confirmation");
    if (!priceKnown) needsReview.push("Price is unknown; confirm the current amount before saving");
    if (mandate === "registered") {
      needsReview.push("Mandate registered; confirm if service is currently active");
      const cap = evs.find((e) => e.max_amount_rupees)?.max_amount_rupees;
      if (cap && amount && cap > amount) {
        needsReview.push(`Mandate maximum cap is ₹${cap}, recurring amount is ₹${amount}`);
      }
    }
    if (mandate === "revoked") {
      needsReview.push("Bank mandate was revoked. That stops bank debits, not necessarily the service; check the merchant account");
    }
    if (evs.some((e) => e.evidence_type === "store_receipt") && evs.some((e) => e.evidence_type === "mandate_registration")) {
      needsReview.push("Bank mandate may be payment evidence for this app-store subscription; review both sources together");
    }
    if (isCancelled) {
      needsReview.push(
        accessEnd && accessEnd >= today
          ? `Cancellation notice received; access likely ends ${accessEnd}`
          : "Cancellation notice received"
      );
    }
    if (failureStands) needsReview.push("Latest payment failed and no later successful payment was found");
    if (access === "ended" && !isCancelled && accessEnd) {
      needsReview.push(`Last known paid period ended ${accessEnd} and no later renewal was seen`);
    }
    if (evs.some((e) => e.evidence_type === "refund")) {
      needsReview.push("A refund or credit note was seen; confirm the subscription is still wanted");
    }
    if (clusters.length > 1) needsReview.push(`${clusters.length} separate payments found`);

    const mandateEvidence = evs.filter((e) => e.mandate_id || e.max_amount_rupees);
    const lastMandate = mandateEvidence[mandateEvidence.length - 1];
    const bestType = evs.some((e) => e.evidence_type === "store_receipt")
      ? 0.95
      : evs.every((e) => e.evidence_type === "service_event")
        ? 0.7
        : 0.85;

    results.push({
      id: `cand-${normService.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}-${seq++}`,
      service_name: normService,
      plan_name:
        evs.find((e) => e.plan_name)?.plan_name ||
        (first.merchant_raw && first.merchant_raw !== normService ? first.merchant_raw : undefined),
      category: inferCategory(normService, first.summary),
      amount_rupees: priceKnown ? amount : undefined,
      price_known: priceKnown,
      currency: "INR",
      billing_cycle: cycle,
      billing_channel:
        group.family === "google_play"
          ? evs.find((e) => channelFamilyOf(e.billing_channel) === "google_play")?.billing_channel || "Google Play"
          : group.family === "apple"
            ? evs.find((e) => channelFamilyOf(e.billing_channel) === "apple")?.billing_channel || "Apple"
            : evs.find((e) => e.billing_channel)?.billing_channel || "Email receipt",
      status,
      access_state: access,
      renewal_state: renewal,
      mandate_state: mandate,
      access_end_date: accessEnd,
      payment_count: clusters.length,
      renewal_date: renewalDate,
      renewal_date_inferred: renewalDate ? renewalInferred : undefined,
      charge_date: lastPayment?.date ?? isoDay(first.date) ?? first.date,
      mandate_details: lastMandate
        ? {
            mandate_id: lastMandate.mandate_id,
            max_amount_rupees: lastMandate.max_amount_rupees,
            frequency: lastMandate.frequency_raw,
            card_last4: lastMandate.last4,
          }
        : undefined,
      confidence: bestType,
      name_inferred: nameInferred || undefined,
      needs_review_reasons: needsReview,
      evidence: evs,
    });
  }

  // The same service seen on several channels or accounts is not assumed to be several plans.
  const byService = new Map<string, ConsolidatedSubscriptionCandidate[]>();
  for (const cand of results) {
    byService.set(cand.service_name, [...(byService.get(cand.service_name) ?? []), cand]);
  }
  for (const list of byService.values()) {
    if (list.length < 2) continue;
    for (const cand of list) {
      const others = list.filter((o) => o !== cand).map((o) => o.billing_channel).join(", ");
      cand.needs_review_reasons.push(
        `Also seen via another billing channel or account (${others}); confirm whether these are separate plans`
      );
    }
  }

  // Cross-reference with existing subscriptions in the household
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
  "refund",
  "refunded",
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
  "mandate revoked",
  "mandate cancelled",
  "mandate canceled",
  "mandate has been revoked",
  "mandate cancellation",
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

export function hasSubscriptionEmailKeywords(message: GmailMessage): boolean {
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

let RETRY_DELAYS_MS = [400, 1200, 3000];
/** Test hook: shorten or disable retry waits. */
export function setGmailRetryDelaysForTests(delays: number[]): void {
  RETRY_DELAYS_MS = delays;
}

function isRetryableGmailStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function fetchGmailJson<T>(
  url: string,
  accessToken: string,
  options: { deadline?: number } = {}
): Promise<T> {
  let response!: Response;
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    let retryable = !response.ok && isRetryableGmailStatus(response.status);
    if (!response.ok && response.status === 403) {
      // Gmail reports per-user rate limits as 403 rateLimitExceeded; auth denials stay fatal.
      try {
        const text = await response.clone().text();
        retryable = /rateLimitExceeded|userRateLimitExceeded/i.test(text);
      } catch {
        retryable = false;
      }
    }
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 5000)
      : RETRY_DELAYS_MS[attempt];
    // Never sleep past the caller's hard deadline: give up and report the status instead.
    if (options.deadline !== undefined && Date.now() + delay > options.deadline) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

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
export interface GmailLane { key: string; name: string; query: string }

export function buildGmailDateFilter(historyRange: GmailHistoryRange): string {
  const w = getGmailHistoryWindow(historyRange);
  return historyRange === "13m"
    ? `after:${w.start.toISOString().slice(0, 10).replace(/-/g, "/")} -in:spam -in:trash `
    : `newer_than:${historyRange === "30d" ? 30 : 45}d -in:spam -in:trash `;
}

export function buildGmailLanes(dateFilter: string): GmailLane[] {
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
  return lanes;
}

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
  const lanes = buildGmailLanes(dateFilter);

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
  // 0. UPI debit with no stated interval: needs a quick price/interval confirmation
  {
    id: "demo-ev-0",
    source: "gmail",
    evidence_type: "service_event",
    message_id: "demo-msg-perplexity",
    sender: "Perplexity <team@mail.perplexity.example>",
    subject: "You've upgraded to Perplexity Pro",
    date: "2026-10-06",
    currency: "INR",
    billing_channel: "UPI",
    merchant_raw: "Perplexity",
    summary: "Perplexity Pro upgrade confirmation. No price or billing interval stated.",
  },
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
  // 6-7. Synthetic services that show the cancelled-with-access and revoked-mandate states.
  {
    id: "demo-ev-6a",
    source: "gmail",
    evidence_type: "store_receipt",
    message_id: "demo-msg-notes-pay",
    sender: "Sample Notes <billing@sample-notes.example>",
    subject: "Receipt for Sample Notes Plus",
    date: "2026-10-05",
    amount_rupees: 199,
    currency: "INR",
    billing_channel: "Credit Card",
    merchant_raw: "Sample Notes Plus",
    frequency_raw: "monthly",
    summary: "Sample Notes Plus monthly receipt, ₹199.",
  },
  {
    id: "demo-ev-6b",
    source: "gmail",
    evidence_type: "cancellation_notice",
    message_id: "demo-msg-notes-cancel",
    sender: "Sample Notes <billing@sample-notes.example>",
    subject: "Your Sample Notes Plus subscription is cancelled",
    date: "2026-10-14",
    currency: "INR",
    merchant_raw: "Sample Notes Plus",
    summary: "Sample Notes Plus cancellation confirmed.",
  },
  {
    id: "demo-ev-7a",
    source: "gmail",
    evidence_type: "transaction_alert",
    message_id: "demo-msg-cloud-pay",
    sender: "Bank Alerts <alerts@sample-bank.example>",
    subject: "AutoPay debit towards Sample Cloud",
    date: "2026-10-09",
    amount_rupees: 499,
    currency: "INR",
    billing_channel: "UPI AutoPay",
    merchant_raw: "Sample Cloud",
    frequency_raw: "monthly",
    mandate_id: "SAMPLE-M1",
    summary: "AutoPay debit of ₹499 towards Sample Cloud.",
  },
  {
    id: "demo-ev-7b",
    source: "gmail",
    evidence_type: "mandate_revocation",
    message_id: "demo-msg-cloud-revoke",
    sender: "Bank Alerts <alerts@sample-bank.example>",
    subject: "AutoPay mandate revoked for Sample Cloud",
    date: "2026-10-20",
    currency: "INR",
    billing_channel: "UPI AutoPay",
    merchant_raw: "Sample Cloud",
    mandate_id: "SAMPLE-M1",
    summary: "UPI AutoPay mandate for Sample Cloud was revoked.",
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

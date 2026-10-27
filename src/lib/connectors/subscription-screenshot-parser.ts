import { BillingCycle, SubscriptionCategory } from "@/types";
import { rupeesToPaise } from "../calculations";

export interface ParsedScreenshotSubscription {
  service_name: string;
  plan_name: string;
  amount_rupees: number;
  billing_cycle: BillingCycle | "unknown";
  category: SubscriptionCategory;
  renewal_date: string;
  confidence: number;
}

const KNOWN_SERVICES: {
  name: string;
  category: SubscriptionCategory;
  keywords: string[];
}[] = [
  { name: "Proton VPN", category: "other", keywords: ["proton vpn"] },
  { name: "Truecaller", category: "other", keywords: ["truecaller"] },
  { name: "Todoist", category: "other", keywords: ["todoist"] },
  { name: "Speechify", category: "other", keywords: ["speechify"] },
  { name: "Netflix", category: "ott", keywords: ["netflix"] },
  { name: "Spotify", category: "music", keywords: ["spotify"] },
  {
    name: "Disney+ Hotstar",
    category: "ott",
    keywords: ["hotstar", "disney+"],
  },
  { name: "Google One", category: "cloud", keywords: ["google one"] },
  { name: "YouTube Premium", category: "music", keywords: ["youtube premium"] },
  { name: "ChatGPT", category: "ai", keywords: ["chatgpt", "openai"] },
  { name: "Claude", category: "ai", keywords: ["claude"] },
  { name: "Airtel", category: "telecom", keywords: ["airtel"] },
  { name: "Jio", category: "telecom", keywords: ["jio"] },
  { name: "SonyLIV", category: "ott", keywords: ["sonyliv"] },
];

const NON_SERVICE_LINES =
  /^(subscriptions?|active|expired|cancelled|canceled|your plan includes|next payment|next billing|renewal|payment|manage|settings|back)$/i;

function isNonPlanLine(line: string): boolean {
  return (
    NON_SERVICE_LINES.test(line) ||
    /^(next\b|renewal\b|payment\b|your\s+plan\s+includes\b)/i.test(
      line
    )
  );
}

function cleanLine(line: string): string {
  return line
    .replace(/[|•·]/g, " ")
    .replace(/^[✓✔√\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBillingCycle(text: string): BillingCycle | "unknown" {
  if (/\b(quarterly|every 3 months|3 months?)\b/i.test(text)) return "quarterly";
  if (/\b(half[- ]yearly|semi[- ]annual|6 months?)\b/i.test(text)) {
    return "half_yearly";
  }
  if (/\b(annual|annually|yearly|per year|12 months?)\b/i.test(text)) {
    return "annual";
  }
  if (/\b(monthly|per month|\/month|\/mo)\b/i.test(text)) return "monthly";
  return "unknown";
}

function parseDate(text: string): string {
  const monthNames =
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const monthNumbers: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const named = text.match(
    new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s+(\\d{4})\\b`, "i")
  );
  if (named) {
    const month = named[2].slice(0, 3).toLowerCase();
    return `${named[3]}-${monthNumbers[month]}-${named[1].padStart(2, "0")}`;
  }

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (numeric) {
    return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }
  return "";
}

function parseAmount(text: string): number | undefined {
  const currencyMatch = text.match(/(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const amountText = currencyMatch?.[1];
  if (amountText) {
    const amount = Number(amountText.replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }

  const paymentText = text.match(
    /(?:next\s+payment|next\s+billing|renewal|renews|payment)\s*[:\-]?\s*(.*)/i
  )?.[1];
  if (!paymentText) return undefined;

  // Drop dates such as "20 Nov 2026" so the day number is never read as a price.
  const withoutDates = paymentText.replace(
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+\d{4})?/gi,
    " "
  );
  const beforeDate = withoutDates.split(/\bon\b/i, 1)[0];
  const candidates = beforeDate.match(/\b\d[\d,]*(?:\.\d{1,2})?\b/g) ?? [];
  for (const candidate of candidates) {
    const amount = Number(candidate.replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
}

function serviceFromTitle(title: string, context: string) {
  const text = `${title} ${context}`.toLowerCase();
  return KNOWN_SERVICES.find((service) =>
    service.keywords.some((keyword) => text.includes(keyword))
  );
}

function isTitleLine(line: string): boolean {
  if (!line || NON_SERVICE_LINES.test(line) || line.length > 100) return false;
  if (/^(next payment|your plan includes|up to \d|ad and malware|high-speed)/i.test(line)) {
    return false;
  }
  return /[:–—]/.test(line) || /[A-Z]/.test(line);
}

export function parseSubscriptionScreenshotText(
  text: string
): ParsedScreenshotSubscription[] {
  const serviceKeywords = KNOWN_SERVICES.flatMap((service) => service.keywords)
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const normalizedText = text
    .replace(
      new RegExp(`\\s+(?=(?:${serviceKeywords})(?:\\b|:))`, "gi"),
      "\n"
    )
    .replace(
      /\s+(?=(?:next\s+payment|next\s+billing|renewal|renews|payment)\b)/gi,
      "\n"
    )
    .replace(/\s+(?=your\s+plan\s+includes\b)/gi, "\n");
  const lines = normalizedText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const results: ParsedScreenshotSubscription[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const paymentLine = lines[index];
    const amount = parseAmount(paymentLine);
    if (
      !amount ||
      (!/(next payment|next billing|renewal|renews|payment)/i.test(paymentLine) &&
        !parseDate(paymentLine))
    ) {
      continue;
    }

    const contextStart = Math.max(0, index - 12);
    const contextLines = lines.slice(contextStart, index);
    let titleIndex = -1;
    for (let candidate = contextLines.length - 1; candidate >= 0; candidate -= 1) {
      if (
        isTitleLine(contextLines[candidate]) &&
        serviceFromTitle(contextLines[candidate], contextLines[candidate]) &&
        /[:–—]/.test(contextLines[candidate])
      ) {
        titleIndex = candidate;
        break;
      }
    }
    if (titleIndex < 0) {
      for (let candidate = contextLines.length - 1; candidate >= 0; candidate -= 1) {
        if (
          isTitleLine(contextLines[candidate]) &&
          serviceFromTitle(contextLines[candidate], contextLines[candidate])
        ) {
          titleIndex = candidate;
          break;
        }
      }
    }
    if (titleIndex < 0) {
      for (let candidate = contextLines.length - 1; candidate >= 0; candidate -= 1) {
        if (isTitleLine(contextLines[candidate])) {
          titleIndex = candidate;
          break;
        }
      }
    }
    const title = titleIndex >= 0 ? contextLines[titleIndex] : "";
    const service = serviceFromTitle(title, title);
    if (!title && !service) continue;

    const serviceName =
      service?.name ??
      title
        .split(/[:–—]/, 1)[0]
        .replace(/\s+-\s+.*$/, "")
        .trim();
    if (!serviceName || serviceName.length > 60) continue;

    const planLine =
      contextLines
        .slice(titleIndex >= 0 ? titleIndex + 1 : 0)
        .reverse()
        .find((line) => !isNonPlanLine(line)) ?? "";
    const planName =
      (planLine && planLine !== title ? planLine : title.split(/[:–—]/).slice(1).join(" ").trim()) ||
      "Standard Plan";
    const category = service?.category ?? "other";
    const cycle = parseBillingCycle(`${planName} ${title}`);
    const renewalDate =
      parseDate(paymentLine) ||
      parseDate(lines.slice(index, index + 2).join(" "));
    const key = `${serviceName.toLowerCase()}|${amount}|${renewalDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      service_name: serviceName,
      plan_name: planName,
      amount_rupees: rupeesToPaise(amount) / 100,
      billing_cycle: cycle,
      category,
      renewal_date: renewalDate,
      confidence: service ? 0.82 : 0.65,
    });
  }

  return results;
}

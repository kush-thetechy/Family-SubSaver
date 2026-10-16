import { describe, expect, it } from "vitest";
import {
  GmailMessage,
  parseGmailMessage,
  parseGeneralGmailMessage,
  parseAppleReceipt,
  parseBankMandateEmail,
  cleanHtmlText,
  consolidateEvidenceToCandidates,
} from "../connectors/gmail-service";
import { DiscoveryEvidence, Subscription } from "@/types";

function makeMessage(
  content: string,
  subject = "Your subscription receipt",
  from = "billing@example.com",
  date = "Thu, 15 Oct 2026 10:00:00 +0530",
  mimeType = "text/plain"
): GmailMessage {
  return {
    id: "message-1",
    snippet: "",
    payload: {
      mimeType,
      headers: [
        { name: "Subject", value: subject },
        { name: "From", value: from },
        { name: "Date", value: date },
      ],
      body: { data: Buffer.from(content).toString("base64url") },
    },
  };
}

describe("Gmail invoice & receipt extraction", () => {
  it("extracts the amount and billing cycle from standard email content", () => {
    const result = parseGmailMessage(
      makeMessage("Spotify Premium: INR 1,199.00 billed for 12 months")
    );

    expect(result).toMatchObject({
      service_name: "Spotify",
      amount_rupees: 1199,
      amount_paise: 119900,
      billing_cycle: "annual",
      category: "music",
      email_sender: "billing@example.com",
    });
  });

  it("decodes HTML rupee entities and recognizes semi-annual billing", () => {
    const message = makeMessage(
      "<p>Disney+ Hotstar plan: &#8377;899 semi-annual</p>",
      "Hotstar renewal receipt",
      "billing@hotstar.com",
      "Thu, 15 Oct 2026 10:00:00 +0530",
      "text/html"
    );

    const result = parseGmailMessage(message);

    expect(result).toMatchObject({
      service_name: "Disney+ Hotstar",
      amount_rupees: 899,
      billing_cycle: "half_yearly",
    });
  });

  it("ignores messages without a recognized service or an explicit INR amount", () => {
    expect(
      parseGmailMessage(makeMessage("Your streaming plan is now active"))
    ).toBeNull();
    expect(
      parseGmailMessage(
        makeMessage("Your plan was charged $9.99", "Spotify receipt")
      )
    ).toBeNull();
  });

  it("preserves HTML table cell boundaries to avoid collisions", () => {
    const htmlTable = `
      <table>
        <tr><td>Todoist Pro</td><td>Monthly</td><td>&#8377;330</td></tr>
      </table>
    `;
    const clean = cleanHtmlText(htmlTable);
    expect(clean).toContain("Todoist Pro");
    expect(clean).toContain("Monthly");
    expect(clean).toContain("₹330");
    // Ensure words in separate cells have spacing
    expect(clean).toMatch(/Todoist Pro\s+Monthly\s+₹330/);
  });

  // Reference 1: Google Play Order Receipt (Todoist)
  it("parses Google Play Store renewal receipts accurately (Todoist sample)", () => {
    const rawPlayEmail = `
Your Google Play Order Receipt from 10 Oct 2026
Inbox
Todoist Pro - Monthly\u200B (Todoist: To Do List & Calendar)
1 item from Google Play
Order placed
Placed on Sat, Oct 10
Order number
GPA.3371-9881-7499-93667..1
Based on this email
Correct?
Google Play <googleplay-noreply@google.com>
Sat, Oct 10, 1:22 AM (6 days ago)
to me
Thank you
Your subscription from Doist Inc. on Google Play has renewed. [Manage your subscriptions](https://c.gle/example)To help keep your subscription active, add a backup payment method.
[Add backup](https://c.gle/example)
Order number: GPA.3371-9881-7499-93667..1
Order date: 10 Oct 2026 1:22:19 am IST
Your account: kush.sarna123@gmail.com
Item
Price
Todoist Pro - Monthly\u200B (Todoist: To Do List & Calendar)
₹330.00/month
Auto-renewing subscription
Total: ₹330.00/month
(Includes GST of ₹50.34)
Payment method:
UPI: GPay
Play Points earned
+92
By subscribing, you authorise us to charge you the subscription cost (as described above) automatically, charged to the payment method provided until cancelled.
    `;

    const message: GmailMessage = {
      id: "play-todoist-1",
      snippet: "Todoist Pro - Monthly (Todoist: To Do List & Calendar)",
      payload: {
        mimeType: "text/plain",
        headers: [
          {
            name: "Subject",
            value: "Your Google Play Order Receipt from 10 Oct 2026",
          },
          {
            name: "From",
            value: "Google Play <googleplay-noreply@google.com>",
          },
          {
            name: "Date",
            value: "Sat, 10 Oct 2026 01:22:19 +0530",
          },
        ],
        body: { data: Buffer.from(rawPlayEmail).toString("base64url") },
      },
    };

    const evidence = parseGeneralGmailMessage(message);

    expect(evidence).not.toBeNull();
    expect(evidence?.evidence_type).toBe("store_receipt");
    expect(evidence?.amount_rupees).toBe(330);
    expect(evidence?.currency).toBe("INR");
    expect(evidence?.billing_channel).toBe("Google Play (UPI: GPay)");
    expect(evidence?.order_id).toBe("GPA.3371-9881-7499-93667..1");
    expect(evidence?.frequency_raw).toBe("monthly");

    const candidates = consolidateEvidenceToCandidates([evidence!]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      service_name: "Todoist",
      plan_name: "Todoist Pro - Monthly",
      amount_rupees: 330,
      billing_cycle: "monthly",
      billing_channel: "Google Play (UPI: GPay)",
      renewal_date: "2026-11-10",
      renewal_date_inferred: true,
      status: "likely_active",
    });
  });

  // Reference 2: Apple Receipt (YouTube Premium)
  it("parses Apple App Store receipts extracting gross recurring amount and not subtotal/IGST", () => {
    const rawAppleReceipt = `
Apple
Receipt
Apple Services
Invoice Date: 28 Sep 2026
Order ID: MLK89271982
Document No: 192847192

Billed To:
Rahul Sharma

YouTube Premium (Monthly)
Renews 28 October 2026
Subtotal: ₹165.25
IGST (18%): ₹29.75
Total: ₹195.00

Payment Method: MasterCard ending in 1234
    `;

    const message: GmailMessage = {
      id: "apple-yt-1",
      snippet: "Your receipt from Apple",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Your receipt from Apple" },
          { name: "From", value: "Apple <no_reply@email.apple.com>" },
          { name: "Date", value: "Mon, 28 Sep 2026 14:30:00 +0530" },
        ],
        body: { data: Buffer.from(rawAppleReceipt).toString("base64url") },
      },
    };

    const evidence = parseAppleReceipt(
      message,
      cleanHtmlText(rawAppleReceipt),
      "Your receipt from Apple",
      "Apple <no_reply@email.apple.com>",
      "Mon, 28 Sep 2026 14:30:00 +0530"
    );

    expect(evidence).not.toBeNull();
    expect(evidence?.evidence_type).toBe("store_receipt");
    // CRUCIAL: ₹195.00 gross total, NOT subtotal ₹165.25 or IGST ₹29.75
    expect(evidence?.amount_rupees).toBe(195);
    expect(evidence?.currency).toBe("INR");
    expect(evidence?.billing_channel).toBe("Apple");
    expect(evidence?.frequency_raw).toBe("monthly");

    const candidates = consolidateEvidenceToCandidates([evidence!]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].service_name).toBe("YouTube Premium");
    expect(candidates[0].amount_rupees).toBe(195);
    expect(candidates[0].billing_cycle).toBe("monthly");
    expect(candidates[0].status).toBe("likely_active");
  });

  // Reference 3: HDFC E-Mandate Registration
  it("parses HDFC Bank E-Mandate registrations separating current debit amount from cap", () => {
    const rawHdfcEmail = `
HDFC Bank
Confirmation of E-mandate (Auto payment) registration on your Debit card

Dear Customer,
We confirm the registration of an E-mandate (Auto payment) on your HDFC Bank Debit card ending with 4412.
Details of the mandate are as follows:

Merchant Name: NETFLIX ENTERTAINMENT SERVICES INDIA PVT LTD
SI Hub ID: SIHUB889123491
Current transaction amount: ₹490.00
Maximum transaction amount: ₹15,000.00
Frequency: Monthly
Start date: 01-OCT-2026
End date: 30-SEP-2036
Card number: ************4412

You will receive a pre-debit notification at least 24 hours prior to every scheduled debit.
    `;

    const message: GmailMessage = {
      id: "hdfc-mandate-1",
      snippet: "Confirmation of E-mandate registration",
      payload: {
        mimeType: "text/plain",
        headers: [
          {
            name: "Subject",
            value: "Confirmation of E-mandate (Auto payment) registration on your Debit card",
          },
          { name: "From", value: "alerts@hdfcbank.net" },
          { name: "Date", value: "Thu, 01 Oct 2026 09:15:00 +0530" },
        ],
        body: { data: Buffer.from(rawHdfcEmail).toString("base64url") },
      },
    };

    const evidence = parseBankMandateEmail(
      message,
      cleanHtmlText(rawHdfcEmail),
      "Confirmation of E-mandate registration",
      "alerts@hdfcbank.net",
      "Thu, 01 Oct 2026 09:15:00 +0530"
    );

    expect(evidence).not.toBeNull();
    expect(evidence?.evidence_type).toBe("mandate_registration");
    // CRUCIAL: ₹490 is the current transaction amount; ₹15,000 is the maximum authorized cap!
    expect(evidence?.amount_rupees).toBe(490);
    expect(evidence?.max_amount_rupees).toBe(15000);
    expect(evidence?.mandate_id).toBe("SIHUB889123491");
    expect(evidence?.last4).toBe("4412");
    expect(evidence?.frequency_raw).toBe("Monthly");

    const candidates = consolidateEvidenceToCandidates([evidence!]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].service_name).toBe("Netflix");
    expect(candidates[0].amount_rupees).toBe(490);
    // Mandates prove a recurring instruction was registered, so status must be needs_confirmation
    expect(candidates[0].status).toBe("needs_confirmation");
    expect(candidates[0].mandate_details?.max_amount_rupees).toBe(15000);
  });

  // Cross-Source Deduplication & Grouping
  it("consolidates multiple evidence items (Play receipt + bank debit alert) into one candidate", () => {
    const playEvidence: DiscoveryEvidence = {
      id: "ev-play-1",
      source: "gmail",
      evidence_type: "store_receipt",
      merchant_raw: "Todoist Pro - Monthly",
      amount_rupees: 330,
      currency: "INR",
      billing_channel: "Google Play",
      frequency_raw: "monthly",
      date: "2026-10-10",
      order_id: "GPA.3371-9881",
      summary: "Google Play receipt for Todoist Pro: ₹330/month.",
    };

    const bankAlertEvidence: DiscoveryEvidence = {
      id: "ev-bank-1",
      source: "sms",
      evidence_type: "transaction_alert",
      merchant_raw: "Google Play*Todoist",
      amount_rupees: 330,
      currency: "INR",
      billing_channel: "Google Play",
      frequency_raw: "monthly",
      date: "2026-10-10",
      summary: "HDFC Debit card debited ₹330 for Google Play Todoist.",
    };

    const candidates = consolidateEvidenceToCandidates([playEvidence, bankAlertEvidence]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].service_name).toBe("Todoist");
    expect(candidates[0].amount_rupees).toBe(330);
    // Preserves both supporting evidence records
    expect(candidates[0].evidence).toHaveLength(2);
  });

  it("keeps distinct services separate even if they have the exact same price", () => {
    const netflixEvidence: DiscoveryEvidence = {
      id: "ev-nf-1",
      source: "gmail",
      evidence_type: "merchant_invoice",
      merchant_raw: "Netflix",
      amount_rupees: 199,
      currency: "INR",
      billing_channel: "Direct",
      frequency_raw: "monthly",
      date: "2026-10-01",
      summary: "Netflix Mobile Plan ₹199.",
    };

    const hotstarEvidence: DiscoveryEvidence = {
      id: "ev-hs-1",
      source: "gmail",
      evidence_type: "merchant_invoice",
      merchant_raw: "Disney+ Hotstar",
      amount_rupees: 199,
      currency: "INR",
      billing_channel: "Direct",
      frequency_raw: "monthly",
      date: "2026-10-02",
      summary: "Hotstar Mobile Plan ₹199.",
    };

    const candidates = consolidateEvidenceToCandidates([netflixEvidence, hotstarEvidence]);
    // MUST NOT merge two different services simply because amount is ₹199
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.service_name)).toEqual(
      expect.arrayContaining(["Netflix", "Disney+ Hotstar"])
    );
  });

  it("marks billing interval as unknown when missing rather than silently defaulting to monthly", () => {
    const evidenceWithoutCycle: DiscoveryEvidence = {
      id: "ev-unknown-1",
      source: "gmail",
      evidence_type: "merchant_invoice",
      merchant_raw: "Notion",
      amount_rupees: 800,
      currency: "INR",
      billing_channel: "Direct",
      frequency_raw: undefined,
      date: "2026-10-05",
      summary: "Payment received for Notion: ₹800.",
    };

    const candidates = consolidateEvidenceToCandidates([evidenceWithoutCycle]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].billing_cycle).toBe("unknown");
    expect(candidates[0].needs_review_reasons).toContain(
      "Billing cycle is unknown and needs confirmation"
    );
  });

  it("flags possible duplicate matches when candidate already exists in household subscriptions", () => {
    const existingSubs: Subscription[] = [
      {
        id: "sub-netflix-1",
        household_id: "hh-1",
        service_name: "Netflix",
        amount_paise: 64900,
        billing_cycle: "monthly",
        category: "ott",
        payer_id: "u1",
        user_ids: ["u1"],
        is_active: true,
        visibility: "full_details",
        source: "manual",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ];

    const netflixEvidence: DiscoveryEvidence = {
      id: "ev-nf-dup",
      source: "gmail",
      evidence_type: "merchant_invoice",
      merchant_raw: "Netflix",
      amount_rupees: 649,
      currency: "INR",
      billing_channel: "Credit Card",
      frequency_raw: "monthly",
      date: "2026-10-15",
      summary: "Netflix invoice: ₹649.",
    };

    const candidates = consolidateEvidenceToCandidates([netflixEvidence], existingSubs);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].is_possible_duplicate).toBe(true);
    expect(candidates[0].duplicate_matches).toHaveLength(1);
    expect(candidates[0].duplicate_matches?.[0].service_name).toBe("Netflix");
  });
});

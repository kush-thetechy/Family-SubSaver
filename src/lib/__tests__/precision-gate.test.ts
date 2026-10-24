import { describe, expect, it } from "vitest";
import { parseGeneralGmailMessage, looksLikePersonSender } from "@/lib/connectors/gmail-service";
import type { GmailMessage } from "@/lib/connectors/gmail-service";

let n = 0;
function msg(subject: string, body: string, from: string, extra: { name: string; value: string }[] = []): GmailMessage {
  return {
    id: `p${++n}`,
    snippet: "",
    internalDate: String(Date.parse("Thu, 15 Oct 2026 10:00:00 +0530")),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: subject },
        { name: "From", value: from },
        { name: "Date", value: "Thu, 15 Oct 2026 10:00:00 +0530" },
        ...extra,
      ],
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}

describe("precision gate: mail that only mentions a brand or an amount is not evidence", () => {
  it("newsletter that names a streaming service and a money figure", () => {
    expect(
      parseGeneralGmailMessage(
        msg("Weekly Brief: TV rights", "Netflix and Sony LIV bid. A deal worth Rs. 458 crore was signed.", "Club News <news@club.example.org>", [
          { name: "List-Unsubscribe", value: "<mailto:u@club.example.org>" },
        ])
      )
    ).toBeNull();
  });
  it("job alert with a stipend amount", () => {
    expect(parseGeneralGmailMessage(msg("Earn stipend up to INR 25,000 per month!", "Apply now. Stipend INR 25,000 per month.", "Jobs <noreply@jobs.example>"))).toBeNull();
  });
  it("class title that contains a service name", () => {
    expect(
      parseGeneralGmailMessage(msg("Upcoming class: How Can Netflix Use Ethnography", "Session starts in 1 hour. Fee INR 5,000 already settled.", "no-reply@school.example"))
    ).toBeNull();
  });
  it("person-style sender is never a service name", () => {
    expect(looksLikePersonSender("Kartikeya Gupta <kartikeya.gupta@school.example>")).toBe(true);
    expect(looksLikePersonSender("Netflix <billing@netflix.com>")).toBe(false);
    expect(
      parseGeneralGmailMessage(msg("Fwd: Order #1006 placed", "Order confirmation. Total Rs. 1,299 paid.", "Kush Sarna <kush.sarna@school.example>"))
    ).toBeNull();
  });
  it("a real receipt from the service still produces evidence", () => {
    const ev = parseGeneralGmailMessage(msg("Your Netflix receipt", "Thank you for your payment. Total: INR 649 billed monthly.", "Netflix <billing@netflix.com>"));
    expect(ev?.merchant_raw).toBe("Netflix");
    expect(ev?.amount_rupees).toBe(649);
  });
  it("a cancellation from the service itself still counts, one from a newsletter does not", () => {
    expect(parseGeneralGmailMessage(msg("Your Netflix membership has been cancelled", "We have cancelled your membership.", "Netflix <info@netflix.com>"))?.evidence_type).toBe("cancellation_notice");
    expect(
      parseGeneralGmailMessage(msg("Gadget of the week: tool that cancels your Netflix", "It cancels subscriptions for you.", "Digest <hello@digest.example>", [
        { name: "List-Unsubscribe", value: "<mailto:x@digest.example>" },
      ]))
    ).toBeNull();
  });
});

describe("true positives survive the gate (synthetic fixtures)", () => {
  const f = (s: string, b: string, from: string) => parseGeneralGmailMessage(msg(s, b, from));
  it("processor receipt that names the payee", () => {
    const ev = f("Payment receipt", "Payment to Lovable of Rs. 2,100 was successful. Order ID L-1.", "Razorpay <no-reply@razorpay.example>");
    expect(ev?.merchant_raw).toBe("Lovable");
    expect(ev?.amount_rupees).toBe(2100);
  });
  it("bank debit alert that names the merchant in the body", () => {
    const ev = f("Transaction alert", "Rs. 649 debited from your account via UPI AutoPay to NETFLIX on 15-10-2026.", "alerts@bank.example");
    expect(ev?.merchant_raw).toBe("Netflix");
    expect(ev?.amount_rupees).toBe(649);
  });
  it("receipt forwarded by the user keeps the payee from the quoted receipt", () => {
    const ev = f("Fwd: Your Notion receipt", "---------- Forwarded message ----------\nFrom: Notion <team@makenotion.example>\nReceipt from Notion. Total: INR 800 billed monthly.", "Kush <kush.example@gmail.com>");
    expect(ev?.merchant_raw).toBe("Notion");
    expect(ev?.amount_rupees).toBe(800);
  });
  it("small-company receipt with a sender name that is two capitalised words", () => {
    const ev = f("Invoice for your plan", "Invoice no. 22. Plan: Pro. Amount paid: Rs. 999 per month.", "Sample Notes <billing@sample-notes.example>");
    expect(ev?.merchant_raw).toBe("Sample Notes");
  });
  it("e-mandate revocation stays mandate-only evidence", () => {
    const ev = f("E-Mandate revoked", "Your e-mandate for Lovable has been revoked. Mandate ID: M-100", "alerts@bank.example");
    expect(ev?.evidence_type).toBe("mandate_revocation");
  });
});

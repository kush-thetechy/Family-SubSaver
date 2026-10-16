import { NextResponse } from "next/server";
import { parseBankSms } from "@/lib/connectors/sms-parser";
import { rupeesToPaise } from "@/lib/calculations";
import { BillingCycle, SubscriptionCategory } from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const subject = body.subject || body.Subject || "";
    const textBody = body.text || body.body || body["body-plain"] || "";
    const from = body.from || body.From || "inbound@user";

    const combinedText = `${subject} ${textBody}`;

    // Try parsing using standard parser
    let service = "Forwarded Invoice";
    let amountRupees = 0;
    let cycle: BillingCycle = "monthly";
    let category: SubscriptionCategory = "other";

    const lower = combinedText.toLowerCase();
    if (lower.includes("netflix")) {
      service = "Netflix";
      category = "ott";
    } else if (lower.includes("spotify")) {
      service = "Spotify";
      category = "music";
    } else if (lower.includes("hotstar")) {
      service = "Disney+ Hotstar";
      category = "ott";
      cycle = "annual";
    } else if (lower.includes("google one")) {
      service = "Google One";
      category = "cloud";
      cycle = "annual";
    }

    const amountMatch = combinedText.match(
      /(?:rs\.?|inr|₹)\s*(\d[\d,]*(?:\.\d{1,2})?)/i
    );
    if (amountMatch) {
      amountRupees = parseFloat(amountMatch[1].replace(/,/g, ""));
    }

    return NextResponse.json({
      success: true,
      message: "Inbound email received and parsed successfully",
      extracted: {
        service_name: service,
        amount_paise: rupeesToPaise(amountRupees),
        amount_rupees: amountRupees,
        billing_cycle: cycle,
        category,
        billing_channel: "Forwarded Email",
        email_sender: from,
        email_subject: subject,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process inbound email" },
      { status: 500 }
    );
  }
}


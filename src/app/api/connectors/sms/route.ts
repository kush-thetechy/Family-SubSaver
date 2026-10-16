import { NextResponse } from "next/server";
import { parseBankSms } from "@/lib/connectors/sms-parser";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const smsText = body.smsText;

    if (!smsText || typeof smsText !== "string") {
      return NextResponse.json(
        { success: false, error: "smsText is required" },
        { status: 400 }
      );
    }

    const parsed = parseBankSms(smsText);

    if (!parsed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not detect a valid debit amount or subscription merchant from the provided message text.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      subscription: parsed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to parse SMS" },
      { status: 500 }
    );
  }
}


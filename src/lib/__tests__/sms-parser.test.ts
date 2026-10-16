import { describe, it, expect } from "vitest";
import { parseBankSms } from "../connectors/sms-parser";

describe("Indian Bank & UPI SMS Parser", () => {
  it("correctly parses HDFC Bank UPI AutoPay debit for Netflix", () => {
    const sms =
      "Dear Customer, Rs. 649.00 has been debited from account **1234 towards NETFLIX on 15-OCT-26 via UPI Ref 4293847291. Not you? Call 18002664332 - HDFC Bank";
    const result = parseBankSms(sms);

    expect(result).not.toBeNull();
    expect(result?.service_name).toBe("Netflix");
    expect(result?.amount_paise).toBe(64900);
    expect(result?.amount_rupees).toBe(649);
    expect(result?.category).toBe("ott");
    expect(result?.billing_channel).toBe("UPI");
    expect(result?.source_bank).toBe("HDFC Bank");
  });

  it("correctly parses ICICI Bank debit for Spotify AutoPay", () => {
    const sms =
      "ICICI Bank Acct XX567 debited for Rs 119.00 on 10-Oct-26. Info: BIL*SPOTIFY INDIA*AUTOPAY. Avl Bal Rs 24,500.00.";
    const result = parseBankSms(sms);

    expect(result).not.toBeNull();
    expect(result?.service_name).toBe("Spotify");
    expect(result?.amount_paise).toBe(11900);
    expect(result?.category).toBe("music");
    expect(result?.billing_channel).toBe("UPI AutoPay");
    expect(result?.source_bank).toBe("ICICI Bank");
  });

  it("correctly parses SBI debit for Disney+ Hotstar", () => {
    const sms =
      "Your a/c no. XXXXXXXX1234 is debited by Rs.899.00 on 05/10/26 by transfer to Disney Star Hotstar UPI Ref no 428192849 - State Bank of India (SBI)";
    const result = parseBankSms(sms);

    expect(result).not.toBeNull();
    expect(result?.service_name).toBe("Disney+ Hotstar");
    expect(result?.amount_paise).toBe(89900);
    expect(result?.category).toBe("ott");
    expect(result?.billing_channel).toBe("UPI");
  });

  it("correctly parses Axis Bank debit for Airtel with comma in amount", () => {
    const sms =
      "Rs. 1,199.00 debited from Axis Bank A/c no. XX9012 on 12-Oct-26 towards AIRTEL POSTPAID BILL via AutoPay.";
    const result = parseBankSms(sms);

    expect(result).not.toBeNull();
    expect(result?.service_name).toBe("Airtel Postpaid");
    expect(result?.amount_paise).toBe(119900);
    expect(result?.amount_rupees).toBe(1199);
    expect(result?.category).toBe("telecom");
    expect(result?.billing_channel).toBe("UPI AutoPay");
  });

  it("returns null for non-financial or empty text", () => {
    expect(parseBankSms("Hello family, don't forget dinner tonight!")).toBeNull();
    expect(parseBankSms("")).toBeNull();
  });
});

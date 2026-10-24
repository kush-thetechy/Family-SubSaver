import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Pricing" requires={(c) => c.billingLive}>
      {(c) => (
        <>
          <p>A single one-time payment of Rs {c.priceRupees} in Indian rupees. It is not a subscription and does not renew.</p>
          <p>The tracker, manual entry and family sharing can be used before paying. Payment is taken through our payment provider by UPI, card or other methods it offers. Taxes, if any apply, are shown at checkout.</p>
        </>
      )}
    </LegalPage>
  );
}

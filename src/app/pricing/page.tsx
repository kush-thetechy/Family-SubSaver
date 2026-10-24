import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Pricing">
      {(c) => (
        <>
          <p>A single one-time payment of Rs {c.priceRupees} in Indian rupees. It is not a subscription and does not renew.{c.billingLive ? "" : " Checkout is not open yet, and nobody is charged until it is."}</p>
          <p>Your first 30 days of use are free. The 30 days start the first time a Gmail scan or screenshot import shows you your live subscriptions. After that, the one-time payment of Rs {c.priceRupees}, tax included, unlocks continued use.</p>
          <p>Manual entry and family sharing can be used before paying. Payment is taken through our payment provider by UPI, card or other methods it offers. The price you see is the price you pay, with any applicable tax included.</p>
        </>
      )}
    </LegalPage>
  );
}

import { LegalPage } from "@/components/LegalPage";
import PaySection from "@/components/PaySection";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Pricing">
      {(c) => (
        <>
          <p>One payment of Rs {c.priceRupees} in Indian rupees, tax included. The price you see at checkout is the price you pay (GST is inside it). It is not a subscription and does not renew.</p>
          <p>Your first 30 days of use are free. The 30 days start the first time a Gmail scan or screenshot import shows you your live subscriptions. After that, the one-time Rs {c.priceRupees} is {c.billingLive ? "the fee for continued use." : "meant to be the fee for continued use."}</p>
          {c.billingLive ? null : (
            <p><i>Pending activation: the app records the date your free period starts and checkout is still in test mode. Nothing is blocked and nobody is charged until payments go live, and these pages will say so until then.</i></p>
          )}
          <p>Payment is taken by our payment provider, Dodo Payments, by UPI, card or other methods it offers. Dodo Payments is the seller of record.</p>
          <PaySection />
        </>
      )}
    </LegalPage>
  );
}

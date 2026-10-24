import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Refunds and cancellation - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Refunds and cancellation" requires={(c) => c.refundDays !== null}>
      {(c) => (
        <>
          <p>The Rs {c.priceRupees} fee is a one-time payment for this purchase. It does not renew, so there is nothing to cancel for it. Any future paid feature would be announced with its own price and terms.</p>
          <p>Ask for a refund within {c.refundDays} days of payment by writing to {c.contact} from your account email. Our payment provider&apos;s own process also applies. Nothing here limits any right you have under the law where you live. Approved refunds go back to the original payment method through our payment provider, Dodo Payments, the seller of record.</p>
        </>
      )}
    </LegalPage>
  );
}

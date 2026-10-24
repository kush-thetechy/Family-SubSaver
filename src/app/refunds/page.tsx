import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Refunds and cancellation - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Refunds and cancellation" requires={(c) => c.refundDays !== null}>
      {(c) => (
        <>
          <p>The fee is a one-time payment, so there is nothing to cancel later.</p>
          <p>Ask for a refund within {c.refundDays} days of payment by writing to {c.contact} from your account email. Approved refunds go back to the original payment method through our payment provider, Dodo Payments, the seller of record.</p>
        </>
      )}
    </LegalPage>
  );
}

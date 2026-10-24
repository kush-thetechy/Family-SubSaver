import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Terms - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Terms of service">
      {(c) => (
        <>
          <p>These terms cover use of Family SubSaver, run by {c.operator}. By creating an account you agree to them.</p>
          <ul className="list-disc pl-5">
            <li>The service is a tracker. It lists subscriptions and shows totals. It does not cancel, change or pay any subscription for you.</li>
            <li>Gmail discovery is optional, read-only and started by you. Results are suggestions that may be incomplete or wrong. Check them before saving.</li>
            <li>You may add only information you are entitled to add. Do not use the service to access anyone else&apos;s mail or data.</li>
            <li>Fee: a one-time payment of Rs {c.priceRupees}{c.billingLive ? "" : " (not yet charged)"}, payable through our payment provider. See Pricing and Refunds.</li>
            <li>You can delete your data and account in Settings at any time.</li>
            <li>The service is provided as is, and we are not liable for losses from missed or wrong renewal information, to the extent the law allows.</li>
            <li>Questions: {c.contact}.</li>
          </ul>
        </>
      )}
    </LegalPage>
  );
}

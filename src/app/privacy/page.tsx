import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Privacy policy">
      {(c) => (
        <>
          <p>Family SubSaver keeps a directory of subscriptions a household pays for. You add them by hand, from screenshots, or from a Gmail scan you start yourself. Privacy requests: {c.contact}.</p>
          <h2 className="font-semibold">Data we store</h2>
          <ul className="list-disc pl-5">
            <li>Account email and sign-in credentials, handled by Supabase Auth.</li>
            <li>Subscriptions you save: service, plan, category, price, billing cycle, renewal date, who pays, billing channel, notes and visibility.</li>
            <li>Household name and members, invitation links (stored as a hash, single use, expire after 7 days).</li>
            <li>Your Gmail consent record and scan coverage counts. No email content.</li>
            <li>Payment record for the one-time fee: payment id, amount, currency, status and date, received from our payment provider, Dodo Payments. We do not receive or store your full card number, UPI PIN or bank login. Dodo Payments sends us a confirmation that can include your name, email, billing country and the last four card digits; we keep only the fields listed here.</li>
          </ul>
          <h2 className="font-semibold">Gmail, only if you connect it</h2>
          <ul className="list-disc pl-5">
            <li>Read-only access. Scans run only when you click. No background scanning. Attachments are not read.</li>
            <li>The app searches your mailbox for subscription receipts, renewals and payment mandate messages, reads matched messages during that request, extracts service, amount, cycle and dates, and shows candidates. Raw message content is not stored. No subscription is added to your list until you confirm it. The only things stored from a scan are your consent record and coverage counts (how many messages were searched and read).</li>
            <li>The access token lives in a short-lived, encrypted, HttpOnly browser cookie, not in our database.</li>
            <li>You can withdraw consent, disconnect, delete records that came from Gmail, or delete your account in Settings.</li>
            <li>Gmail data is not sold, not used for advertising, and not used to train AI models.</li>
          </ul>
          <h2 className="font-semibold">Family sharing</h2>
          <p>Another person joins your household only after signing in with their own account and agreeing. Each person connects only their own Gmail. Members see service, plan, category, price, cycle, renewal date and payer only for entries marked Full details. Totals only entries show an amount alone. Hidden entries are never shared. Notes and billing channel are never shared. You can leave at any time.</p>
          <p>Storage: Supabase (database and authentication) and Vercel (hosting).</p>
        </>
      )}
    </LegalPage>
  );
}

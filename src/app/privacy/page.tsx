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
            <li>Household name and members, and invitation links (stored as a hash, single use, expire after 7 days).</li>
            <li>Your Gmail consent record and scan coverage counts (how many messages were searched and read), and a first-use record: which kind of use (Gmail scan or screenshot import), the date it first showed you live subscriptions, and how many. This starts the 30-day free period. No email content.</li>
            <li>Payment records for the one-time fee: payment id, checkout session id, your user id, whether it was a test or live payment, amount, currency, status and date, received from Dodo Payments. We also keep a short-lived checkout session record (session id, your user id, mode, time) so a payment can be matched to the right account; checkout session records are removed by daily cleanup once more than 30 days old. If a payment cannot be matched to an account, we keep the same fields and the reason it could not be matched until it is resolved. We do not receive or store your full card number, UPI PIN or bank login. Dodo Payments sends us a confirmation that can include your name, email, billing country and the last four card digits; we do not keep those extra fields.</li>
          </ul>
          <h2 className="font-semibold">Gmail, only if you connect it</h2>
          <ul className="list-disc pl-5">
            <li>Read-only access. Scans run only when you click. No background scanning.</li>
            <li>Screenshot imports are read in your browser and are not uploaded.</li>
            <li>When you start a scan, our server searches Gmail for matching subscription receipts, renewals and payment mandate messages. It processes matched message text in memory to extract subscription details and show suggestions. Attachments are not fetched. The app does not intentionally write message bodies or access tokens to its database or application logs. Subscription records are saved only after you confirm them. We also keep consent and withdrawal events, scan quota and coverage counts, import deduplication keys, and the first-use record described above. Vercel and Supabase process operational metadata under their own policies; these logs are separate from your saved subscription list.</li>
            <li>The Gmail access token is held in an encrypted, HttpOnly session cookie for no more than one hour or its remaining token lifetime. An encrypted, user-bound scan cursor can contain pending message identifiers and pagination state for up to 30 minutes. Neither is stored in our database. Disconnecting clears this browser&apos;s Gmail session and attempts revocation with Google; if Google revocation fails, the app tells you so.</li>
            <li>In Settings you can withdraw consent to stop future scans, disconnect Gmail, delete Gmail-imported subscriptions, or delete your account after confirming your password. Deleting Gmail-imported subscriptions does not delete consent, scan coverage, quota or usage records. Account deletion removes associated active account records. Provider operational logs and recovery copies may follow separate retention schedules; deletion from the active database does not promise immediate erasure from every provider system.</li>
            <li>Gmail data is not sold, not used for advertising, and not used to train AI models.</li>
            <li>Family SubSaver&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Gmail data is used only to show you subscription suggestions inside the app.</li>
          </ul>
          <h2 className="font-semibold">Usage analytics</h2>
          <p>Microsoft Clarity session recording and usage analytics are disabled across the app. Previously saved analytics choices do not enable recording.</p>
          <h2 className="font-semibold">Family sharing</h2>
          <p>Another person joins your household only after signing in with their own account and agreeing. Each person connects only their own Gmail. The household owner (the person who sent the invitation) sees service, plan, category, price, cycle, renewal date and payer only for member entries marked Full details. Members do not see the owner&apos;s entries or each other&apos;s. Totals only entries show an amount alone. Hidden entries are never shared. Notes and billing channel are never shared. You can leave at any time.</p>
          <p>Storage: Supabase (database and authentication) and Vercel (hosting).</p>
          <p>Account emails (confirmation and password reset) are sent through Resend, which receives your email address and the message content for delivery only.</p>
        </>
      )}
    </LegalPage>
  );
}

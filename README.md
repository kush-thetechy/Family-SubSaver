# Family Subscription Saver

> A mobile-first subscription management app for Indian families to understand household subscription spending, identify duplicate services, and review legitimate savings opportunities.

**Status:** MVP in development  
**Platform:** Mobile-first web app / Progressive Web App (PWA)  
**Primary audience:** Indian households  
**Business model:** Freemium (pricing and live billing must be validated and configured)  
**Default currency:** INR

> \*\*Implementation note:\*\* This README describes the intended product and development workflow. A feature is only available if it has been implemented and verified in the current repository.

## Contents

* [Overview](#overview)
* [Problem and goals](#problem-and-goals)
* [Scope](#scope)
* [User journeys](#user-journeys)
* [Features](#features)
* [Data and calculations](#data-and-calculations)
* [Savings recommendations](#savings-recommendations)
* [Import flow](#import-flow)
* [Privacy and security](#privacy-and-security)
* [Architecture](#architecture)
* [Getting started](#getting-started)
* [Environment variables](#environment-variables)
* [Database and demo data](#database-and-demo-data)
* [Testing](#testing)
* [Deployment](#deployment)
* [Monetization](#monetization)
* [Limitations](#limitations)
* [Roadmap](#roadmap)
* [Troubleshooting](#troubleshooting)
* [Contributing](#contributing)
* [Legal note](#legal-note)

## Overview

Family Subscription Saver helps a household maintain a shared, consent-controlled view of subscriptions and recurring household expenses.

A family may pay for streaming, music, AI tools, cloud storage, mobile plans, broadband and other services. These payments may be spread across members and billing channels. The app brings user-provided subscription information into one place, calculates approximate monthly and annual costs, tracks renewals and helps the household review possible savings.

### Product promise

**Know what your household pays for, who pays, and where you may be able to save.**

### What this app does not do

* It does not promise to discover every subscription automatically.
* It does not log in to third-party services or store their passwords/OTPs.
* It does not cancel, purchase or switch third-party subscriptions.
* It does not recommend account sharing that violates provider terms.
* It is not a bank aggregator or financial institution.

## Problem and goals

Household subscription spending can be fragmented across family members, app stores, cards, UPI, telecom plans and direct billing. Families may lack a consolidated view of costs, duplicate services or benefits already included in another plan.

The app aims to answer:

* What subscriptions has the household recorded?
* Who pays for each one?
* Who uses each service?
* What is the approximate monthly and annual cost?
* Which renewals are approaching?
* Which services appear more than once?
* Are there legitimate family-plan or bundle options worth checking?
* What information is still missing?

Primary goals:

1. Make household spending visible.
2. Keep onboarding lightweight.
3. Produce useful, evidence-based recommendations.
4. Let each member control visibility.
5. Make uncertainty and incomplete data explicit.
6. Establish a secure foundation before accepting real household data.

## Scope

### MVP

* Demo mode or configured sign-in.
* Household and member flow where implemented.
* Manual subscription CRUD.
* Monthly-normalized and annualized spending.
* Dashboard, directory and renewal dates.
* Duplicate alerts and conservative savings recommendations.
* Optional screenshot/receipt import with review-before-save.
* Visibility controls and server-side access checks for real accounts.
* Clearly labelled demo data.
* Responsive mobile-first UI.

### Out of scope initially

* Gmail background scanning.
* SMS/notification reading.
* Bank/card/Account Aggregator connections.
* Automatic UPI AutoPay discovery.
* Automatic App Store/Play Store subscription listing.
* Third-party cancellation/purchase/switching.
* Friend-group sharing recommendations.
* Behavioral advertising.
* Native Android app.
* Live billing until the full payment lifecycle is configured and tested.

## User journeys

### Add a subscription

1. Sign in to your private account. Demo mode is available only when explicitly enabled for local development.
2. Select **Add subscription**.
3. Enter service, amount and billing cycle.
4. Optionally add plan, category, payer, users, billing channel and renewal date.
5. Review the normalized monthly cost.
6. Set visibility and save.
7. Dashboard and directory update.

### Review a duplicate

1. The app finds multiple active records for the same service.
2. It shows a review alert, not an automatic cancellation instruction.
3. The user checks whether these are separate plans or duplicate records.
4. A savings estimate appears only if a legitimate replacement and relevant costs/eligibility have been verified.

### Import a receipt

1. The app explains the processing and obtains consent.
2. User selects an image or supported receipt.
3. A configured extraction provider proposes fields.
4. User edits and confirms the fields.
5. Possible duplicates are flagged.
6. Temporary files are deleted according to the stated policy.
7. If extraction is not configured, manual entry is offered. The app must not pretend an extraction occurred.

### Audit app-store subscriptions

Offer a short, platform-specific guide that takes users to the store's subscription list, then let them capture one or more screenshots of the active subscriptions. On Android, the guide should say: open **Google Play Store → profile picture → Payments & subscriptions → Subscriptions**. On iPhone or iPad, it should say: open **Settings → [your name] → Subscriptions**. Account and menu labels can vary; remind users to check the account they used to subscribe. Link to the official [Google Play subscription help](https://support.google.com/googleplay/answer/7018481) and [Apple subscription help](https://support.apple.com/en-us/HT202039).

The user should be able to select screenshots from their device; the tool should OCR every visible active subscription across the selected image(s), not assume a single screen contains the whole list. Ask the user to scroll and capture additional screens when needed. Show the extracted service, plan, price, billing period, renewal or expiry date, and store as editable review items. Do not infer an active subscription from an unclear row or save without confirmation. Screenshots are a point-in-time view; they do not provide ongoing status updates.

### Find subscriptions in email

Gmail discovery is an optional, separate user action. The `gmail.readonly` scope grants broader Gmail read access than the app's filters; it does not limit Google access to recent or keyword-matched messages. After updated consent, the server searches five billing-related lanes within a selected **30-day, 45-day, or 13-month** window and fetches only message IDs returned by those searches, up to **200 unique messages per scan**. Matched message content is processed on the server and is not intentionally persisted as a raw body. Content-free scan coverage (date window, lane/page counts, failures, and truncation) is saved for the signed-in user. For users who do not connect Gmail, screenshots of active Google Play and Apple subscription lists plus manual entry remain available.

* **Google Play:** messages commonly have a subject like “Your Google Play Order Receipt” and include the app or plan, order date, recurring price and period (for example, `₹330.00/month`), Google account, and payment method. A renewal email is evidence of a charge or renewal, not a complete live list of active subscriptions.
* **Apple:** search for “receipt from Apple” or “invoice from Apple.” A receipt can show the purchased item, amount, date and Apple Account; it may group multiple items. Apple lets users enable **Renewal Receipt Emails** in the subscription settings. A receipt proves a purchase/charge, but may not establish current renewal status or the next renewal date.
* **Direct-billed services:** look for combinations such as “subscription,” “renewal,” “renews,” “auto-renew,” “automatic renewal,” “recurring payment/billing/charge,” “membership renewed,” “trial ending/ends/expires,” “next billing/payment/charge date,” “upcoming renewal,” “invoice,” “receipt,” “payment,” “charged,” and “billed.” Known providers can help narrow invoice searches; do not classify a one-time purchase as recurring based on a merchant name alone.
* **Bank/card mandates:** look for terms such as “e-mandate,” “e-NACH,” “NACH mandate,” “UPI AutoPay,” “SI Hub,” “standing instruction,” “merchant mandate,” “card mandate,” “auto-debit,” “merchant initiated transaction,” “recurring transaction,” “pre-debit,” “scheduled debit,” and “recurring debit.” HDFC-style alerts may contain “current transaction amount,” “maximum transaction amount,” and “frequency.” The maximum mandate limit is not the subscription price.

Email wording and fields vary by merchant, country and payment route. Only search and fetch messages matching these keywords, preserve the source/date for review, distinguish charge date from next renewal date, detect likely duplicate receipts across app-store and bank evidence, and ask the user to confirm status and details before adding a subscription. A matching receipt or mandate is evidence to review, not proof that a subscription is still active. A missing email is not evidence that no subscription exists.

### Find subscriptions billed outside app stores

Use several user-controlled signals rather than relying on one feed:

1. Search consented Gmail for subscription-related merchant invoices, renewal notices and payment confirmations, including direct subscriptions paid by card, UPI AutoPay or bank debit.
2. In a later iteration, consider importing bank/card statements to identify repeated merchant and amount patterns as **possible recurring charges**, then ask the user to confirm the merchant, billing period, payer and whether it is still active.
3. Allow manual entry and an audit checklist for subscriptions with no reliable digital receipt. Users who do not want Gmail access can upload app-store subscription screenshots as a private, local alternative.

Recurring-transaction matching is a lead, not proof: amounts can change, annual charges are easy to miss, and similar merchant descriptors can refer to unrelated purchases. Do not request card numbers, CVVs, banking passwords or OTPs. Do not connect to banks or read SMS automatically in the initial product; any future financial-data integration needs a separate consent, security, retention and regulatory review.

## Features

### Dashboard

Potential contents:

* Normalized monthly recurring spend.
* Annualized recurring spend.
* Recorded subscription count.
* Upcoming renewals.
* Spend by category and payer, subject to visibility rules.
* Duplicate/review alerts.
* Household audit completeness.

Totals must not be described as exhaustive unless the user confirms the audit is complete. Normalized cost is not the same as cash paid in the current month.

### Subscription directory

Where permitted, show service, plan, category, price/cycle, monthly equivalent, payer, users, renewal date, billing channel, source and visibility. Support search and useful filters.

### Household

Invitations must be accepted before member data becomes visible. Household membership does not automatically grant access to every subscription. Members should be able to change visibility, leave the household and request deletion of their data.

### Savings

Recommendations should explain why they appeared, the supporting evidence, assumptions, uncertainty, source links, verification date, possible savings start date and reasons they might not apply.

### Settings

Account, household membership, privacy controls, export/deletion, privacy notice, terms, support and plan status. Do not enable live billing until pricing, terms, checkout, verified webhooks, entitlement updates and cancellation UX work.

## Data and calculations

Store money as integer paise and use decimal-safe or integer arithmetic internally. Round only for display.

|Billing cycle|Monthly-equivalent calculation|
|-|-|
|Monthly|Amount|
|Quarterly|Amount / 3|
|Half-yearly|Amount / 6|
|Annual|Amount / 12|
|Prepaid validity|Amount / validity days × 30|
|One-time|Exclude from recurring monthly spend; display separately|

Annualized recurring cost = normalized monthly cost × 12.

Keep these concepts separate:

* **Normalized recurring cost:** approximate monthly cost.
* **Annualized estimate:** normalized cost multiplied by 12.
* **Immediate cash effect:** what could actually be avoided now, considering prepayment, refunds and renewal timing.
* **Savings start date:** when the change could begin saving money.

A prepaid annual subscription does not imply an immediate refund if the user stops using it.

## Savings recommendations

Use three states:

* `confirmed\_estimate`: material eligibility, price, capacity and needs have been checked.
* `potential\_saving`: a plausible option exists but a material input needs confirmation.
* `compare\_only`: overlap exists, but equivalence or eligibility is unconfirmed.

Duplicate records should trigger review, not an assumption that one plan can replace another. Family membership does not prove provider eligibility. Similar AI, music or streaming products are not automatically equivalent.

A savings amount may be shown only when provider eligibility, capacity, feature equivalence, current prices, extra fees, taxes and lost discounts have been considered and the result is positive. Unknown or stale rules must not produce definitive savings. Do not count the same subscription in multiple mutually exclusive recommendations.

Catalog-backed claims require official source URLs and verification dates. Do not invent prices or offers.

## Import flow

* Obtain consent and validate screenshot image type and size.
* Run English OCR in the browser with Tesseract.js; screenshots are not uploaded or retained by the app. Tesseract.js loads its OCR worker and language data from the jsDelivr CDN. This is local OCR, not a hosted LLM or OpenRouter call.
* Limit each import to five PNG, JPEG or WEBP screenshots, at 10 MB per image.
* Extract multiple subscription candidates, with amounts and renewal dates where visible. Keep billing cycles unknown unless visible in the screenshot; require confirmation before saving.
* Show proposed details in editable review cards, flag likely duplicates, and let the user select which entries to save.
* Save only after explicit confirmation. OCR may miss or misread text, so users must verify all fields.
* Receipt screenshot OCR does not support PDFs or continuous monitoring.
* A store screenshot or email receipt is a user-provided snapshot; it cannot guarantee a complete, current subscription inventory by itself.

## Privacy and security

Subscription information can reveal spending patterns and household habits. Family members must not be presumed to consent to full visibility.

Before real household data is accepted:

* Enable and test RLS on user-data tables.
* Enforce household membership server-side on every read/write.
* Test cross-household access.
* Apply visibility rules to dashboard, recommendations, exports and notifications.
* Test against inference leaks from counts, totals and savings.
* Validate inputs server-side.
* Keep privileged keys server-only.
* Avoid logging receipt contents or sensitive notes.
* Keep Microsoft Clarity and session replay disabled on authenticated, spending, import, review, Gmail, and OAuth routes. The current private-account app does not load Clarity.
* Implement and document retention/deletion.
* Provide a privacy notice, terms, support contact and incident-handling process.
* Use synthetic data until access-control and deletion tests pass.

Visibility levels:

* `hidden`: private; must not influence group-visible outputs in a way that reveals the service.
* `totals\_only`: only specifically permitted aggregate information is visible.
* `full\_details`: authorized household members may see the details covered by the product policy.

Do not rely on front-end hiding alone. Deployment does not prove security or legal compliance.

## Architecture

Use the existing repository stack if suitable. Otherwise, a reasonable default is:

* Next.js App Router + TypeScript.
* Tailwind CSS and shadcn/ui where appropriate.
* Supabase Auth + Postgres + Row Level Security.
* Zod validation.
* Vercel or another suitable host.
* Receipt extraction behind a replaceable server-side adapter.
* Live payments deferred until fully configured.

Use migrations and foreign keys. Keep calculation logic deterministic, eligibility rules data-driven, secrets server-only and demo data separate from real-user data.

Suggested data entities:

* `households`
* `profiles`
* `household\_members`
* `services`
* `plans`
* `subscriptions`
* `subscription\_users`
* `subscription\_visibility`
* `imports`
* `recommendations`
* `audit\_events`

Money fields should use names such as `amount\_paise` or `price\_paise`. Keep the app's premium entitlement separate from the third-party subscriptions tracked by the app.

## Getting started

> Check the current repository and its `package.json` before running commands. The commands below are typical for a Next.js/npm project and may need adjustment.

### Prerequisites

* Supported Node.js version.
* npm, pnpm or yarn matching the repository lockfile.
* Git.
* A Supabase project for account sign-in and private subscription storage.

### Install

```bash
npm install
```

Use the repository's actual package manager if it uses pnpm or yarn.

### Configure environment

Create `.env.local` using `.env.example` if available. Never commit `.env.local` or real keys.

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project's API settings. Apply all SQL migrations in `supabase/migrations/` in filename order before creating accounts (`supabase/archive/` holds a superseded draft that must not be applied). They create private personal households and subscription tables with Row Level Security, the Gmail scan quota, versioned consent, and private scan-coverage records; family invitations are not enabled yet. The app requires sign-in by default and never falls back to demo mode unless `NEXT_PUBLIC_ENABLE_DEMO_MODE=true` is explicitly set.

For a private Gmail pilot, leave `NEXT_PUBLIC_ALLOW_SIGN_UP=false` and `NEXT_PUBLIC_ENABLE_DEMO_MODE=false`. Create one test user in Supabase Authentication after applying the migrations, then sign in at `/login`. The pilot account stores subscriptions in Supabase. Enable `NEXT_PUBLIC_ALLOW_SIGN_UP=true` only when ready to accept public registrations.

### Connect Gmail for subscription discovery

Gmail discovery is optional and explicitly user-triggered. Google grants the restricted `gmail.readonly` scope; the app's 30-day, 45-day, 13-month, billing-keyword, spam/trash, and 200-message limits are application-side filters, not Google-enforced scope boundaries. The server enforces a maximum of five scans per authenticated app account per UTC day. A separate, updated consent is required for the 13-month search and content-free coverage record. Use **Preview sample results** to explore the review flow without accessing an inbox. Gmail is disabled unless the server release gate is configured for an allowlisted test account.

#### Live Google Cloud configuration

1. Configure the private Supabase pilot above and create a test account for yourself. Sign-ups can stay disabled.
2. In Google Cloud Console, create a project, enable the **Gmail API**, and configure the **OAuth consent screen**. Keep the app in Testing mode and add your own Google account under **Test users**.
3. Create an **OAuth client ID** for a **Web application**. Add the exact app origin plus `/api/connectors/gmail/callback` as an authorized redirect URI (for example, `http://localhost:3000/api/connectors/gmail/callback` or your Vercel site callback URL).
4. Configure these variables for the environment you will test (in `.env.local` for local testing or Vercel Environment Variables for a private deployed pilot):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_ALLOW_SIGN_UP=false
   NEXT_PUBLIC_ENABLE_DEMO_MODE=false
   GMAIL_MODE=test
   GMAIL_TESTER_USER_IDS=your-supabase-auth-user-uuid
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   FSS_GMAIL_SESSION_SECRET=64-hex-characters-from-a-cryptographically-random-32-byte-key
   NEXT_PUBLIC_APP_URL=https://your-test-site.example
   ```
   Set `NEXT_PUBLIC_APP_URL` to the exact origin used for the test. `GMAIL_TESTER_USER_IDS` must contain the Supabase Auth UUID for each approved tester, not an email address. Generate the session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Set the matching Supabase Auth site URL and add its `/auth/callback` URL (for example, `https://your-test-site.example/auth/callback`) to the Supabase redirect allow list. Apply all SQL migrations, including `20261021000400_gmail_13_month_coverage.sql`, before recording updated Gmail consent. Vercel environment changes require a new deployment.
5. Open the **Import** page, click **Connect Gmail**, review the data disclosure and consent terms, and approve read-only Google access.
6. Select **Past 30 days**, **Past 45 days**, or **Past 13 months**, then click **Scan Gmail Inbox**. Each account can run at most five live scans per UTC calendar day; the quota is shared across devices and enforced server-side. The server enforces the selected range and checks message timestamps, even if a request submits a longer range. The Import page reports per-lane pages, matches, failures, incomplete/truncated coverage, and whether coverage was saved.

If the Import page reports setup required, check the Vercel deployment's environment values for Supabase, Google OAuth, and `FSS_GMAIL_SESSION_SECRET`, confirm all migrations through `20261021000400_gmail_13_month_coverage.sql` are applied, and redeploy. Do not enable public sign-ups to test your own Gmail.

#### Discovery architecture & evidence lanes

The discovery engine searches keyword matches through five evidence lanes. Gmail's search filters messages before their contents are fetched, the selected date window is checked against message timestamps, each lane is paginated, and a scan stops after 200 unique matching messages or 100 pages per lane. Each scan saves content-free coverage metrics without message IDs, raw queries, senders, subjects, or bodies. Together with the five-live-scans-per-account-per-day quota, this bounds API use:

* **Store Receipts & Renewals:** Google Play receipts and renewal messages, plus Apple App Store receipts/invoices with subscription or renewal terms. Google Play receipt IDs (`GPA.*`), app names, plan tiers, recurring price and period are captured when present. Apple gross totals are distinguished from subtotals and IGST/taxes; explicit renewal dates are used instead of estimating them from the receipt date.
* **Direct Merchant Invoices:** Search for combinations of subscription/renewal terms and billing terms.
* **Known Merchant Payments:** Search payment, invoice, receipt, purchase, renewal, and related activity alongside known merchant names. This includes additional services identified in the discovery handoff, such as Perplexity, Google AI Pro, Truecaller, Proton VPN, Speechify, Brilliant, Loom, Lovable, Wispr Flow, NBA League Pass, V2T Whisper, ExpressVPN, and Zomato Gold. A merchant match alone does not establish a subscription.
* **Memberships, Trials & Activations:** Search known providers for lifecycle events such as membership activation, trial start, or plan upgrade. Unknown prices remain unknown and require user confirmation.
* **Bank/Card E-Mandates & Standing Instructions:** Search for e-mandate registrations, SI Hub notices, AutoPay, standing instructions and pre-debit alerts from banks. The current recurring charge is distinguished from the maximum mandate limit/cap (e.g. ₹490 debit vs ₹15,000 cap).
* **Cross-Source Consolidation:** Multiple receipts across months, store order receipts, and bank debit alerts are consolidated into a single candidate with attached source evidence history, rather than creating separate duplicate subscriptions.
* **Conservative Status & Unknown Intervals:** Mandates and receipts are not presumed to be active consumer subscriptions; status is labelled (`Likely Active`, `Needs Confirmation`, `Cancelled / Expired`, `Payment Failed`). Missing billing cycles are marked `unknown` for review rather than defaulting to monthly.
* **Batch review:** Complete, likely-active candidates are preselected so users can uncheck items that are no longer active and add the rest together. Uncertain candidates are separated and require an explicit selection after review; cancelled, failed, incomplete, and possible-duplicate candidates are not bulk-selected. Missing prices or intervals still require individual review.

#### Gmail data handling and release gates

* **Server-only OAuth credentials:** Client ID and Client Secret must be configured on the server. The client browser never receives or submits client secrets.
* **Separate opt-in:** Account sign-in does not request Gmail access. The user reviews a separate disclosure and records versioned consent before OAuth or a live scan.
* **Server-side release gate:** `GMAIL_MODE=disabled` (the default) blocks Gmail. `GMAIL_MODE=test` requires the authenticated user's UUID in `GMAIL_TESTER_USER_IDS`. Public mode requires `GMAIL_MODE=public` plus owner-controlled approval, Google verification, security assessment, and privacy review flags. These flags are deployment controls, not evidence that any external approval has been granted.
* **OAuth protections:** The flow uses one-time random state, PKCE S256, the signed-in account binding, the exact read-only Gmail scope, and a short-lived encrypted HttpOnly session cookie. It does not request offline access; expired tokens require a new user-initiated connection.
* **Bounded processing and coverage:** Each Gmail API response is capped at 2 MiB; MIME traversal is limited by part count, nesting, and extracted text size; attachment content is skipped; search results exclude spam/trash and are checked against the selected date window before parsing. Coverage records contain only aggregate counts, lane status, and numeric error codes. They remain until account deletion; withdrawing consent stops future scans but does not erase past coverage.
* **No intentional raw-body persistence:** Matched content is processed on the server and is not intentionally written as a raw email body to the database. This is not a claim that data never leaves the device, that transient memory is securely erased, or that a matched email cannot contain unrelated text. Review/scan responses are marked `no-store`; candidates are stripped of full headers, subject, message ID, order ID, mandate ID, and card suffix before browser display.
* **Review and provenance:** Candidates remain in the page's in-memory review state until the user confirms a record. Confirmed imports are tagged as Gmail-originated and can be deleted separately; source metadata and confirmation do not remove any third-party policy obligations.
* **Disconnect and deletion:** **Disconnect & Revoke**, **Withdraw Gmail consent**, **Delete saved Gmail-imported records**, and **Delete account and data** are separate actions. Revocation failure is surfaced. Account deletion requires a recent password sign-in. Backup retention and deletion propagation remain provider-dependent and must be documented before public launch.
* **No Clarity on private pages:** Microsoft Clarity is not mounted in the app layout while authenticated routes contain spending or import data. Do not re-enable session replay/analytics on these routes without a separate data-flow review.

#### Public Gmail launch blockers

Google classifies `https://www.googleapis.com/auth/gmail.readonly` as a **Restricted Scope**. A test allowlist or successful local scan does not establish a public-use exception or authorize a consumer launch. Before enabling public Gmail, document the app's actual permitted-use rationale, complete the verification and security-assessment steps Google assigns (do not assume a particular tier), publish accurate privacy disclosures, complete legal/security reviews, and obtain explicit owner sign-off. These items are tracked in `docs/gmail-guardrails.md`. Until then, keep Gmail disabled or restricted to genuinely authorized testing; manual entry and local screenshot OCR remain independent features.

#### Discovery limitations

* **Mailbox coverage:** Scans search only the connected mailbox. Subscriptions managed under family members' Google accounts, personal emails, or employer accounts will not appear unless their owners connect their accounts.
* **Format variations:** Invoices from small merchants or emails lacking standard INR currency symbols or pricing tables may not be recognized.
* **No background surveillance:** The app does not run background email crawlers. Live Gmail scans require a signed-in account, are explicitly triggered, capped at 200 unique messages per scan and five scans per UTC day, and all findings require human review before saving. Sample previews do not access Gmail.

### Start development server

```bash
npm run dev
```

Open the local URL printed by the server, commonly `http://localhost:3000`.

### Production build

```bash
npm run build
npm run start
```

Run only scripts that actually exist in `package.json`.

## Environment variables

Names depend on the implementation. Likely variables include:

|Variable|Purpose|
|-|-|
|`NEXT_PUBLIC_SUPABASE_URL`|Required for account sign-in and private subscription storage|
|`NEXT_PUBLIC_SUPABASE_ANON_KEY`|Required public client key; database access is protected by RLS|
|`NEXT_PUBLIC_ALLOW_SIGN_UP`|Keep `false` for the private pilot; set `true` only when opening registration|
|`NEXT_PUBLIC_ENABLE_DEMO_MODE`|Explicitly opt in to local demo mode; leave `false` for sign-in-first behavior|
|`GOOGLE_CLIENT_ID`|Google OAuth web client ID for live Gmail scanning|
|`GOOGLE_CLIENT_SECRET`|Server-side Google OAuth client secret|
|`FSS_GMAIL_SESSION_SECRET`|Server-side 32-byte hex key for encrypted Gmail session cookies|
|`GMAIL_MODE`|Server-only `disabled` (default), `test`, or owner-gated `public` Gmail access|
|`GMAIL_TESTER_USER_IDS`|Comma-separated Supabase Auth UUID allowlist required in test mode|
|`GMAIL_PUBLIC_LAUNCH_APPROVED`|Owner approval gate; not proof of external compliance|
|`GMAIL_GOOGLE_VERIFICATION_CONFIRMED`|Owner records completed Google verification evidence|
|`GMAIL_SECURITY_ASSESSMENT_CONFIRMED`|Owner records completed assigned security-assessment evidence|
|`GMAIL_PRIVACY_REVIEW_CONFIRMED`|Owner records reviewed disclosures and data flows|
|`NEXT_PUBLIC_APP_URL`|Exact public app origin used to construct OAuth callback URLs|

Use placeholders only in `.env.example`. Do not expose demo data by default; use the sign-in setup screen when Supabase is missing. Demo mode must be explicitly enabled and labelled.

## Database and demo data

Apply SQL migrations in `supabase/migrations/` to the Supabase project before using real accounts. The initial account migration creates profiles, private personal households, household memberships and RLS-protected subscription storage. No demo seed is applied to authenticated accounts.

Demo data should include three adult demo members and examples across OTT, music, AI productivity, cloud storage and telecom. Include duplicate records, an annual subscription, an unknown sharing rule, a stale catalog item and a hidden subscription. Use fictional or clearly demo-labelled prices unless official current prices are verified.

Demo mode is disabled by default and must never imply changes persist to real accounts. Demo data is browser-local and is not loaded into authenticated accounts. New authenticated users start with an empty private household. Family invitations and shared household access are not implemented yet.

## Testing

At minimum, test:

1. Monthly, quarterly, half-yearly, annual and prepaid normalization.
2. One-time records excluded from recurring totals.
3. Duplicate alerts do not assert sharing eligibility.
4. Unknown/stale rules produce no definitive savings.
5. Non-positive savings are not shown as positive.
6. Savings are not double-counted.
7. Cross-household reads/writes are denied.
8. Hidden records do not leak through dashboard, recommendation, export or notification.
9. Totals-only visibility is enforced.
10. Unconfirmed imports are not saved.
11. Invalid/oversized uploads are rejected.
12. Leave/delete behavior works.
13. Premium entitlements are server-enforced if implemented.
14. Unauthenticated users cannot access app pages or the Gmail connector when Supabase is configured.
15. Authenticated accounts can read or mutate only their own subscriptions.
16. New accounts receive a private household and member row through the signup trigger.
17. Live Gmail scans require a signed-in account and enforce the five-scan daily quota across devices.

Run the available checks, for example:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Some scripts may not exist. Report missing commands and failures honestly. Do not claim a test passed unless it actually ran.

## Deployment

Before deployment:

* Verify production environment variables.
* Apply database migrations.
* Confirm RLS and membership checks.
* Keep privileged keys server-only.
* Configure authentication callback URLs.
* Make privacy, terms, support and deletion information accessible.
* Use synthetic data until security checks pass.
* Verify catalog claims.

Suggested Vercel flow:

1. Push the repository to GitHub.
2. Import the repository in Vercel.
3. Set environment variables.
4. Configure auth callback URLs.
5. Deploy a preview.
6. Test authentication, access, CRUD, import, deletion and mobile layouts.
7. Review logs and errors.
8. Promote only after release checks pass.

Deployment is not the same as public-launch readiness. Do not accept sensitive real-user data while access control or deletion is unverified.

## Monetization

Freemium is a hypothesis to validate.

**Free hypothesis:** one household, manual entry, core dashboard and renewals, basic duplicate alerts, limited imports if reliable.

**Premium hypothesis:** more imports, advanced recommendations, longer history/trends, household report export and higher member limits if supportable.

Do not paywall privacy, access control, data correction or deletion. Do not enable live billing until price, terms, checkout, verified webhooks, entitlement changes, failure/refund handling and cancellation UX are tested. Leave ads out of the initial sprint and do not use receipt or spending data for personalized advertising.

## Limitations

|Capability|Initial approach|Limitation|
|-|-|-|
|Manual entry|Supported|Users may forget services|
|Screenshot/receipt import|On-device OCR for supported screenshots; optional receipt extraction|OCR can miss text; user confirmation required|
|App Store/Play Store|User-guided subscription list and screenshot import|No universal listing API assumed; screenshot is only a snapshot|
|Email receipts|Optional, user-triggered Gmail keyword scan limited to a selected 30-day, 45-day, or 13-month window|Supported merchant coverage is limited; only matched message contents are fetched; coverage is capped at 200 unique messages; no continuous scan or attachment parsing|
|Bank/card data|Gmail keyword matches for recurring mandate notices; manual entry otherwise|No bank integration or automatic statement analysis in v1|
|UPI AutoPay|Gmail search for mandate and pre-debit notices|Coverage depends on the bank's email wording; user confirmation required|
|Telecom bundles|User-provided plan plus sourced catalog|Offers and eligibility change|
|Cancellation|Provider link where appropriate|App does not cancel subscriptions|

The app may not contain every household subscription. Show audit progress and do not describe an incomplete inventory as exhaustive.

## Roadmap

### Sprint 1 — Private owner pilot

* Keep demo mode disabled; verify email/password sign-in, protected routes, private household creation and subscription CRUD with RLS.
* Validate dashboard calculations, duplicate review, manual entry and browser-side screenshot OCR using synthetic data.
* Apply and verify all database migrations, including Gmail consent, provenance and account deletion, in the private Supabase project.
* Keep Gmail disabled until Google OAuth branding/credentials and the private tester allowlist are intentionally configured. Do not treat a local build or allowlist as Google approval.
* Verify account deletion, Gmail disconnection/revocation and Gmail-import deletion; document provider backup and log-retention behavior.

### Sprint 2 — Authorized Gmail pilot

* Run end-to-end Gmail scans only with the account owner's informed consent and an authorized Google test account; use synthetic fixtures for parser and bounds testing.
* Confirm the actual OAuth scope, query relevance, response sanitization, five-scan quota, logs/traces/cache behavior, revoke behavior and deletion behavior.
* Complete Google permitted-use, verification and assigned security-assessment steps before any wider availability.
* Complete privacy/security/legal review and incident-response preparation; keep family invitations disabled until cross-household RLS and redaction tests pass.

### Sprint 3 — Product validation and paid launch

* Measure audit completion time.
* Measure import success and recommendation usefulness.
* Test willingness to pay.
* Decide pricing and free/premium limits before implementing payment processing.
* If approved, add a payment provider with verified, idempotent webhooks, server-enforced entitlements, refunds, failed-payment handling and cancellation UX; never paywall access control or deletion.
* Expand catalog only when current sources are available.
* Add Clarity only to explicitly approved public surfaces with consent; exclude authenticated, spending, import, review, Gmail and OAuth routes and re-verify deployed network behavior.

Later integrations require a separate feasibility, privacy and platform review.

## Troubleshooting

**Data does not persist**

* Check demo mode.
* Verify environment variables and migrations.
* Confirm the signed-in user is an active household member.

**Authentication fails after deployment**

* Verify provider callback URLs and allowed redirects.
* Check deployment environment variables.
* Test in a clean browser session.

**Totals look incorrect**

* Check billing-cycle normalization and paise/rupee units.
* Exclude one-time records from recurring totals.
* Check archived records and visibility rules.

**Import fails**

* Check file type/size and extraction credentials.
* Use manual entry as fallback.
* Never save an unconfirmed import.

**Recommendation is missing**

* Check whether price/rule data is stale or unknown.
* Check eligibility, capacity, positive savings and visibility permissions.
* Prefer no recommendation over a misleading one.

**Build fails**

* Run the actual build script locally.
* Check type errors, missing environment variables and server/client boundaries.
* Document unresolved failures honestly.

## Contributing

Before changing behavior:

1. Identify the affected user journey.
2. Update validation and tests.
3. Review authorization and visibility implications.
4. Update documentation.
5. Run available quality checks.

Do not add integrations that require credentials or permissions without documenting data flow, consent, failure behavior and fallback. Do not add dependencies without explaining their purpose.

Pull request checklist:

* \[ ] Change is within scope.
* \[ ] Inputs are validated.
* \[ ] Authorization is enforced server-side.
* \[ ] No secrets or raw receipt contents are logged.
* \[ ] Calculation tests are updated where relevant.
* \[ ] Visibility behavior is checked.
* \[ ] Test/build results are reported honestly.
* \[ ] README and environment documentation are updated.

## Legal note

This README is not legal advice. Before a public launch with real household data, review the Indian data-protection requirements and commencement dates applicable at launch, consent/retention/deletion practices, security and incident handling, payment-provider terms, platform policies and provider-specific sharing terms. Consent UI alone does not establish compliance.

## Definition of done

The private pilot is ready for an owner-controlled test when:

* The owner can sign in to a private account; demo mode is disabled in the test deployment.
* A new account receives a private household through the implemented flow.
* Subscriptions can be added, edited and deleted.
* Normalized and annualized figures are correct.
* Dashboard totals update correctly.
* Duplicate alerts make no unsupported sharing claims.
* Manual entry and screenshot OCR work independently of Gmail.
* Unconfirmed extraction is never saved.
* Real-account privacy controls are enforced server-side.
* Deletion behavior is implemented, migrated, tested and documented.
* Gmail remains disabled unless the owner has intentionally configured an allowlisted test account, Google OAuth, the consent migration and a valid private test setup.
* Public Gmail, payment processing and analytics on private routes remain disabled until their separate release requirements are met.
* The app is responsive and deployable.
* Quality checks are run and results recorded.
* Setup, migrations, environment variables, deployment and limitations are documented.

### Coding-agent handoff

At completion, report:

1. Status: working, partially working or blocked.
2. Features actually implemented.
3. Exact setup/run commands.
4. Required/optional environment variables.
5. Migration and seed instructions.
6. Tests/build actually run and outcomes.
7. Deployment status and URL, if deployed.
8. Known bugs and security/privacy gaps.
9. Three highest-priority next actions.

**Project principle:** Ship a small, trustworthy product. An incomplete audit and conservative review alert are better than a promise of universal discovery or invented savings.

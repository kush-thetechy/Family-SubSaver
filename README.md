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

1. Open the app and enter demo mode or sign in.
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

Recommend connecting Gmail as the easiest way to find subscriptions billed through app stores, merchants, or recurring card/bank mandates. The user starts each scan and grants read-only access. Search only the previous **30 or 45 days**, and fetch message contents only for Gmail search results that match the subscription and billing keywords below. Parse in memory, then discard message bodies. For users who do not want to connect Gmail, offer screenshots of the active Google Play and Apple subscription lists instead; these cover store-managed subscriptions, while direct-billed services may need Gmail or manual entry.

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
* Load Microsoft Clarity only after explicit analytics consent. Mask application page content and allow users to revoke consent in Settings.
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

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project's API settings. In Supabase Authentication, configure the site URL and add `http://localhost:3000/auth/callback` as a redirect URL. Apply all SQL migrations in `supabase/migrations/` in filename order before creating accounts. They create private personal households and subscription tables with Row Level Security, plus the Gmail scan quota; family invitations are not enabled yet. Without Supabase configuration, the app remains in demo mode.

Users can create an account or sign in at `/login`. If email confirmation is enabled in Supabase, they must confirm using the link before signing in. Authenticated accounts store subscriptions in Supabase; demo records remain browser-local and are not copied into accounts.

### Connect Gmail for subscription discovery

Gmail discovery is optional, read-only, and explicitly user-triggered. A live scan searches only keyword-matched emails from the previous 30 or 45 days. Use **Preview sample results** on the Import page to explore the review flow without accessing an inbox.

#### Live Google Cloud configuration

1. In Google Cloud Console, create a project, enable the **Gmail API**, and configure the **OAuth consent screen**. For testing, add your Google account under **Test users**.
2. Create an **OAuth client ID** for a **Web application**. Add `http://localhost:3000/api/connectors/gmail/callback` as an authorized redirect URI.
3. In `.env.local`, configure the server-side environment variables:
   ```env
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   FSS_GMAIL_SESSION_SECRET=64-hex-characters-from-a-cryptographically-random-32-byte-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   Generate the local session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Configure a different secret in Vercel for production; Gmail sessions are encrypted into an `HttpOnly` cookie so they survive serverless requests without an in-memory session map.
4. Restart the development server (`npm run dev`).
5. Open the **Import** page, click **Connect Gmail**, review the data disclosure and consent terms, and approve read-only Google access.
6. Select **Past 30 days** or **Past 45 days**, then click **Scan Gmail Inbox**. Each account can run at most five live scans per UTC calendar day; the quota is shared across devices and enforced server-side. The server also enforces the date range even if a request submits a longer range.

#### Discovery architecture & evidence lanes

The discovery engine searches recent keyword matches through three evidence lanes. Gmail's search filters messages before their contents are fetched, the 30/45-day date filter applies to every lane, and a scan stops after 200 unique matching messages. Together with the five-live-scans-per-account-per-day quota, this bounds API use:

* **Store Receipts & Renewals:** Google Play receipts and renewal messages, plus Apple App Store receipts/invoices with subscription or renewal terms. Google Play receipt IDs (`GPA.*`), app names, plan tiers, recurring price and period are captured when present. Apple gross totals are distinguished from subtotals and IGST/taxes.
* **Direct Merchant Billing:** Search for combinations of subscription/renewal terms and billing terms, plus known provider names such as Netflix, Spotify, Disney+ Hotstar, YouTube Premium, Google One, Microsoft 365, Adobe, Dropbox, ChatGPT, Claude, Apple, Airtel and Jio.
* **Bank/Card E-Mandates & Standing Instructions:** Search for e-mandate registrations, SI Hub notices, AutoPay, standing instructions and pre-debit alerts from banks. The current recurring charge is distinguished from the maximum mandate limit/cap (e.g. ₹490 debit vs ₹15,000 cap).
* **Cross-Source Consolidation:** Multiple receipts across months, store order receipts, and bank debit alerts are consolidated into a single candidate with attached source evidence history, rather than creating separate duplicate subscriptions.
* **Conservative Status & Unknown Intervals:** Mandates and receipts are not presumed to be active consumer subscriptions; status is labelled (`Likely Active`, `Needs Confirmation`, `Cancelled / Expired`, `Payment Failed`). Missing billing cycles are marked `unknown` for review rather than defaulting to monthly.

#### Privacy, security & zero-retention policy

* **Server-only OAuth credentials:** Client ID and Client Secret must be configured on the server. The client browser never receives or submits client secrets.
* **Encrypted Gmail session:** Google tokens are sealed with AES-256-GCM in a `Secure`/`HttpOnly` cookie and are never available to browser JavaScript. The encryption key is server-only (`FSS_GMAIL_SESSION_SECRET`); production must configure a stable random 32-byte key so sessions work across Vercel serverless requests.
* **Zero email body retention:** Email bodies are parsed in server memory and immediately discarded. No raw email bodies or personal correspondence are stored or logged.
* **Sensitive financial data protection:** The app never requests or stores full card numbers, CVVs, banking passwords, or OTPs. Card numbers are masked to the last 4 digits (`•••• 4412`) for review identification only.
* **Revocation on disconnect:** Choosing **Disconnect & Revoke** calls Google's token revocation API (`https://oauth2.googleapis.com/revoke`) and clears the encrypted session cookie.

#### Production OAuth verification requirements

Google classifies `https://www.googleapis.com/auth/gmail.readonly` as a **Restricted Scope**. For local testing and internal development, the app functions in Testing mode with configured test users. For a public production deployment, Google requires:
1. Google OAuth App Verification.
2. A publicly accessible Privacy Policy disclosing restricted scope usage.
3. Annual Cloud Application Security Assessment (CASA / Tier 2) verification under Google's API Services User Data Policy.

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
|`NEXT\_PUBLIC\_SUPABASE\_URL`|Required for account sign-in and private subscription storage|
|`NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY`|Required public client key; database access is protected by RLS|
|`GOOGLE\_CLIENT\_ID`|Optional Google OAuth web client ID for live Gmail scanning|
|`GOOGLE\_CLIENT\_SECRET`|Optional server-side Google OAuth client secret|
|`NEXT\_PUBLIC\_APP\_URL`|Public app URL for callbacks/links|

Use placeholders only in `.env.example`. If an optional integration is not configured, show a clear fallback. Demo mode must be labelled.

## Database and demo data

Apply SQL migrations in `supabase/migrations/` to the Supabase project before using real accounts. The initial account migration creates profiles, private personal households, household memberships and RLS-protected subscription storage. No demo seed is applied to authenticated accounts.

Demo data should include three adult demo members and examples across OTT, music, AI productivity, cloud storage and telecom. Include duplicate records, an annual subscription, an unknown sharing rule, a stale catalog item and a hidden subscription. Use fictional or clearly demo-labelled prices unless official current prices are verified.

Demo mode must be labelled and must not imply changes persist to real accounts. Demo data is browser-local and is not loaded into authenticated accounts. New authenticated users start with an empty private household. Family invitations and shared household access are not implemented yet.

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
|Email receipts|Optional, user-triggered Gmail keyword scan limited to the last 30 or 45 days|Supported merchant coverage is limited; only matched message contents are fetched; no continuous scan|
|Bank/card data|Gmail keyword matches for recurring mandate notices; manual entry otherwise|No bank integration or automatic statement analysis in v1|
|UPI AutoPay|Gmail search for mandate and pre-debit notices|Coverage depends on the bank's email wording; user confirmation required|
|Telecom bundles|User-provided plan plus sourced catalog|Offers and eligibility change|
|Cancellation|Provider link where appropriate|App does not cancel subscriptions|

The app may not contain every household subscription. Show audit progress and do not describe an incomplete inventory as exhaustive.

## Roadmap

### Sprint 1 — Core MVP (2–3 days)

* Email/password account creation and sign-in with protected application routes.
* Private per-account household and subscription CRUD with RLS.
* Dashboard and calculations.
* Duplicate review.
* Small sourced catalog.
* Import review flow or explicit manual fallback.
* Gmail OAuth associated with the signed-in account.
* Core access tests and deployable build.

### Sprint 2 — Controlled beta

* Complete family invitations and member lifecycle.
* Add cross-household and privacy-redaction RLS tests before enabling sharing.
* Finish account deletion and privacy notices.
* Improve import handling.
* Test with consenting adult households.

### Sprint 3 — Product validation

* Measure audit completion time.
* Measure import success and recommendation usefulness.
* Test willingness to pay.
* Refine free/premium packaging.
* Expand catalog only when current sources are available.

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

The MVP is ready for a controlled demonstration when:

* A tester can enter demo mode or sign in.
* A household can be created/joined through the implemented flow.
* Subscriptions can be added, edited and deleted.
* Normalized and annualized figures are correct.
* Dashboard totals update correctly.
* Duplicate alerts make no unsupported sharing claims.
* Import is configured or clearly falls back to manual entry.
* Unconfirmed extraction is never saved.
* Real-account privacy controls are enforced server-side.
* Deletion behavior is implemented and documented.
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

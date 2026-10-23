# Privacy policy: factual draft (NOT published)

Status: draft built from how the code works today. It is not legal advice and makes no
promise on behalf of an owner. Not linked from the app. Items in [BRACKETS] must be supplied
by the owner. Operator identity and a support contact were searched for in the repo and docs
and none exist.

Operator: [legal name or individual, to be provided by the owner]
Contact for privacy requests: [email, to be provided by the owner]
Last updated: [date at publication]

## What the app does
Family SubSaver keeps a directory of subscriptions a household pays for. You can add them by
hand, from screenshots, or from a Gmail scan you start yourself.

## Data we store (current behavior)
- Account: email address and sign-in credentials, handled by Supabase Auth.
- Subscription records you save: service, plan, category, price, billing cycle, renewal date,
  who pays, billing channel, notes, visibility (Full details, Totals only, Hidden).
- Household data: household name and members; invitation links (stored only as a hash,
  single use, expire after 7 days); the time you agreed to share with a household.
- Gmail consent record and scan coverage counts (no email content).
- Where stored: Supabase Postgres [region to be confirmed by owner]; hosting on Vercel.

## Gmail (only if you connect it)
- Scope requested: read-only (`gmail.readonly`). Scans start only when you click; there is no
  background scanning. Attachments are not downloaded or read.
- The app searches your mailbox for subscription receipts, renewals and payment mandate
  messages, reads only matched messages during that request, extracts service, amount, cycle
  and dates, and shows candidates. Raw message content is not stored. A subscription is saved
  only after you confirm it.
- The access token is kept in a short-lived, encrypted, HttpOnly cookie, not in the database.
- You can withdraw consent, disconnect (we ask Google to revoke access), delete records that
  came from Gmail, or delete your account, in Settings.

## Family sharing
- A link lets another person join your household only after they sign in with their own
  account and tick a consent box. Each person connects only their own Gmail; nobody can scan
  or use another person's Gmail.
- A member who joins shares: service name, plan, category, price, billing cycle, renewal
  date, and who pays, for entries marked Full details. Entries marked Totals only appear as an
  amount with no name, payer or date. Hidden entries are never shared. Notes and billing
  channel are never shared.
- You can leave at any time; sharing stops immediately and your data stays yours. The owner
  can remove a member or revoke a link.

## Google user data statement (required wording for Gmail verification)
[Use of information received from Google APIs will adhere to the Google API Services User
Data Policy, including the Limited Use requirements.] The owner must confirm this is true
before publishing.

## Not used for
Gmail data is not sold, not used for advertising, not used to train AI models, and is not read
by people [owner to confirm each statement]. The Gmail pipeline makes no hosted-LLM calls.

## Open items for the owner
Retention periods for backups, analytics providers in use (Clarity is not mounted on signed-in
pages), data region, children's data stance, governing law, complaint route, and whether
scheduled scans or attachment reading are ever added (this policy would then need to change
before that behavior is switched on).

# Google verification pack for Gmail read-only access

Status: working draft. Not a submission, not legal advice, not a security assessment.
Nothing here has been submitted to Google. Gmail stays disabled (`GMAIL_MODE=disabled`).

## Two different stages

1. Owner pilot (testing mode). OAuth consent screen in Testing, only Google accounts
   added as test users can connect, server gate `GMAIL_MODE=test` with a user-id allowlist.
   Good for the owner to try a real scan. Not available to the public.
2. Public launch. Any user can connect their own Gmail. `gmail.readonly` is a restricted
   scope. Google's page says apps requesting restricted scopes need verification, and that
   an app which "accesses or has the capability to access Google user data from or through a
   server" must have an annual security assessment by a Google-approved assessor (CASA). The
   same page says restricted-scope verification "can potentially take several weeks".
   Whether this app qualifies for any exception, what the assessment costs, and the real
   timeline are UNKNOWN until checked with Google and an assessor. Do not quote a price or
   duration to the user from this document.
   Source: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
   and https://support.google.com/cloud/answer/13464321

Unverified here: the exact testing-mode limits (test user cap, token lifetime) and the
assessor price. Check the live Google pages before relying on them.

## Current technical state (verified in repo)

- Scope: `https://www.googleapis.com/auth/gmail.readonly` only, PKCE S256, no offline access.
- Production Web client exists in Cloud project turnkey-tribute-506007-r2 ("Family SubSaver
  Production Web"), redirect `https://www.familysubsaver.live/api/connectors/gmail/callback`.
  Credentials are in Vercel production env (secret is type sensitive).
- Controls: user-triggered scan only, no background scan, no attachment download, bounded
  query lanes, no raw mail stored, candidate response omits subject/message id, user confirms
  each saved record, disconnect + revoke + delete. See `docs/gmail-guardrails.md`.

## Artifacts Google will ask for, and what exists

| Artifact | Status |
|---|---|
| Public homepage on a verified domain | familysubsaver.live is live. Domain ownership in Search Console: not confirmed. |
| Public privacy policy URL | MISSING. Needs a hosted page with the owner's legal/contact details. |
| Terms of service URL | MISSING (optional but expected). |
| Limited Use disclosure in privacy policy | MISSING. Required wording: use of Google user data adheres to the Google API Services User Data Policy, including the Limited Use requirements. |
| Authorised domains + branding on consent screen | Partly set (testing). Production branding not submitted. |
| Scope justification | Draft below. |
| Demo video (OAuth flow, consent screen, scope use, data shown in app) | Not recorded. Script below. |
| Security assessment (CASA) | Not started. Cost, timeline and whether it is required for this exact setup: unknown. Any spend needs owner approval. |
| Data deletion and retention statement | In guardrails doc; needs to be in privacy policy. |

## Draft scope justification (gmail.readonly)

Family SubSaver helps a person find the subscriptions they pay for. When the user clicks
"Scan Gmail", the app searches the user's mailbox for receipts, renewal notices and payment
mandate messages from the last 13 months, reads only matched messages on the server for
the duration of the request, extracts service name, amount, billing cycle and renewal date,
and shows the result to the user. Nothing is saved until the user confirms. Raw message
content is not stored. A narrower scope (gmail.metadata) cannot read message bodies, which
hold the amount and renewal date, so it cannot provide this feature.

## Demo video script (about 3 minutes)

1. Open the app, sign in. Show the consent text and tick it.
2. Click Connect Gmail. Show the Google consent screen with the app name and the read-only scope.
3. Click Scan. Show the candidate list with evidence states (active, cancelled, mandate revoked).
4. Select candidates, confirm, show them saved in the Subscriptions list.
5. Settings: withdraw consent, disconnect Gmail, delete Gmail-imported records.
6. State that Google data is not used for ads, not sold, not used to train models, and humans
   do not read it.

## What needs the owner (cannot be done by the agent)

- Privacy policy and terms content with owner legal name and support email.
- Decision and budget for the CASA assessment and who the named incident lead is.
- Search Console domain verification (needs DNS access).
- Submitting the verification request from the owner's Google account.

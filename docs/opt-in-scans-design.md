# Design: opt-in recurring scans and attachment reading

Status: DESIGN ONLY. Nothing here is built or enabled. Current live behavior stays:
scans start only when the user clicks, no background scanning, attachments are not
downloaded. Any code for this must ship behind flags that default off and must not change
what live processing does until the owner decides and the consent text below is shown.

## Why these change the risk profile
- Recurring scans need a long-lived credential (offline access / refresh token) kept on our
  side. Today the access token lives only in a short-lived encrypted cookie and the OAuth
  request has no offline access.
- Attachments (PDF invoices) are more sensitive and larger than message text.
- Both likely change what must be described to Google (scope use, data handling) and in the
  privacy policy. Whether they change the verification or security-assessment burden is
  UNKNOWN; ask Google/assessor before building for production.

## Recurring scans (proposal)
1. Separate consent record, version `gmail-recurring-v1`, shown on its own screen, off by
   default, withdrawable in one click. Plain words: what runs, how often, what is read, where
   results go, how to stop.
2. Per-user setting: frequency (weekly or monthly), window (since last scan, max 13 months
   first time), next-run time. Scheduler is a server job that only runs for users with the
   consent and a valid stored credential.
3. Credential storage: refresh token encrypted at rest with a server key, in a table with
   RLS that no client role can read; deleted on disconnect, consent withdrawal and account
   deletion; Google revocation attempted on each.
4. Results never auto-save. A scan produces candidates in an inbox ("3 new things found");
   the user confirms, same as today. Optional notification to the user, not to family.
5. Quota and cost: reuse the per-user daily quota; add a global rate limit and back-off on
   Google errors; scan failures notify the user and pause after N failures.
6. Family: each person's schedule and credential are their own. The owner cannot enable,
   see or use another member's scan. Only confirmed records with Full details are shared.
7. Kill switch: `GMAIL_RECURRING_ENABLED` server flag, default false, plus the existing
   `GMAIL_MODE` gate. Either off stops all runs.
8. Tests required before enabling: consent gating, no run without consent, run stops on
   withdraw, token deletion on disconnect, quota, synthetic mailbox fixtures only.

## Attachment reading (proposal)
1. Separate consent `gmail-attachments-v1`, off by default. Not implied by recurring scans.
2. Only attachments on messages already matched by the subscription search, only PDF and
   common image types, size cap (for example 5 MB), page cap, never stored: parse in memory,
   keep extracted fields (amount, date, merchant), discard bytes.
3. Parsing runs in the server process with no third-party or hosted-AI upload unless the
   owner separately approves a named provider and the policy names it.
4. Kill switch: `GMAIL_ATTACHMENTS_ENABLED`, default false.
5. Tests: oversized, malformed and hostile PDFs, no bytes in logs or DB, canary fixtures.

## Open decisions for the owner
- Frequency options and whether to allow daily.
- Whether recurring scans are part of the paid tier (₹30 interpretation still provisional).
- Whether to ask Google about the impact on verification before building.
- Whether any hosted OCR/LLM provider is acceptable (default: no).

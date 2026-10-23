# Gmail owner pilot (testing mode) runbook

Status: prepared, NOT executed. Gmail is `GMAIL_MODE=disabled` in production. This pilot is
not public access: it lets the owner connect their own Gmail only. No public flag is touched
(`GMAIL_PUBLIC_LAUNCH_APPROVED`, `GMAIL_GOOGLE_VERIFICATION_CONFIRMED`,
`GMAIL_SECURITY_ASSESSMENT_CONFIRMED`, `GMAIL_PRIVACY_REVIEW_CONFIRMED` stay unset/false).

## Already in place
- Production Web OAuth client with the production callback; credentials in Vercel production
  env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` sensitive).
- Single scope `gmail.readonly`, PKCE, state, consent gate, quota, coverage, disconnect,
  delete (see `docs/gmail-guardrails.md`). Migrations for consent and 13-month coverage are
  applied in production.
- Test-mode gate: `GMAIL_MODE=test` allows only Supabase user UUIDs listed in
  `GMAIL_TESTER_USER_IDS`.

## Steps the owner must approve (each is a real-data action)
1. Google Cloud, Auth Platform, Audience: confirm status is Testing and add the owner's own
   Google account as a test user. (Current state not re-verified in this session.)
2. Find the owner's app user UUID (Supabase Auth user list) and set
   `GMAIL_TESTER_USER_IDS=<uuid>` in Vercel production.
3. Set `GMAIL_MODE=test` and redeploy. Do not set any public flag.
4. Owner signs in, reads the consent text, ticks it, clicks Connect Gmail, approves Google's
   screen, runs one scan (user-triggered, 30-day window first).
5. Check: candidates look right, nothing saved until confirmed, no raw email content stored,
   Disconnect revokes, "Delete Gmail-imported records" works.
6. Roll back by setting `GMAIL_MODE=disabled` and redeploying (confirms scans, OAuth start
   and callback are denied).

## Not covered by the pilot
- Other users (including family members) connecting Gmail: they would need to be added as
  Google test users and to the allowlist; the product treats each person's Gmail as their own.
- Anything for public launch: see `docs/google-verification-pack.md`.
- Testing-mode limits and token lifetime: verify on Google's live pages.

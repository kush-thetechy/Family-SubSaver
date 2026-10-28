# Family SubSaver: Gmail restricted-scope review preparation

Working draft updated 28 October 2026. Not submitted. No verification receipt or security assessment. No public Gmail launch.

## Current state

- Production app: https://www.familysubsaver.live . Public privacy and terms pages exist.
- Production Gmail gate remains `GMAIL_MODE=test` and owner UUID allowlist only. Do not describe it as publicly available, or test the owner account.
- Google project: turnkey-tribute-506007-r2 (891467970828). OAuth audience remains External / Testing at last inspection.
- Search Console domain property familysubsaver.live was verified using DNS under the MU account. Keep the verification TXT record.
- Branding saved as FamilySubSaver with www homepage, privacy and terms URLs and familysubsaver.live authorized domain. This is not completed Google branding verification.
- Three OAuth clients remain: Production Web, Local and Web client 1. Before submission, identify which clients are part of the requested review. Do not delete or change existing clients without a grounded plan.
- Clarity recording is disabled across the app, including previously accepted analytics choices. Historical analytics are not claimed erased.
- The exact approved Limited Use statement and accurate provider/deletion disclosures are prepared offline. They are not yet published.
- Response-cache hardening is tested offline, not deployed. Do not attest it is live.

## Technical data flow

Only gmail.readonly is requested. PKCE/state/user binding protects the authorization flow. The app uses no offline refresh token. Gmail access tokens are kept in encrypted HttpOnly session cookies, bounded by one hour or token lifetime, rather than in the database. A user-bound encrypted scan cursor can carry pending message identifiers and pagination state for 30 minutes.

Scans require the user's current consent and manual initiation. Matching message text is processed server-side for subscription details. Attachments are not fetched. No background scanning or hosted language-model processing is used. Candidate responses omit subject and sender. Derived merchant, amount and date values are still Google user data. The user chooses what becomes a saved subscription. Consent, withdrawal events, scan coverage/quota, import deduplication keys and first-use records are also stored.

Application code does not intentionally log raw message bodies or access tokens. This is not a claim of universal absence from provider-managed telemetry. Vercel and Supabase process operational metadata under their own policies. No configured Vercel drains were shown for the correct team, and Supabase log-drain API returned an empty list. Those checks do not prove universal retention or immediate deletion from recovery systems.

Withdrawal stops future scans. Disconnect clears the browser Gmail session and attempts token revocation, with an error if Google revocation cannot be confirmed. Deleting Gmail-imported subscriptions does not also erase consent/quota/usage records. Account deletion removes associated active database records. Provider operational logs and recovery retention are separate.

## Draft scope justification

Family SubSaver helps users find and manage their recurring subscriptions. When the user starts a scan, the app searches Gmail for relevant subscription receipts, renewal notices and payment mandate messages within bounded search lanes, reads matching messages on the server for that request, and extracts service, amount, billing cycle and renewal date for suggestions. Users choose which suggestions to save. Raw message bodies are not saved in the app database. The narrower gmail.metadata scope cannot read the body text containing billing amounts and renewal dates, and cannot support this feature. The requested scope is read-only; the app does not send, edit or delete Gmail messages.

Google's current Gmail policy lists productivity apps and email-derived reporting/monitoring for the user's benefit among approved cases. Subscription reporting appears related, but acceptance and any exception remain Google's decisions, not established by this draft. Its Limited Use rules cover derived data and restrict transfers and human access. General API Terms section 5(e) qualifies permanent-copy restrictions with express content-owner permission: https://developers.google.com/terms . The app discloses structured record storage, requires explicit selection/save, provides deletion/export and now describes retention beside the save action. This supports user-directed storage of subscription records, not an unrestricted copying exception. Do not claim Google has accepted the use case or granted an assessment exemption.

## Final demonstration: still required

The old localhost recording shows behavior only. It has the earlier branding, temporary/local client and no browser address bar. Do not submit it as the finished artifact.

Prepare a new English recording with browser chrome/address bar visible, current FamilySubSaver branding and the client ID in the OAuth URL. Use only an approved test mailbox and a disposable fixture, never owner/personal Gmail. Use the intended production client and stable completed build. If additional clients are included in the review, show the requested scope use for each relevant client as Google's guide requires.

1. Open the production homepage and privacy policy, with URL visible.
2. Sign in to an approved disposable fixture. Show the in-app Gmail disclosure and consent choice.
3. Start Connect Gmail. Show the OAuth URL/client ID, app branding and requested read-only permission. Do not reveal credentials or unrelated account data.
4. Complete the authorized test mailbox flow. Start a manual scan and show results, while hiding unrelated personal mail and mailbox identifiers where possible without concealing review-relevant screens.
5. Select a suggestion and show the saved subscription. Show no unrelated records.
6. Demonstrate withdrawal, disconnect/revocation and deletion of Gmail-imported subscriptions. Explain that imported-subscription deletion and account deletion have different scopes.
7. Show the no-advertising/no-sale/no-model-training use, accurately, without the unsupported absolute statement that no person can ever read mail.
8. Inspect the full video for privacy and required screens. Upload through an authorized YouTube account as Unlisted and use the resulting actual URL in Google's form. A local MP4 alone is not the specified finished artifact. Any account creation or third-party publication still needs appropriate authority.

## Submission sequence and boundaries

- Publish only the final tested privacy and cache-hardening changes in a suitable stable window. Do not deploy WIP to support a recording.
- Confirm live policy wording, branding, domains and scope/client selections match the packet.
- Publish/verify branding as Google directs, then request restricted-scope data-access review truthfully. Check the actual console flow and report its receipt or exact blocker.
- Server-side restricted Gmail access normally requires the annual security assessment described by Google. No paid assessment, booking, upgrade or other financial commitment is authorized. Surface any mandatory paid step as a blocker, not an already completed requirement.
- Keep public Gmail gate closed until suitable clearance; submitting is not clearance.
- Independently resolve the Vercel plan issue. Hobby restricts commercial use and the site has payment checkout, but exact active Hobby vs Pro trial is unconfirmed. Existing token cannot read team billing.plan (403). Owner Billing readback has been requested. No violation is asserted and no upgrade/migration/checkout change is authorized.

## Sources checked

- Restricted-scope verification and video requirements: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Verification help: https://support.google.com/cloud/answer/13464321
- Limited Use policy: https://developers.google.com/terms/api-services-user-data-policy
- Runtime-log fields: https://vercel.com/docs/observability/runtime-logs
- Drains: https://vercel.com/docs/drains
- Hobby plan: https://vercel.com/docs/plans/hobby
- Commercial-use rule: https://vercel.com/docs/limits/fair-use-guidelines
- Billing navigation: https://vercel.com/docs/pricing/understanding-my-invoice
- Team billing API: https://vercel.com/docs/rest-api/teams/get-a-team
- Supabase logs: https://supabase.com/docs/guides/platform/logs
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Log-drain API: https://supabase.com/docs/reference/api/v2-list-log-drains

Gmail product policy was retrieved directly after the readable-page fetch timed out: https://developers.google.com/workspace/gmail/api/policy . Current allowed-use, derived-data, human-access and caching wording reviewed. Google alone confirms the submitted use case and any exception.

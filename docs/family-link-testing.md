# Family link: how it was tested

1. `npm test` runs `src/lib/__tests__/db/*`: all migrations applied to an in-process Postgres (PGlite) with a stub `auth` schema, then RLS and function behaviour checked as different users.
2. Browser end-to-end against a separate, disposable Supabase project (never the production one):
   - apply the migrations in `supabase/migrations/` in order,
   - create two users with the Auth admin API using `email_confirm: true` (no emails are sent),
   - run the app with `NEXT_PUBLIC_ENABLE_FAMILY_LINK=true` and drive it with a headless browser: owner creates a link, member signs in from the link, sees the consent page, joins, the owner sees the member's non-hidden subscriptions, a hidden one and the notes never appear, a "totals only" one has no name, a reused link is rejected, and leaving removes the member's rows from the owner's view.

Before enabling in production: apply the migration to the production project (additive, new table and functions plus one nullable column), then set `NEXT_PUBLIC_ENABLE_FAMILY_LINK=true`. Rollback: set the flag false; to remove, drop the functions, `household_invitations`, and the `share_consented_at` column.

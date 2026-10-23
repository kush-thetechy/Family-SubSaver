# Archived SQL (do not apply)

`001_initial_schema.sql.txt` is the original multi-household schema draft. It was
superseded by `supabase/migrations/20261021000100_user_accounts.sql`, which creates
the same tables (`profiles`, `households`, `household_members`) with a different,
private-account shape. Applying both fails on duplicate tables, and the live private
Supabase project was verified on 2026-10-24 to contain only the 2026-10-21 chain
(no `001` objects such as `audit_events` or `imports`).

It is kept as a design reference for later family-sharing work only. It is renamed
`.txt` so migration tooling never picks it up. Do not apply it.

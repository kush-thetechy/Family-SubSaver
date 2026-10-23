-- Idempotency for imports. A retry or double click of the same import operation (same user,
-- same set of source messages) cannot create a second row. This is NOT a uniqueness rule on
-- service names: separate plans, accounts or payers of the same service have different keys,
-- and manual rows have no key.
-- Rollback: drop index public.subscriptions_import_key_uniq; (the column can stay unused).
alter table public.subscriptions add column import_key text;
create unique index subscriptions_import_key_uniq
  on public.subscriptions (payer_id, import_key)
  where import_key is not null;

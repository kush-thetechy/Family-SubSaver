-- Verified payment events that could not be tied to a checkout session we created
-- (for example a very late retry after session cleanup). Kept for manual reconciliation so a
-- real payment is never silently lost. Only ids, amount, currency, mode and time. Server only.
create table public.unmatched_payments (
  provider_payment_id text primary key,
  claimed_user_id uuid,
  checkout_session_id text,
  mode text not null check (mode in ('test', 'live')),
  amount_minor integer,
  currency text,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.unmatched_payments enable row level security;
revoke all on public.unmatched_payments from anon, authenticated;
grant select, insert, update on public.unmatched_payments to service_role;

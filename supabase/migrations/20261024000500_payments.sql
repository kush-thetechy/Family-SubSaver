-- One-time fee payments. DRAFT: not applied. Billing stays off until the owner enables it.
-- Written only by the server (service role) after a verified Dodo Payments webhook.
-- Stores payment metadata only: no card, name, email or address fields.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'dodo' check (provider in ('dodo')),
  provider_payment_id text not null unique,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (char_length(currency) = 3),
  status text not null check (status in ('paid', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id);
alter table public.payments enable row level security;
create policy "Users read their own payments" on public.payments for select
  using (user_id = (select auth.uid()));
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant select, insert, update on public.payments to service_role;

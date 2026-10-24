-- One-time fee payments. DRAFT: not applied. Billing stays off until the owner enables it.
-- Written only by the server (service role) after a verified provider webhook.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('razorpay')),
  provider_order_id text not null unique,
  provider_payment_id text,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id);
alter table public.payments enable row level security;
create policy "Users read their own payments" on public.payments for select
  using (user_id = (select auth.uid()));
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

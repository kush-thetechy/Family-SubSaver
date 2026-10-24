-- Separate TEST from LIVE payments, bind payments to server-created checkout sessions, allow refunds.
alter table public.payments add column mode text not null default 'test' check (mode in ('test', 'live'));
alter table public.payments add column checkout_session_id text;
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('paid', 'failed', 'refunded'));

create table public.checkout_sessions (
  session_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('test', 'live')),
  created_at timestamptz not null default now()
);
create index checkout_sessions_user_idx on public.checkout_sessions (user_id);
alter table public.checkout_sessions enable row level security;
revoke all on public.checkout_sessions from anon, authenticated;
grant select, insert on public.checkout_sessions to service_role;

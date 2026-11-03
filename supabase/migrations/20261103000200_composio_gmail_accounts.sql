-- Composio connected Gmail account per SubSaver user (branch feature/composio-gmail).
-- NOT applied to any database. Apply only after the owner approves the Composio route.
-- Service-role access only: RLS enabled with no policies, so clients cannot read or write.
create table if not exists public.gmail_composio_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connected_account_id text not null,
  auth_config_id text,
  gmail_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gmail_composio_accounts enable row level security;

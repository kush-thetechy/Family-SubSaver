-- Composio connected Gmail account per SubSaver user (branch feature/composio-gmail).
-- NOT applied to any database. Apply only after the owner approves the Composio route.
-- Service-role access only: RLS enabled with no policies, so clients cannot read or write.
--
-- linked_*  : the account the user completed connecting; scans use only this.
-- pending_* : a connect attempt in progress (one-time state, hashed, with expiry).
-- A pending attempt never overwrites the linked account.
create table if not exists public.gmail_composio_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connected_account_id text,
  auth_config_id text,
  gmail_email text,
  pending_account_id text,
  pending_state_hash text,
  pending_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gmail_composio_accounts enable row level security;

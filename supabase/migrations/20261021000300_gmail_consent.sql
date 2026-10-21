create table public.gmail_consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  consented_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table public.gmail_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  event_type text not null check (event_type in ('granted', 'withdrawn')),
  occurred_at timestamptz not null default now()
);

alter table public.subscriptions
  add column source_type text not null default 'manual'
    check (source_type in ('manual', 'screenshot', 'gmail')),
  add column source_connection_id text,
  add column imported_at timestamptz;

alter table public.gmail_consents enable row level security;
alter table public.gmail_consent_events enable row level security;

revoke all on table public.gmail_consents from public, anon, authenticated;
revoke all on table public.gmail_consent_events from public, anon, authenticated;

create policy "Users can read their own Gmail consent events"
  on public.gmail_consent_events for select
  using (user_id = (select auth.uid()));

create policy "Users can read their own Gmail consent"
  on public.gmail_consents for select
  using (user_id = (select auth.uid()));

grant select on public.gmail_consents to authenticated;
grant select on public.gmail_consent_events to authenticated;

create function public.grant_own_gmail_consent(consent_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if consent_version is distinct from 'gmail-discovery-v1' then
    raise exception using errcode = '22023', message = 'Unsupported consent version';
  end if;

  insert into public.gmail_consents (user_id, version)
  values (current_user_id, consent_version)
  on conflict (user_id, version) do update
  set consented_at = now();

  insert into public.gmail_consent_events (user_id, version, event_type)
  values (current_user_id, consent_version, 'granted');
end;
$$;

create function public.withdraw_own_gmail_consent(consent_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if consent_version is distinct from 'gmail-discovery-v1' then
    raise exception using errcode = '22023', message = 'Unsupported consent version';
  end if;

  delete from public.gmail_consents
  where user_id = current_user_id and version = consent_version;

  insert into public.gmail_consent_events (user_id, version, event_type)
  values (current_user_id, consent_version, 'withdrawn');
end;
$$;

revoke all on function public.grant_own_gmail_consent(text) from public, anon;
revoke all on function public.withdraw_own_gmail_consent(text) from public, anon;
grant execute on function public.grant_own_gmail_consent(text) to authenticated;
grant execute on function public.withdraw_own_gmail_consent(text) to authenticated;

create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.uid() is null) then
    raise exception 'Authentication is required';
  end if;

  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

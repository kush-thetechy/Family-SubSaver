-- Household invitations (DRAFT, not applied anywhere).
-- Gated off in the app by NEXT_PUBLIC_ENABLE_HOUSEHOLD_INVITES (default false).
-- This migration only adds the invitation table and the accept/revoke functions.
-- It deliberately does NOT widen read access to other members' subscriptions.
-- That needs separate cross-household RLS tests against a real Postgres first.

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invited_email text not null check (invited_email = lower(trim(invited_email)) and position('@' in invited_email) > 1),
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique check (length(token_hash) = 64),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  consent_acknowledged boolean not null check (consent_acknowledged),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);

create unique index household_invitations_open_idx
  on public.household_invitations (household_id, invited_email)
  where accepted_at is null and revoked_at is null;

alter table public.household_invitations enable row level security;

-- Only active owners/admins of the household can see its invitations.
create policy "Household owners and admins read invitations"
  on public.household_invitations for select
  using (
    exists (
      select 1 from public.household_members m
      where m.household_id = household_invitations.household_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "Household owners and admins create invitations"
  on public.household_invitations for insert
  with check (
    invited_by = (select auth.uid())
    and exists (
      select 1 from public.household_members m
      where m.household_id = household_invitations.household_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- Revoke by update only; accepted_* columns are changed solely by the function below.
create policy "Household owners and admins revoke invitations"
  on public.household_invitations for update
  using (
    accepted_at is null
    and exists (
      select 1 from public.household_members m
      where m.household_id = household_invitations.household_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (accepted_at is null and accepted_by is null);

revoke all on public.household_invitations from anon, authenticated;
grant select, insert on public.household_invitations to authenticated;
grant update (revoked_at) on public.household_invitations to authenticated;

-- Accept: the signed-in user's verified auth email must match the invited email.
create function public.accept_household_invitation(invitation_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invitations;
  caller_email text;
  caller_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select lower(trim(email))
    into caller_email
    from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
  if caller_email is null then
    raise exception 'Verified email required' using errcode = '42501';
  end if;

  select * into inv from public.household_invitations
   where token_hash = invitation_token_hash
     and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found or inv.invited_email <> caller_email then
    -- Same error for unknown, expired, revoked, and wrong-recipient tokens.
    raise exception 'Invitation not valid' using errcode = 'P0002';
  end if;

  select name into caller_name from public.profiles where id = (select auth.uid());

  insert into public.household_members (household_id, user_id, role, name, email, status)
  values (inv.household_id, (select auth.uid()), inv.role, coalesce(caller_name, caller_email), caller_email, 'active')
  on conflict (household_id, user_id) do nothing;

  update public.household_invitations
     set accepted_at = now(), accepted_by = (select auth.uid())
   where id = inv.id;

  return inv.household_id;
end;
$$;

revoke all on function public.accept_household_invitation(text) from public, anon;
grant execute on function public.accept_household_invitation(text) to authenticated;

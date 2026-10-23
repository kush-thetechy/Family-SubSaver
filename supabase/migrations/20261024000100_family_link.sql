-- Family link (consent-scoped household sharing). NOT applied to any live project.
-- Model:
--  * An owner/admin creates a single-use link (only a SHA-256 hash is stored).
--  * A signed-in, email-verified person opens it, sees what is shared, and accepts
--    with explicit consent. They become a household member (role 'member').
--  * Members keep their OWN subscriptions and their OWN Gmail connection. Nothing is
--    copied. The household sees a metadata-only projection of subscriptions whose
--    payer is a consenting member. Leaving or removal stops sharing immediately.
--  * No mailbox content, tokens, notes or Gmail consent rows are ever exposed.

alter table public.household_members
  add column if not exists share_consented_at timestamptz default now();

update public.household_members
   set share_consented_at = coalesce(share_consented_at, joined_at)
 where role = 'owner';

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  created_by uuid not null references public.profiles (id) on delete cascade,
  label text check (label is null or length(label) <= 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);

create index household_invitations_household_idx on public.household_invitations (household_id);

alter table public.household_invitations enable row level security;

create or replace function public.is_household_manager(h uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
$$;

create or replace function public.is_household_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
$$;

revoke all on function public.is_household_manager(uuid), public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_manager(uuid), public.is_household_member(uuid) to authenticated;

create policy "Managers read their household invitations"
  on public.household_invitations for select
  using (public.is_household_manager(household_id));

revoke all on public.household_invitations from anon, authenticated;
grant select on public.household_invitations to authenticated;

-- Create a link. Client generates a random token and sends only its SHA-256 hex.
create function public.create_household_invitation(invitation_token_hash text, invitation_label text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid;
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select household_id into hh from public.household_members
   where user_id = (select auth.uid()) and status = 'active' and role = 'owner'
   order by joined_at limit 1;
  if hh is null then
    raise exception 'Only a household owner can create links' using errcode = '42501';
  end if;
  if (select count(*) from public.household_invitations
       where household_id = hh and accepted_at is null and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'Too many open links' using errcode = '54000';
  end if;
  insert into public.household_invitations (household_id, token_hash, created_by, label)
  values (hh, invitation_token_hash, (select auth.uid()), invitation_label)
  returning id into new_id;
  return new_id;
end;
$$;

create function public.revoke_household_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_invitations
     set revoked_at = now()
   where id = invitation_id and accepted_at is null and revoked_at is null
     and public.is_household_manager(household_id);
end;
$$;

-- Preview what a link grants, without accepting it (signed-in, verified users only).
create function public.preview_household_invitation(invitation_token_hash text)
returns table (household_name text, owner_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return query
    select h.name, p.name
      from public.household_invitations i
      join public.households h on h.id = i.household_id
      join public.profiles p on p.id = h.created_by
     where i.token_hash = invitation_token_hash
       and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
  if not found then
    raise exception 'Invitation not valid' using errcode = 'P0002';
  end if;
end;
$$;

create function public.accept_household_invitation(invitation_token_hash text, consent boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invitations;
  caller uuid := (select auth.uid());
  caller_email text;
  caller_name text;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if consent is distinct from true then
    raise exception 'Explicit consent required' using errcode = '42501';
  end if;
  select lower(trim(email)) into caller_email
    from auth.users where id = caller and email_confirmed_at is not null;
  if caller_email is null then
    raise exception 'Verified email required' using errcode = '42501';
  end if;

  select * into inv from public.household_invitations
   where token_hash = invitation_token_hash
     and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then
    raise exception 'Invitation not valid' using errcode = 'P0002';
  end if;
  if inv.created_by = caller or exists (
       select 1 from public.households h where h.id = inv.household_id and h.created_by = caller) then
    raise exception 'Invitation not valid' using errcode = 'P0002';
  end if;

  select name into caller_name from public.profiles where id = caller;

  insert into public.household_members (household_id, user_id, role, name, email, status, share_consented_at)
  values (inv.household_id, caller, 'member', coalesce(caller_name, caller_email), caller_email, 'active', now())
  on conflict (household_id, user_id) do update
    set status = 'active', share_consented_at = now();

  update public.household_invitations
     set accepted_at = now(), accepted_by = caller
   where id = inv.id;

  return inv.household_id;
end;
$$;

-- A member stops sharing and leaves. Their own subscriptions and Gmail link are untouched.
create function public.leave_household(h uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.household_members
   where household_id = h and user_id = (select auth.uid()) and role <> 'owner';
end;
$$;

create function public.remove_household_member(h uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_household_manager(h) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.household_members
   where household_id = h and user_id = member and role <> 'owner';
end;
$$;

-- Roster visible to every active member of the household.
create function public.household_roster(h uuid)
returns table (user_id uuid, name text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.name, m.role, m.joined_at
    from public.household_members m
   where m.household_id = h and m.status = 'active' and public.is_household_member(h)
$$;

-- Metadata-only shared view of subscriptions. Only consenting members' non-hidden rows.
-- Deliberately excludes notes, billing_channel and any Gmail data.
create function public.household_shared_subscriptions(h uuid)
returns table (
  id uuid, payer_id uuid, payer_name text, service_name text, plan_name text,
  category text, billing_cycle text, amount_paise bigint, renewal_date date,
  is_active boolean, visibility text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.payer_id, m.name,
         case when s.visibility = 'totals_only' then 'Private subscription' else s.service_name end,
         case when s.visibility = 'totals_only' then null else s.plan_name end,
         case when s.visibility = 'totals_only' then 'other' else s.category end,
         s.billing_cycle,
         s.amount_paise,
         case when s.visibility = 'totals_only' then null else s.renewal_date end,
         s.is_active, s.visibility
    from public.subscriptions s
    join public.household_members m
      on m.user_id = s.payer_id and m.household_id = h
     and m.status = 'active' and m.share_consented_at is not null
   where public.is_household_member(h)
     and s.visibility <> 'hidden'
$$;

revoke all on function
  public.create_household_invitation(text, text),
  public.revoke_household_invitation(uuid),
  public.preview_household_invitation(text),
  public.accept_household_invitation(text, boolean),
  public.leave_household(uuid),
  public.remove_household_member(uuid, uuid),
  public.household_roster(uuid),
  public.household_shared_subscriptions(uuid)
  from public, anon;
grant execute on function
  public.create_household_invitation(text, text),
  public.revoke_household_invitation(uuid),
  public.preview_household_invitation(text),
  public.accept_household_invitation(text, boolean),
  public.leave_household(uuid),
  public.remove_household_member(uuid, uuid),
  public.household_roster(uuid),
  public.household_shared_subscriptions(uuid)
  to authenticated;

-- Households the caller has joined as a member (so they can see who they share with and leave).
create function public.my_linked_households()
returns table (household_id uuid, household_name text, owner_name text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id, h.name, p.name, m.joined_at
    from public.household_members m
    join public.households h on h.id = m.household_id
    join public.profiles p on p.id = h.created_by
   where m.user_id = (select auth.uid()) and m.role = 'member' and m.status = 'active'
$$;

revoke all on function public.my_linked_households() from public, anon;
grant execute on function public.my_linked_households() to authenticated;

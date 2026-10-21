create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  name text not null,
  email text not null,
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'invited')),
  unique (household_id, user_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  service_name text not null check (length(trim(service_name)) > 0),
  plan_name text,
  category text not null check (category in (
    'ott', 'music', 'ai', 'cloud', 'telecom', 'gaming', 'news',
    'utilities', 'fitness', 'other'
  )),
  billing_cycle text not null check (billing_cycle in (
    'monthly', 'quarterly', 'half_yearly', 'annual', 'prepaid', 'one_time'
  )),
  amount_paise bigint not null check (amount_paise >= 0),
  validity_days integer check (validity_days is null or validity_days > 0),
  payer_id uuid not null references public.profiles (id) on delete cascade,
  user_ids uuid[] not null default '{}',
  billing_channel text,
  renewal_date date,
  is_active boolean not null default true,
  visibility text not null default 'full_details' check (visibility in (
    'full_details', 'totals_only', 'hidden'
  )),
  source text not null check (source in ('manual', 'import')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payer_id = any(user_ids))
);

create index subscriptions_household_id_idx
  on public.subscriptions (household_id);
create index subscriptions_payer_id_idx
  on public.subscriptions (payer_id);
create index household_members_user_id_idx
  on public.household_members (user_id);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.subscriptions enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users can read their own household"
  on public.households for select
  using (created_by = (select auth.uid()));

create policy "Users can read their own membership"
  on public.household_members for select
  using (user_id = (select auth.uid()));

create policy "Users can read their own subscriptions"
  on public.subscriptions for select
  using (payer_id = (select auth.uid()));

create policy "Users can add their own subscriptions"
  on public.subscriptions for insert
  with check (
    payer_id = (select auth.uid())
    and user_ids <@ array[(select auth.uid())]
    and exists (
      select 1 from public.household_members
      where household_members.household_id = subscriptions.household_id
        and household_members.user_id = (select auth.uid())
        and household_members.status = 'active'
    )
  );

create policy "Users can update their own subscriptions"
  on public.subscriptions for update
  using (payer_id = (select auth.uid()))
  with check (
    payer_id = (select auth.uid())
    and user_ids <@ array[(select auth.uid())]
    and exists (
      select 1 from public.household_members
      where household_members.household_id = subscriptions.household_id
        and household_members.user_id = (select auth.uid())
        and household_members.status = 'active'
    )
  );

create policy "Users can delete their own subscriptions"
  on public.subscriptions for delete
  using (payer_id = (select auth.uid()));

grant select, update on public.profiles to authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;

create function public.create_household_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
  new_household_id uuid;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Account holder'
  );

  insert into public.profiles (id, name, email)
  values (new.id, display_name, coalesce(new.email, ''));

  insert into public.households (name, created_by)
  values (display_name || '''s Household', new.id)
  returning id into new_household_id;

  insert into public.household_members (
    household_id, user_id, role, name, email, status
  )
  values (
    new_household_id, new.id, 'owner', display_name, coalesce(new.email, ''), 'active'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_household_for_new_user();

insert into public.profiles (id, name, email)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Account holder'
  ),
  coalesce(users.email, '')
from auth.users as users
on conflict (id) do nothing;

insert into public.households (name, created_by)
select profiles.name || '''s Household', profiles.id
from public.profiles as profiles
left join public.households as households
  on households.created_by = profiles.id
where households.id is null;

insert into public.household_members (
  household_id, user_id, role, name, email, status
)
select
  households.id,
  profiles.id,
  'owner',
  profiles.name,
  profiles.email,
  'active'
from public.profiles as profiles
join public.households as households on households.created_by = profiles.id
left join public.household_members as members
  on members.household_id = households.id
 and members.user_id = profiles.id
where members.id is null;

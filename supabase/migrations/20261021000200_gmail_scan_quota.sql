create table public.gmail_scan_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  usage_date date not null,
  scan_count integer not null check (scan_count between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table public.gmail_scan_usage enable row level security;
revoke all on public.gmail_scan_usage from anon, authenticated;

create function public.consume_gmail_scan_quota()
returns table (
  allowed boolean,
  scans_remaining integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := (now() at time zone 'UTC')::date;
  resulting_scan_count integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  insert into public.gmail_scan_usage as quota_row (
    user_id,
    usage_date,
    scan_count
  )
  values (current_user_id, current_usage_date, 1)
  on conflict (user_id) do update
  set
    usage_date = excluded.usage_date,
    scan_count = case
      when quota_row.usage_date = excluded.usage_date then quota_row.scan_count + 1
      else 1
    end,
    updated_at = now()
  where
    quota_row.usage_date < excluded.usage_date
    or (
      quota_row.usage_date = excluded.usage_date
      and quota_row.scan_count < 5
    )
  returning quota_row.scan_count into resulting_scan_count;

  if found then
    return query
    select
      true,
      5 - resulting_scan_count,
      ((current_usage_date + 1)::timestamp at time zone 'UTC');
    return;
  end if;

  return query
  select
    false,
    0,
    ((current_usage_date + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.consume_gmail_scan_quota() from public, anon, authenticated;
grant execute on function public.consume_gmail_scan_quota() to authenticated;

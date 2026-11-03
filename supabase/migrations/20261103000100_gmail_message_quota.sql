-- Quota by emails actually processed per UTC day, not scan count.
-- Owner decision 3 Nov 2026: cancelled scans that never fetched messages must
-- not consume allowance. Existing rows keep their usage_date; the old scan
-- count becomes a small message count, so today's users are not over-counted.

alter table public.gmail_scan_usage
  drop constraint if exists gmail_scan_usage_scan_count_check;
alter table public.gmail_scan_usage
  rename column scan_count to messages_processed;
alter table public.gmail_scan_usage
  alter column messages_processed set default 0;
alter table public.gmail_scan_usage
  add constraint gmail_scan_usage_messages_processed_check
  check (messages_processed >= 0);

-- Non-consuming pre-flight check: is this user under today's email cap?
create or replace function public.check_gmail_message_quota()
returns table (
  allowed boolean,
  messages_remaining integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := (now() at time zone 'UTC')::date;
  used integer;
  max_per_day constant integer := 2000;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  select q.messages_processed into used
  from public.gmail_scan_usage q
  where q.user_id = current_user_id
    and q.usage_date = current_usage_date;
  used := coalesce(used, 0);

  return query
  select
    used < max_per_day,
    greatest(max_per_day - used, 0),
    ((current_usage_date + 1)::timestamp at time zone 'UTC');
end;
$$;

-- Record emails actually processed. Only called with real fetched-message
-- counts after work happened; a cancelled scan records nothing.
create or replace function public.record_gmail_messages_processed(p_count integer)
returns table (
  messages_used integer,
  messages_remaining integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := (now() at time zone 'UTC')::date;
  new_total integer;
  max_per_day constant integer := 2000;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_count is not null and p_count > 0 then
    insert into public.gmail_scan_usage as q (
      user_id,
      usage_date,
      messages_processed
    )
    values (current_user_id, current_usage_date, p_count)
    on conflict (user_id) do update
    set
      usage_date = excluded.usage_date,
      messages_processed = case
        when q.usage_date = excluded.usage_date then q.messages_processed + excluded.messages_processed
        else excluded.messages_processed
      end,
      updated_at = now()
    returning q.messages_processed into new_total;
  else
    select q.messages_processed into new_total
    from public.gmail_scan_usage q
    where q.user_id = current_user_id
      and q.usage_date = current_usage_date;
    new_total := coalesce(new_total, 0);
  end if;

  return query
  select
    new_total,
    greatest(max_per_day - new_total, 0),
    ((current_usage_date + 1)::timestamp at time zone 'UTC');
end;
$$;

-- Compatibility shim for the pre-rework app version during rolling deploys:
-- a scan under the old code costs one processed email against the new cap.
create or replace function public.consume_gmail_scan_quota()
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
  chk record;
begin
  select c.allowed, c.messages_remaining, c.resets_at
  into chk
  from public.check_gmail_message_quota() c;

  if chk.allowed then
    perform public.record_gmail_messages_processed(1);
  end if;

  return query
  select chk.allowed, chk.messages_remaining, chk.resets_at;
end;
$$;

revoke all on function public.check_gmail_message_quota() from public, anon, authenticated;
grant execute on function public.check_gmail_message_quota() to authenticated;
revoke all on function public.record_gmail_messages_processed(integer) from public, anon, authenticated;
grant execute on function public.record_gmail_messages_processed(integer) to authenticated;
revoke all on function public.consume_gmail_scan_quota() from public, anon, authenticated;
grant execute on function public.consume_gmail_scan_quota() to authenticated;

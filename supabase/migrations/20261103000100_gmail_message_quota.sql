-- Quota by emails actually processed per UTC day, not scan count.
-- Owner instruction 3 Nov 2026 (WhatsApp): cancelled scans that never touched
-- emails must not consume allowance. Existing rows keep their usage_date; the
-- old scan count becomes a small message count, so today's users are not
-- over-counted.
--
-- Model: atomic check-and-reserve before work, settle after work. A scan
-- reserves its worst-case message budget up front (race-safe under concurrent
-- requests), then settles with the actual processed count minus the reserve
-- (negative = refund). Cancelled/failed-before-work scans refund fully.

alter table public.gmail_scan_usage
  drop constraint if exists gmail_scan_usage_scan_count_check;
alter table public.gmail_scan_usage
  rename column scan_count to messages_processed;
alter table public.gmail_scan_usage
  alter column messages_processed set default 0;
alter table public.gmail_scan_usage
  add constraint gmail_scan_usage_messages_processed_check
  check (messages_processed >= 0);

-- Atomic check-and-reserve: one statement, so concurrent scans cannot both
-- pass the check and exceed the cap.
create or replace function public.reserve_gmail_message_quota(p_reserve integer)
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
  new_total integer;
  max_per_day constant integer := 12000;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;
  if p_reserve is null or p_reserve < 0 then
    raise exception using
      errcode = '22023',
      message = 'reserve must be >= 0';
  end if;

  insert into public.gmail_scan_usage as q (
    user_id,
    usage_date,
    messages_processed
  )
  values (current_user_id, current_usage_date, p_reserve)
  on conflict (user_id) do update
  set
    usage_date = excluded.usage_date,
    messages_processed = case
      when q.usage_date = excluded.usage_date then q.messages_processed + excluded.messages_processed
      else excluded.messages_processed
    end,
    updated_at = now()
  where
    q.usage_date < excluded.usage_date
    or (
      q.usage_date = excluded.usage_date
      and q.messages_processed + excluded.messages_processed <= max_per_day
    )
  returning q.messages_processed into new_total;

  if found then
    return query
    select
      true,
      greatest(max_per_day - new_total, 0),
      ((current_usage_date + 1)::timestamp at time zone 'UTC');
    return;
  end if;

  return query
  select
    false,
    greatest(
      max_per_day - coalesce((
        select q2.messages_processed
        from public.gmail_scan_usage q2
        where q2.user_id = current_user_id
          and q2.usage_date = current_usage_date
      ), 0),
      0
    ),
    ((current_usage_date + 1)::timestamp at time zone 'UTC');
end;
$$;

-- Settle actual usage. Positive counts record processed emails; negative
-- counts refund unused reservations. Floors at zero.
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
  max_per_day constant integer := 12000;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_count is not null and p_count <> 0 then
    insert into public.gmail_scan_usage as q (
      user_id,
      usage_date,
      messages_processed
    )
    values (current_user_id, current_usage_date, greatest(p_count, 0))
    on conflict (user_id) do update
    set
      usage_date = excluded.usage_date,
      messages_processed = case
        when q.usage_date = excluded.usage_date then greatest(q.messages_processed + p_count, 0)
        else greatest(excluded.messages_processed, 0)
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
-- a scan under the old code reserves one processed email against the new cap.
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
begin
  return query
  select r.allowed, r.messages_remaining, r.resets_at
  from public.reserve_gmail_message_quota(1) r;
end;
$$;

revoke all on function public.reserve_gmail_message_quota(integer) from public, anon, authenticated;
grant execute on function public.reserve_gmail_message_quota(integer) to authenticated;
revoke all on function public.record_gmail_messages_processed(integer) from public, anon, authenticated;
grant execute on function public.record_gmail_messages_processed(integer) to authenticated;
revoke all on function public.consume_gmail_scan_quota() from public, anon, authenticated;
grant execute on function public.consume_gmail_scan_quota() to authenticated;

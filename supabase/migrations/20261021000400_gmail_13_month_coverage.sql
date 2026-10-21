create table if not exists public.gmail_scan_coverage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_version text not null default 'gmail-discovery-v2-13m'
    check (consent_version = 'gmail-discovery-v2-13m'),
  history_range text not null
    check (history_range in ('30d', '45d', '13m')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  scan_status text not null check (scan_status in ('complete', 'partial')),
  pages_fetched integer not null check (pages_fetched between 0 and 500),
  messages_matched integer not null check (messages_matched >= 0),
  unique_messages_selected integer not null
    check (unique_messages_selected between 0 and 200),
  messages_attempted integer not null
    check (messages_attempted between 0 and 200),
  messages_fetched integer not null check (messages_fetched >= 0),
  message_fetch_failures integer not null
    check (message_fetch_failures between 0 and 200),
  pagination_complete boolean not null,
  truncated boolean not null,
  attachments_scanned boolean not null default false
    check (attachments_scanned = false),
  lane_coverage jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lane_coverage) = 'array'),
  created_at timestamptz not null default now(),
  constraint gmail_scan_coverage_valid_window
    check (window_end > window_start),
  constraint gmail_scan_coverage_counts_fit
    check (
      messages_fetched <= messages_attempted
      and message_fetch_failures <= messages_attempted
      and unique_messages_selected <= messages_matched
    )
);

create index if not exists gmail_scan_coverage_user_created_idx
  on public.gmail_scan_coverage (user_id, created_at desc);

alter table public.gmail_scan_coverage enable row level security;
revoke all on table public.gmail_scan_coverage from public, anon, authenticated;
grant select on table public.gmail_scan_coverage to authenticated;

drop policy if exists "Users can read their own Gmail scan coverage"
  on public.gmail_scan_coverage;
create policy "Users can read their own Gmail scan coverage"
  on public.gmail_scan_coverage for select
  using (user_id = (select auth.uid()));

create or replace function public.grant_own_gmail_consent(consent_version text)
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
  if consent_version is distinct from 'gmail-discovery-v2-13m' then
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

create or replace function public.withdraw_own_gmail_consent(consent_version text)
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
  if consent_version is distinct from 'gmail-discovery-v2-13m' then
    raise exception using errcode = '22023', message = 'Unsupported consent version';
  end if;

  delete from public.gmail_consents
  where user_id = current_user_id
    and version = 'gmail-discovery-v2-13m';

  insert into public.gmail_consent_events (user_id, version, event_type)
  values (current_user_id, consent_version, 'withdrawn');
end;
$$;

create or replace function public.record_own_gmail_scan_coverage(
  p_history_range text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_pages_fetched integer,
  p_messages_matched integer,
  p_unique_messages_selected integer,
  p_messages_attempted integer,
  p_messages_fetched integer,
  p_message_fetch_failures integer,
  p_pagination_complete boolean,
  p_truncated boolean,
  p_lane_coverage jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  lane jsonb;
  lane_key text;
  lane_label text;
  lane_status text;
  lane_pages integer;
  lane_matches integer;
  lane_unique integer;
  lane_error_status integer;
  seen_lane_keys text[] := array[]::text[];
  safe_lanes jsonb := '[]'::jsonb;
  lane_pages_total integer := 0;
  lane_matches_total integer := 0;
  coverage_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not exists (
    select 1
    from public.gmail_consents
    where user_id = current_user_id
      and version = 'gmail-discovery-v2-13m'
  ) then
    raise exception using errcode = '42501', message = 'Current Gmail consent required';
  end if;
  if p_history_range is null
    or p_window_start is null
    or p_window_end is null
    or p_window_end <= p_window_start
    or p_pages_fetched is null
    or p_messages_matched is null
    or p_unique_messages_selected is null
    or p_messages_attempted is null
    or p_messages_fetched is null
    or p_message_fetch_failures is null
    or p_history_range not in ('30d', '45d', '13m')
    or p_pages_fetched not between 0 and 500
    or p_messages_matched < 0
    or p_unique_messages_selected not between 0 and 200
    or p_messages_attempted not between 0 and 200
    or p_messages_fetched < 0
    or p_message_fetch_failures not between 0 and 200
    or p_messages_fetched > p_messages_attempted
    or p_message_fetch_failures > p_messages_attempted
    or p_unique_messages_selected > p_messages_matched
    or p_pagination_complete is null
    or p_truncated is null
  then
    raise exception using errcode = '22023', message = 'Invalid Gmail scan coverage';
  end if;
  if p_lane_coverage is null
    or jsonb_typeof(p_lane_coverage) is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Invalid Gmail coverage lanes';
  end if;
  if jsonb_array_length(p_lane_coverage) <> 5 then
    raise exception using errcode = '22023', message = 'Invalid Gmail coverage lane count';
  end if;

  for lane in select value from jsonb_array_elements(p_lane_coverage)
  loop
    lane_key := lane ->> 'key';
    lane_status := lane ->> 'status';
    lane_pages := (lane ->> 'pagesFetched')::integer;
    lane_matches := (lane ->> 'messagesMatched')::integer;
    lane_unique := (lane ->> 'uniqueMessagesSelected')::integer;
    lane_error_status := nullif(lane ->> 'errorStatus', '')::integer;

    lane_label := case lane_key
      when 'store_receipts' then 'Store Receipts & Renewals'
      when 'direct_billing' then 'Direct Merchant Invoices'
      when 'known_merchant_payments' then 'Known Merchant Payments'
      when 'merchant_lifecycle' then 'Memberships, Trials & Activations'
      when 'bank_mandates' then 'Bank E-Mandates & Alerts'
      else null
    end;

    if lane_label is null
      or lane_status not in ('complete', 'truncated', 'failed', 'not_started')
      or lane_pages is null
      or lane_pages not between 0 and 100
      or lane_matches is null
      or lane_matches < 0
      or lane_unique is null
      or lane_unique not between 0 and 200
      or lane_key = any(seen_lane_keys)
      or (lane_error_status is not null and lane_error_status not between 400 and 599)
    then
      raise exception using errcode = '22023', message = 'Invalid Gmail coverage lane';
    end if;

    seen_lane_keys := array_append(seen_lane_keys, lane_key);
    lane_pages_total := lane_pages_total + lane_pages;
    lane_matches_total := lane_matches_total + lane_matches;
    safe_lanes := safe_lanes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', lane_key,
      'label', lane_label,
      'status', lane_status,
      'pagesFetched', lane_pages,
      'messagesMatched', lane_matches,
      'uniqueMessagesSelected', lane_unique,
      'errorStatus', lane_error_status
    )));
  end loop;

  if lane_pages_total <> p_pages_fetched
    or lane_matches_total <> p_messages_matched
  then
    raise exception using errcode = '22023', message = 'Gmail coverage totals do not match lanes';
  end if;

  insert into public.gmail_scan_coverage (
    id,
    user_id,
    history_range,
    window_start,
    window_end,
    scan_status,
    pages_fetched,
    messages_matched,
    unique_messages_selected,
    messages_attempted,
    messages_fetched,
    message_fetch_failures,
    pagination_complete,
    truncated,
    lane_coverage
  )
  values (
    coverage_id,
    current_user_id,
    p_history_range,
    p_window_start,
    p_window_end,
    case
      when p_pagination_complete and not p_truncated and p_message_fetch_failures = 0
        then 'complete'
      else 'partial'
    end,
    p_pages_fetched,
    p_messages_matched,
    p_unique_messages_selected,
    p_messages_attempted,
    p_messages_fetched,
    p_message_fetch_failures,
    p_pagination_complete,
    p_truncated,
    safe_lanes
  );

  return coverage_id;
end;
$$;

revoke all on function public.grant_own_gmail_consent(text) from public, anon;
revoke all on function public.withdraw_own_gmail_consent(text) from public, anon;
revoke all on function public.record_own_gmail_scan_coverage(
  text, timestamptz, timestamptz, integer, integer, integer, integer,
  integer, integer, boolean, boolean, jsonb
) from public, anon;
grant execute on function public.grant_own_gmail_consent(text) to authenticated;
grant execute on function public.withdraw_own_gmail_consent(text) to authenticated;
grant execute on function public.record_own_gmail_scan_coverage(
  text, timestamptz, timestamptz, integer, integer, integer, integer,
  integer, integer, boolean, boolean, jsonb
) to authenticated;

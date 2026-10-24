-- Idempotent coverage recording for resumable scans: one row per (scan_id, run_no). A replayed
-- cursor or retried request returns the existing row instead of inserting a duplicate.
-- Rollback: drop function public.record_own_gmail_scan_coverage_once; drop the two columns.

alter table public.gmail_scan_coverage
  add column if not exists scan_id uuid,
  add column if not exists run_no integer;

create unique index if not exists gmail_scan_coverage_scan_run_uidx
  on public.gmail_scan_coverage (user_id, scan_id, run_no)
  where scan_id is not null;

create or replace function public.record_own_gmail_scan_coverage_once(
  p_scan_id uuid,
  p_run_no integer,
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
  existing uuid;
  new_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_scan_id is null or p_run_no is null or p_run_no not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Invalid scan identity';
  end if;

  select id into existing from public.gmail_scan_coverage
  where user_id = current_user_id and scan_id = p_scan_id and run_no = p_run_no;
  if existing is not null then
    return existing;
  end if;

  new_id := public.record_own_gmail_scan_coverage(
    p_history_range, p_window_start, p_window_end, p_pages_fetched, p_messages_matched,
    p_unique_messages_selected, p_messages_attempted, p_messages_fetched,
    p_message_fetch_failures, p_pagination_complete, p_truncated, p_lane_coverage
  );
  begin
    update public.gmail_scan_coverage set scan_id = p_scan_id, run_no = p_run_no where id = new_id;
  exception when unique_violation then
    -- A concurrent replay won the race: drop ours and return theirs.
    delete from public.gmail_scan_coverage where id = new_id;
    select id into new_id from public.gmail_scan_coverage
    where user_id = current_user_id and scan_id = p_scan_id and run_no = p_run_no;
  end;
  return new_id;
end;
$$;

revoke all on function public.record_own_gmail_scan_coverage_once(
  uuid, integer, text, timestamptz, timestamptz, integer, integer, integer, integer, integer,
  integer, boolean, boolean, jsonb
) from public, anon;
grant execute on function public.record_own_gmail_scan_coverage_once(
  uuid, integer, text, timestamptz, timestamptz, integer, integer, integer, integer, integer,
  integer, boolean, boolean, jsonb
) to authenticated;

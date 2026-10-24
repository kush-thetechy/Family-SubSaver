-- Batched Gmail scan: consent version v3 (the disclosure changes from "200 messages" to resumable
-- batches) and coverage bounds raised to match. Everything else about the functions is unchanged:
-- the existing definitions are rewritten in place so no other rule is retyped by hand.
-- Rollback: re-run the v2 definitions from 20261021000400 and restore the 200 checks. Existing
-- v2 consent rows are kept and simply no longer authorize scans until the user consents to v3.

do $$
declare
  c record;
  def text;
  fn text;
begin
  -- Table checks that pin the version and the 200 bounds.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.gmail_scan_coverage'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%gmail-discovery-v2-13m%'
        or pg_get_constraintdef(oid) like '%<= 200%'
        or pg_get_constraintdef(oid) like '%200)%'
        or pg_get_constraintdef(oid) like '%500)%')
  loop
    execute format('alter table public.gmail_scan_coverage drop constraint %I', c.conname);
  end loop;

  alter table public.gmail_scan_coverage
    alter column consent_version set default 'gmail-discovery-v3-batched';
  alter table public.gmail_scan_coverage
    add constraint gmail_scan_coverage_consent_version
      check (consent_version in ('gmail-discovery-v2-13m', 'gmail-discovery-v3-batched'));
  alter table public.gmail_scan_coverage
    add constraint gmail_scan_coverage_pages_range check (pages_fetched between 0 and 5000);
  alter table public.gmail_scan_coverage
    add constraint gmail_scan_coverage_selected_range check (unique_messages_selected between 0 and 20000);
  alter table public.gmail_scan_coverage
    add constraint gmail_scan_coverage_attempted_range check (messages_attempted between 0 and 20000);
  alter table public.gmail_scan_coverage
    add constraint gmail_scan_coverage_failures_range check (message_fetch_failures between 0 and 20000);

  -- Rewrite the three functions from their current definitions.
  for fn in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('grant_own_gmail_consent', 'withdraw_own_gmail_consent', 'record_own_gmail_scan_coverage')
  loop
    def := pg_get_functiondef(fn::regprocedure);
    def := replace(def, 'gmail-discovery-v2-13m', 'gmail-discovery-v3-batched');
    def := replace(def, 'not between 0 and 200', 'not between 0 and 20000');
    def := replace(def, 'p_pages_fetched not between 0 and 500', 'p_pages_fetched not between 0 and 5000');
    execute def;
  end loop;
end;
$$;

-- Usage milestones for the planned one-time fee. DRAFT: not applied anywhere.
-- Records only WHEN a user first reached a qualifying use. It never charges anyone.
-- "Qualifying use" is provisional: a Gmail scan or OCR import that actually showed the
-- user live subscriptions. The exact trigger is still the owner's decision.

create table public.usage_milestones (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('gmail_scan_viewed', 'ocr_import_viewed')),
  first_at timestamptz not null default now(),
  live_subscriptions_seen integer not null check (live_subscriptions_seen > 0),
  primary key (user_id, kind)
);

alter table public.usage_milestones enable row level security;

create policy "Users read their own milestones"
  on public.usage_milestones for select
  using (user_id = (select auth.uid()));

revoke all on public.usage_milestones from anon, authenticated;
grant select on public.usage_milestones to authenticated;

-- Idempotent: only the first qualifying event per kind is kept.
create function public.record_usage_milestone(milestone_kind text, live_seen integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if live_seen is null or live_seen < 1 then
    return;
  end if;
  insert into public.usage_milestones (user_id, kind, live_subscriptions_seen)
  values ((select auth.uid()), milestone_kind, live_seen)
  on conflict (user_id, kind) do nothing;
end;
$$;

revoke all on function public.record_usage_milestone(text, integer) from public, anon;
grant execute on function public.record_usage_milestone(text, integer) to authenticated;

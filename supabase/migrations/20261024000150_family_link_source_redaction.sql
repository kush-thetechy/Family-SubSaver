-- Source-level redaction for totals-only rows (consent: amount only).
-- For other members' totals-only rows the function returns no payer, no payer name,
-- no plan, no renewal date and a random per-call row id, so rows cannot be linked to a person.
-- A caller always sees their own rows in full.
-- Rollback: re-apply the previous definition from 20261024000100 (no data changes here).
create or replace function public.household_shared_subscriptions(h uuid)
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
  select
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then gen_random_uuid() else s.id end,
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then null else s.payer_id end,
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then null else m.name end,
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then 'Private subscription' else s.service_name end,
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then null else s.plan_name end,
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then 'other' else s.category end,
    s.billing_cycle,
    s.amount_paise,
    case when s.visibility = 'totals_only' and s.payer_id <> auth.uid()
         then null else s.renewal_date end,
    s.is_active, s.visibility
  from public.subscriptions s
  join public.household_members m
    on m.user_id = s.payer_id and m.household_id = h
   and m.status = 'active' and m.share_consented_at is not null
  where public.is_household_member(h)
    and s.visibility <> 'hidden'
$$;

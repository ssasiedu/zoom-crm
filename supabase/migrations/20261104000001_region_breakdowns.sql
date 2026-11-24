-- =====================================================================
-- Region breakdowns asked for after the first months of live use
--
--  1. Outbound calls per region, split into ticket calls and debtor calls
--     (the two things that together make up "outbound calls").
--  2. Inbound calls as a headline figure on the dashboard.
--  3. Payment status per region, with debtor collections counted as
--     "Receivables" so the money officers recover shows up in the
--     payment picture instead of sitting in a separate report.
--  4. Debtor money received per region.
--
-- Everything is SECURITY INVOKER and reads through filtered_tickets /
-- filtered_debtor_calls, so each person still sees only their own slice.
-- Money received is counted on the day of the call that collected it,
-- which is the same basis as a ticket's DATE OPENED.
-- =====================================================================

-- ---------------------------------------------------------------------
-- One place that decides whether a type of contact is a call, and which
-- way it faced. The seeded values are 'IN-BOUND CALL' and 'OUTBOUND
-- CALL', but these are lookup rows an admin can rename, so match loosely
-- rather than on the exact spelling.
-- ---------------------------------------------------------------------
create or replace function public.call_direction(p_contact_type text)
returns text
language sql immutable parallel safe as $$
  select case
           when p_contact_type is null then null
           when pg_catalog.upper(p_contact_type) not like '%CALL%' then null
           when pg_catalog.upper(p_contact_type) like '%OUT%' then 'outbound'
           else 'inbound'
         end
$$;

comment on function public.call_direction(text) is
  'inbound | outbound | null for a type-of-contact value. Tolerant of renamed lookup values.';

-- ---------------------------------------------------------------------
-- Dashboard headline numbers. Unchanged except for two new keys:
-- ticket_inbound_calls (the new card) and debtor_customers_called.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_combined(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with t as (
    select count(*) filter (where public.call_direction(f.contact_type) = 'outbound') as ticket_outbound,
           count(*) filter (where public.call_direction(f.contact_type) = 'inbound') as ticket_inbound,
           count(*) filter (where public.call_direction(f.contact_type) is not null) as ticket_calls,
           coalesce(sum(f.payment_amount), 0) as ticket_payments,
           count(*) filter (where f.payment_amount > 0) as ticket_payment_count
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
  ),
  d as (
    select count(*) as debtor_calls,
           count(distinct c.debtor_id) as debtor_customers_called,
           coalesce(sum(c.amount_collected), 0) as debtor_collected,
           count(*) filter (where c.amount_collected > 0) as debtor_payments_count,
           count(distinct c.debtor_id) filter (where c.amount_collected > 0) as debtors_paid
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
      /* a channel filter is about tickets; debtor calls are all outbound */
     where p_contact_type is null or public.call_direction(p_contact_type) = 'outbound'
  )
  select jsonb_build_object(
    'ticket_outbound_calls', t.ticket_outbound,
    'ticket_inbound_calls', t.ticket_inbound,
    'ticket_calls', t.ticket_calls,
    'debtor_calls', d.debtor_calls,
    'debtor_customers_called', d.debtor_customers_called,
    'inbound_calls_total', t.ticket_inbound,
    'outbound_calls_total', t.ticket_outbound + d.debtor_calls,
    'calls_total', t.ticket_calls + d.debtor_calls,
    'ticket_payments', t.ticket_payments,
    'ticket_payment_count', t.ticket_payment_count,
    'debtor_collected', d.debtor_collected,
    'payments_total', t.ticket_payments + d.debtor_collected,
    'debtor_payments_count', d.debtor_payments_count,
    'debtors_paid', d.debtors_paid
  )
  from t, d
$$;

-- ---------------------------------------------------------------------
-- Report: outbound calls per region, and what they were made of.
--
-- Every region is listed so a region with no activity still reads as a
-- zero rather than going missing; the client hides empty rows on the
-- printed report.
-- ---------------------------------------------------------------------
create or replace function public.report_outbound_by_region(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with t as (
    select f.region, count(*) as ticket_outbound
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
     where public.call_direction(f.contact_type) = 'outbound'
     group by 1
  ),
  c as (
    select x.region, count(*) as debtor_calls, count(distinct x.debtor_id) as debtor_customers
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) x
      /* debtor calls are all outbound, and carry no issue type */
     where (p_contact_type is null or public.call_direction(p_contact_type) = 'outbound')
       and p_issue_type is null
     group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.region), '[]'::jsonb)
  from (
    select r.name as region,
           r.sort_order,
           coalesce(t.ticket_outbound, 0) as ticket_outbound,
           coalesce(c.debtor_calls, 0) as debtor_calls,
           coalesce(c.debtor_customers, 0) as debtor_customers,
           coalesce(t.ticket_outbound, 0) + coalesce(c.debtor_calls, 0) as total_outbound
      from public.regions r
      left join t on t.region = r.name
      left join c on c.region = r.name
     where (p_region is null or r.name = p_region)
       and (r.is_active or coalesce(t.ticket_outbound, 0) + coalesce(c.debtor_calls, 0) > 0)
  ) s
$$;

-- ---------------------------------------------------------------------
-- Report: payment status per region.
--
-- Ticket payments are grouped by their own payment status. Debtor
-- collections have no status field of their own — they are money owed
-- and then recovered — so they are reported under 'Receivables', and
-- kept in separate columns as well so the ticket and debtor halves of
-- that row can still be told apart.
-- ---------------------------------------------------------------------
create or replace function public.report_payment_status_by_region(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with t as (
    select f.region,
           coalesce(f.payment_status, 'Unspecified') as payment_status,
           count(*) as ticket_count,
           coalesce(sum(f.payment_amount), 0) as ticket_total
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
     where f.payment_amount is not null and f.payment_amount > 0
     group by 1, 2
  ),
  c as (
    select x.region,
           'Receivables'::text as payment_status,
           count(*) filter (where x.amount_collected > 0) as debtor_count,
           coalesce(sum(x.amount_collected), 0) as debtor_total
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) x
     where (p_contact_type is null or public.call_direction(p_contact_type) = 'outbound')
       and p_issue_type is null
       and x.amount_collected > 0
     group by 1
  ),
  merged as (
    select coalesce(t.region, c.region) as region,
           coalesce(t.payment_status, c.payment_status) as payment_status,
           coalesce(t.ticket_count, 0) as ticket_count,
           coalesce(t.ticket_total, 0) as ticket_total,
           coalesce(c.debtor_count, 0) as debtor_count,
           coalesce(c.debtor_total, 0) as debtor_total
      from t
      full join c
        on c.region is not distinct from t.region
       and c.payment_status = t.payment_status
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'region', coalesce(m.region, 'Unspecified'),
           'payment_status', m.payment_status,
           'ticket_count', m.ticket_count,
           'ticket_total', m.ticket_total,
           'debtor_count', m.debtor_count,
           'debtor_total', m.debtor_total,
           'count', m.ticket_count + m.debtor_count,
           'total', m.ticket_total + m.debtor_total)
         order by coalesce(m.region, 'Unspecified'), m.payment_status), '[]'::jsonb)
  from merged m
$$;

-- ---------------------------------------------------------------------
-- Report: debtor money received per region.
--
-- Counted from the call log, so a customer who part-pays twice in the
-- month shows two payments and one customer.
-- ---------------------------------------------------------------------
create or replace function public.report_debtor_money_by_region(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with c as (
    select x.region,
           count(*) as calls,
           count(distinct x.debtor_id) as customers_called,
           count(*) filter (where x.amount_collected > 0) as payments,
           count(distinct x.debtor_id) filter (where x.amount_collected > 0) as customers_paid,
           coalesce(sum(x.amount_collected), 0) as collected
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) x
     group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.region), '[]'::jsonb)
  from (
    select r.name as region,
           r.sort_order,
           coalesce(c.calls, 0) as calls,
           coalesce(c.customers_called, 0) as customers_called,
           coalesce(c.payments, 0) as payments,
           coalesce(c.customers_paid, 0) as customers_paid,
           coalesce(c.collected, 0) as collected,
           coalesce(round(100.0 * coalesce(c.customers_paid, 0)
                          / nullif(c.customers_called, 0), 1), 0) as pay_rate
      from public.regions r
      left join c on c.region = r.name
     where (p_region is null or r.name = p_region)
       and (r.is_active or coalesce(c.calls, 0) > 0)
  ) s
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke execute on function public.report_outbound_by_region(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_payment_status_by_region(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_debtor_money_by_region(timestamptz, timestamptz, text, uuid) from public, anon;

grant execute on function public.call_direction(text) to authenticated, service_role;
grant execute on function public.report_outbound_by_region(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_payment_status_by_region(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_debtor_money_by_region(timestamptz, timestamptz, text, uuid) to authenticated, service_role;

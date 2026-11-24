-- =====================================================================
-- Three things the team asked for after the November review:
--
--   1. Total call activity on the dashboard — every ticket plus every
--      debtor call — broken into in-bound, outbound, debtor calls and
--      phone change requests.
--   2. Issue type per officer, so a supervisor can see what kind of work
--      each person actually handles rather than only how much.
--   3. A due-date measure on forwarded work, so District Operation
--      Officers can be judged on finishing on time and not just on
--      finishing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Which issue types count as a phone change request.
--
-- This is a lookup value the team can rename, so rather than hard-code a
-- spelling, match the obvious shapes — and let an administrator pin the
-- exact names in app_settings when the guess is wrong:
--
--   update public.app_settings
--      set value = jsonb_build_object('phone_change_issue_types',
--                                     jsonb_build_array('PHONE NUMBER CHANGE'))
--    where key = 'dashboard';
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, is_secret)
values ('dashboard', '{}'::jsonb, false)
on conflict (key) do nothing;

create or replace function public.phone_change_issue_types()
returns text[]
language sql stable security definer set search_path = public as $$
  with configured as (
    select array(
      select jsonb_array_elements_text(value -> 'phone_change_issue_types')
      from public.app_settings
      where key = 'dashboard'
        and jsonb_typeof(value -> 'phone_change_issue_types') = 'array'
    ) as names
  ),
  guessed as (
    select coalesce(array_agg(i.name), '{}'::text[]) as names
    from public.issue_types i
    where upper(i.name) like '%PHONE%'
      and (upper(i.name) like '%CHANGE%' or upper(i.name) like '%NUMBER%' or upper(i.name) like '%UPDATE%')
  )
  select case
           when coalesce(array_length((select names from configured), 1), 0) > 0
             then (select names from configured)
           else (select names from guessed)
         end
$$;

comment on function public.phone_change_issue_types() is
  'Issue types treated as a phone change request on the dashboard. Set app_settings[dashboard].phone_change_issue_types to pin them.';

-- ---------------------------------------------------------------------
-- Dashboard headline numbers, with call activity added.
--
-- A word on what adds up and what does not. Total call activity is every
-- ticket plus every debtor call. The four figures under it do NOT
-- partition that total: in-bound and outbound describe how the client
-- made contact, while a phone change request is an *issue type*, so one
-- of those tickets is already counted under in-bound or outbound. The
-- client shows that on the card rather than leaving someone to add the
-- four up and wonder why they miss.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_combined(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with phone as (select public.phone_change_issue_types() as types),
  t as (
    select count(*) as ticket_total,
           count(*) filter (where public.call_direction(f.contact_type) = 'outbound') as ticket_outbound,
           count(*) filter (where public.call_direction(f.contact_type) = 'inbound') as ticket_inbound,
           count(*) filter (where public.call_direction(f.contact_type) is not null) as ticket_calls,
           count(*) filter (where f.issue_type = any(p.types)) as ticket_phone_change,
           coalesce(sum(f.payment_amount), 0) as ticket_payments,
           count(*) filter (where f.payment_amount > 0) as ticket_payment_count
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
      /* exactly one row, so this only carries the array into the filter */
      cross join phone p
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
    'ticket_total', t.ticket_total,
    'ticket_outbound_calls', t.ticket_outbound,
    'ticket_inbound_calls', t.ticket_inbound,
    'ticket_calls', t.ticket_calls,
    'ticket_phone_change', t.ticket_phone_change,
    'debtor_calls', d.debtor_calls,
    'debtor_customers_called', d.debtor_customers_called,
    'inbound_calls_total', t.ticket_inbound,
    'outbound_calls_total', t.ticket_outbound + d.debtor_calls,
    'calls_total', t.ticket_calls + d.debtor_calls,
    /* every ticket, however it arrived, plus every debtor call */
    'call_activity_total', t.ticket_total + d.debtor_calls,
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
-- Report: issue type per officer
--
-- The same shape as report_issue_type_by_region, with the officer in
-- place of the region, so the client pivots it the same way.
-- ---------------------------------------------------------------------
create or replace function public.report_issue_type_by_officer(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
                    'officer_id', s.officer_id,
                    'officer_name', s.officer_name,
                    'region', s.region,
                    'issue_type', s.issue_type,
                    'count', s.cnt)
                  order by s.officer_name, s.issue_type), '[]'::jsonb)
  from (
    select f.assigned_officer_id as officer_id,
           coalesce(o.full_name, 'Unassigned') as officer_name,
           o.region,
           f.issue_type,
           count(*) as cnt
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
      left join public.officers o on o.id = f.assigned_officer_id
     group by f.assigned_officer_id, o.full_name, o.region, f.issue_type
  ) s
$$;

-- ---------------------------------------------------------------------
-- Forwarded work, with a due-date measure per officer.
--
-- avg_field_hours says how long they took; sla_met says how often that
-- was soon enough. A field officer finishing everything a week late
-- should not read as a good month.
-- ---------------------------------------------------------------------
create or replace function public.report_forwarded_tickets(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select t.*
      from public.filtered_tickets(p_from, p_to, p_region, null, p_issue_type, p_contact_type) t
     where t.district_officer_id is not null
       and (p_officer is null or t.district_officer_id = p_officer or t.assigned_officer_id = p_officer)
  ),
  counts as (
    select coalesce(f.region, 'Unspecified') as region,
           coalesce(f.district, 'Unspecified') as district,
           f.district_officer_id as officer_id,
           count(*) as total,
           count(*) filter (where f.status = 'Open') as "open",
           count(*) filter (where f.status = 'In-Progress') as in_progress,
           count(*) filter (where f.status = 'Resolved') as resolved,
           count(*) filter (where f.status = 'Closed') as closed,
           count(*) filter (where f.status in ('Open', 'In-Progress') and f.due_date < current_date) as overdue,
           count(*) filter (
             where f.status in ('Resolved', 'Closed')
               and (coalesce(f.completion_date, f.resolved_at) at time zone 'Africa/Accra')::date <= f.due_date
           ) as sla_met,
           round(avg(extract(epoch from (coalesce(f.completion_date, f.resolved_at) - f.forwarded_at))
                     / 3600.0) filter (where f.status in ('Resolved', 'Closed')), 1) as avg_field_hours
      from f
     group by 1, 2, 3
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'total', coalesce(sum(total), 0),
        'open', coalesce(sum("open"), 0),
        'in_progress', coalesce(sum(in_progress), 0),
        'resolved', coalesce(sum(resolved), 0),
        'closed', coalesce(sum(closed), 0),
        'overdue', coalesce(sum(overdue), 0),
        'sla_met', coalesce(sum(sla_met), 0),
        'districts', count(distinct district),
        'officers', count(distinct officer_id))
      from counts),
    'by_officer', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.region, s.district, s.officer_name), '[]'::jsonb)
      from (
        select c.region, c.district,
               coalesce(o.full_name, 'Unknown') as officer_name,
               coalesce(m.full_name, '') as manager_name,
               c.total, c."open", c.in_progress, c.resolved, c.closed, c.overdue,
               c.sla_met,
               c.avg_field_hours,
               coalesce(round(100.0 * (c.resolved + c.closed) / nullif(c.total, 0), 1), 0) as resolution_rate,
               coalesce(round(100.0 * c.sla_met / nullif(c.resolved + c.closed, 0), 1), 0) as sla_rate
          from counts c
          left join public.officers o on o.id = c.officer_id
          left join public.officers m on m.id = o.manager_officer_id
      ) s),
    'by_district', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.region, s.district), '[]'::jsonb)
      from (
        select c.region, c.district,
               sum(c.total) as total, sum(c."open") as "open", sum(c.in_progress) as in_progress,
               sum(c.resolved) as resolved, sum(c.closed) as closed, sum(c.overdue) as overdue,
               sum(c.sla_met) as sla_met,
               count(distinct c.officer_id) as officers,
               coalesce(round(100.0 * sum(c.resolved + c.closed) / nullif(sum(c.total), 0), 1), 0) as resolution_rate
          from counts c
         group by c.region, c.district
      ) s),
    'by_region', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.region), '[]'::jsonb)
      from (
        select c.region,
               sum(c.total) as total, sum(c."open") as "open", sum(c.in_progress) as in_progress,
               sum(c.resolved) as resolved, sum(c.closed) as closed, sum(c.overdue) as overdue,
               sum(c.sla_met) as sla_met,
               count(distinct c.district) as districts,
               count(distinct c.officer_id) as officers,
               coalesce(round(100.0 * sum(c.resolved + c.closed) / nullif(sum(c.total), 0), 1), 0) as resolution_rate
          from counts c
         group by c.region
      ) s)
  )
$$;

revoke execute on function public.report_issue_type_by_officer(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
grant execute on function public.phone_change_issue_types() to authenticated, service_role;
grant execute on function public.report_issue_type_by_officer(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;

-- =====================================================================
-- Combined view of the work: tickets and debtor calls together
--
-- Officers do two jobs — they resolve tickets and they call debtors —
-- and until now the dashboard only counted the first. These functions
-- bring debtor calls into the call figures and debtor collections into
-- the money figures, and add a per-staff report covering both.
--
-- Everything is SECURITY INVOKER and reads through filtered_tickets and
-- the debtors policies, so each person still sees only their own slice.
-- A debtor call counts on the day it was made (called_at), which is the
-- same basis as a ticket's DATE OPENED.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Debtor calls in a window, with the same filter shape as the ticket
-- reports. p_region filters the debtor's region, p_officer the officer
-- credited with the call.
-- ---------------------------------------------------------------------
create or replace function public.filtered_debtor_calls(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_region text default null,
  p_officer uuid default null
)
returns table (
  id uuid,
  debtor_id uuid,
  period_id uuid,
  officer_id uuid,
  called_at timestamptz,
  feedback text,
  amount_collected numeric,
  region text,
  provider text,
  customer_type text,
  community text
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.debtor_id, l.period_id, l.officer_id, l.called_at, l.feedback,
         coalesce(l.amount_collected, 0), d.region, d.provider, d.customer_type, d.community
    from public.debtor_call_log l
    join public.debtors d on d.id = l.debtor_id
   where (p_from is null or l.called_at >= p_from)
     and (p_to is null or l.called_at < p_to)
     and (p_region is null or d.region = p_region)
     and (p_officer is null or l.officer_id = p_officer)
$$;

-- ---------------------------------------------------------------------
-- Headline numbers for the dashboard, split so the cards can show where
-- each total came from.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_combined(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with t as (
    select count(*) filter (where f.contact_type = 'OUTBOUND CALL') as ticket_outbound,
           count(*) filter (where f.contact_type like '%CALL%') as ticket_calls,
           coalesce(sum(f.payment_amount), 0) as ticket_payments
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
  ),
  d as (
    select count(*) as debtor_calls,
           coalesce(sum(c.amount_collected), 0) as debtor_collected,
           count(*) filter (where c.amount_collected > 0) as debtor_payments_count
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
      /* a channel filter is about tickets; debtor calls are all outbound */
     where p_contact_type is null or p_contact_type in ('OUTBOUND CALL')
  )
  select jsonb_build_object(
    'ticket_outbound_calls', t.ticket_outbound,
    'ticket_calls', t.ticket_calls,
    'debtor_calls', d.debtor_calls,
    'outbound_calls_total', t.ticket_outbound + d.debtor_calls,
    'calls_total', t.ticket_calls + d.debtor_calls,
    'ticket_payments', t.ticket_payments,
    'debtor_collected', d.debtor_collected,
    'payments_total', t.ticket_payments + d.debtor_collected,
    'debtor_payments_count', d.debtor_payments_count
  )
  from t, d
$$;

-- ---------------------------------------------------------------------
-- Type-of-contact breakdown with debtor calls folded into OUTBOUND CALL.
-- Same shape as dashboard_breakdown so the chart code is unchanged.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_contact_mix(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with rows as (
    select f.contact_type as label, count(*) as cnt, 0::bigint as from_debtors
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
     where f.contact_type is not null
     group by 1
    union all
    select 'OUTBOUND CALL', count(*), count(*)
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
     where (p_contact_type is null or p_contact_type = 'OUTBOUND CALL')
       and p_issue_type is null
    having count(*) > 0
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('label', label, 'count', cnt, 'from_debtors', from_debtors)
              order by cnt desc, label), '[]'::jsonb)
  from (select label, sum(cnt) as cnt, sum(from_debtors) as from_debtors
          from rows group by label) s
$$;

-- ---------------------------------------------------------------------
-- Staff workload: every officer's ticket work and debtor work side by
-- side. Officers with no activity in the window are left out.
-- ---------------------------------------------------------------------
create or replace function public.report_staff_workload(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with tickets as (
    select f.assigned_officer_id as officer_id,
           count(*) as tickets_assigned,
           count(*) filter (where f.status in ('Resolved', 'Closed')) as tickets_resolved,
           count(*) filter (where f.status in ('Open', 'In-Progress')) as tickets_active,
           count(*) filter (where f.status in ('Open', 'In-Progress') and f.due_date < current_date) as tickets_overdue,
           count(*) filter (where f.contact_type like '%CALL%') as ticket_calls,
           coalesce(sum(f.payment_amount), 0) as ticket_payments,
           round(avg(f.resolution_minutes) filter (where f.resolution_minutes is not null)) as avg_resolution_minutes
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
     where f.assigned_officer_id is not null
     group by 1
  ),
  calls as (
    select c.officer_id,
           count(*) as debtor_calls,
           count(distinct c.debtor_id) as debtors_contacted,
           count(*) filter (where c.amount_collected > 0) as debtor_payments,
           coalesce(sum(c.amount_collected), 0) as debtor_collected
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
     where c.officer_id is not null
     group by 1
  )
  select coalesce(jsonb_agg(row order by row ->> 'officer_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'officer_id', o.id,
             'officer_name', o.full_name,
             'region', o.region,
             'is_active', o.is_active,
             'tickets_assigned', coalesce(t.tickets_assigned, 0),
             'tickets_resolved', coalesce(t.tickets_resolved, 0),
             'tickets_active', coalesce(t.tickets_active, 0),
             'tickets_overdue', coalesce(t.tickets_overdue, 0),
             'ticket_calls', coalesce(t.ticket_calls, 0),
             'debtor_calls', coalesce(c.debtor_calls, 0),
             'debtors_contacted', coalesce(c.debtors_contacted, 0),
             'total_calls', coalesce(t.ticket_calls, 0) + coalesce(c.debtor_calls, 0),
             'ticket_payments', coalesce(t.ticket_payments, 0),
             'debtor_collected', coalesce(c.debtor_collected, 0),
             'debtor_payments', coalesce(c.debtor_payments, 0),
             'total_collected', coalesce(t.ticket_payments, 0) + coalesce(c.debtor_collected, 0),
             'avg_resolution_minutes', t.avg_resolution_minutes
           ) as row
      from public.officers o
      left join tickets t on t.officer_id = o.id
      left join calls c on c.officer_id = o.id
     where (p_officer is null or o.id = p_officer)
       and (t.officer_id is not null or c.officer_id is not null)
  ) s
$$;

-- ---------------------------------------------------------------------
-- The same combined totals over time, for the trend chart.
-- ---------------------------------------------------------------------
create or replace function public.report_staff_workload_trend(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_bucket text default 'month'
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with b as (select case when coalesce(p_bucket, 'month') in ('day', 'week', 'month')
                         then coalesce(p_bucket, 'month') else 'month' end as unit),
  rows as (
    select date_trunc((select unit from b), f.date_opened at time zone 'Africa/Accra') as bucket,
           count(*) filter (where f.contact_type like '%CALL%') as ticket_calls,
           0::bigint as debtor_calls,
           coalesce(sum(f.payment_amount), 0) as ticket_payments,
           0::numeric as debtor_collected
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, null, null) f
     group by 1
    union all
    select date_trunc((select unit from b), c.called_at at time zone 'Africa/Accra'),
           0, count(*), 0, coalesce(sum(c.amount_collected), 0)
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'bucket', to_char(bucket, 'YYYY-MM-DD'),
           'ticket_calls', ticket_calls,
           'debtor_calls', debtor_calls,
           'total_calls', ticket_calls + debtor_calls,
           'ticket_payments', ticket_payments,
           'debtor_collected', debtor_collected,
           'total_collected', ticket_payments + debtor_collected) order by bucket), '[]'::jsonb)
  from (select bucket, sum(ticket_calls) as ticket_calls, sum(debtor_calls) as debtor_calls,
               sum(ticket_payments) as ticket_payments, sum(debtor_collected) as debtor_collected
          from rows group by bucket) s
$$;

revoke execute on function public.filtered_debtor_calls(timestamptz, timestamptz, text, uuid) from public, anon;
revoke execute on function public.dashboard_combined(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.dashboard_contact_mix(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_staff_workload(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_staff_workload_trend(timestamptz, timestamptz, text, uuid, text) from public, anon;

grant execute on function public.filtered_debtor_calls(timestamptz, timestamptz, text, uuid) to authenticated, service_role;
grant execute on function public.dashboard_combined(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.dashboard_contact_mix(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_staff_workload(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_staff_workload_trend(timestamptz, timestamptz, text, uuid, text) to authenticated, service_role;

-- =====================================================================
-- 0005: Reporting and helper RPC functions
-- All report functions are SECURITY INVOKER, so each caller only
-- aggregates the tickets their RLS policies allow them to see.
-- Date filters apply to date_opened; p_to is EXCLUSIVE.
-- =====================================================================

create or replace function public.filtered_tickets(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_region text default null,
  p_officer uuid default null,
  p_issue_type text default null,
  p_contact_type text default null
)
returns setof public.tickets
language sql stable security invoker set search_path = public as $$
  select t.*
  from public.tickets t
  where (p_from is null or t.date_opened >= p_from)
    and (p_to is null or t.date_opened < p_to)
    and (p_region is null or t.region = p_region)
    and (p_officer is null or t.assigned_officer_id = p_officer)
    and (p_issue_type is null or t.issue_type = p_issue_type)
    and (p_contact_type is null or t.contact_type = p_contact_type)
$$;

-- ---------------------------------------------------------------------
-- Dashboard KPIs
-- ---------------------------------------------------------------------
create or replace function public.dashboard_kpis(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'open', count(*) filter (where f.status = 'Open'),
    'in_progress', count(*) filter (where f.status = 'In-Progress'),
    'resolved', count(*) filter (where f.status = 'Resolved'),
    'closed', count(*) filter (where f.status = 'Closed'),
    'overdue', count(*) filter (where f.status in ('Open', 'In-Progress') and f.due_date < current_date),
    'unassigned', count(*) filter (where f.assigned_officer_id is null and f.status in ('Open', 'In-Progress')),
    'resolution_rate', coalesce(round(100.0 * count(*) filter (where f.status in ('Resolved', 'Closed'))
                         / nullif(count(*), 0), 1), 0),
    'avg_resolution_hours', round((extract(epoch from avg(coalesce(f.completion_date, f.resolved_at) - f.date_opened)
                         filter (where f.status in ('Resolved', 'Closed'))) / 3600.0)::numeric, 1),
    'total_payments', coalesce(sum(f.payment_amount), 0),
    'sla_compliance', coalesce(round(100.0 * count(*) filter (
                         where f.status in ('Resolved', 'Closed')
                           and (coalesce(f.completion_date, f.resolved_at) at time zone 'Africa/Accra')::date <= f.due_date)
                         / nullif(count(*) filter (where f.status in ('Resolved', 'Closed')), 0), 1), 0)
  )
  from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
$$;

-- ---------------------------------------------------------------------
-- Trend over time (bucket = day | week | month)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_trend(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null,
  p_bucket text default 'day'
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket', s.bucket, 'opened', s.opened, 'resolved', s.resolved)
                            order by s.bucket), '[]'::jsonb)
  from (
    select (date_trunc(case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end,
                       f.date_opened at time zone 'Africa/Accra'))::date as bucket,
           count(*) as opened,
           count(*) filter (where f.status in ('Resolved', 'Closed')) as resolved
    from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
    group by 1
  ) s
$$;

-- ---------------------------------------------------------------------
-- Generic breakdown (status | contact_type | community | region | issue_type | priority)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_breakdown(
  p_dimension text,
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null,
  p_limit integer default 50
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'count', s.cnt) order by s.cnt desc, s.label),
                  '[]'::jsonb)
  from (
    select case p_dimension
             when 'status' then f.status::text
             when 'contact_type' then f.contact_type
             when 'community' then f.community
             when 'region' then f.region
             when 'issue_type' then f.issue_type
             when 'priority' then f.priority::text
           end as label,
           count(*) as cnt
    from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
    group by 1
    order by 2 desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) s
  where s.label is not null
$$;

-- ---------------------------------------------------------------------
-- Report 1: ticket status per region (all regions listed)
-- ---------------------------------------------------------------------
create or replace function public.report_status_by_region(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select * from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type)
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.region), '[]'::jsonb)
  from (
    select r.name as region,
           r.sort_order,
           count(f.id) as total,
           count(f.id) filter (where f.status = 'Open') as "open",
           count(f.id) filter (where f.status = 'In-Progress') as in_progress,
           count(f.id) filter (where f.status = 'Resolved') as resolved,
           count(f.id) filter (where f.status = 'Closed') as closed,
           count(f.id) filter (where f.status in ('Open', 'In-Progress') and f.due_date < current_date) as overdue,
           coalesce(round(100.0 * count(f.id) filter (where f.status in ('Resolved', 'Closed'))
                          / nullif(count(f.id), 0), 1), 0) as resolution_rate,
           coalesce(sum(f.payment_amount), 0) as payments
    from public.regions r
    left join f on f.region = r.name
    where (p_region is null or r.name = p_region)
    group by r.name, r.sort_order, r.is_active
    having r.is_active or count(f.id) > 0
  ) s
$$;

-- ---------------------------------------------------------------------
-- Report 2: issue type per region (long format; pivoted in the client)
-- ---------------------------------------------------------------------
create or replace function public.report_issue_type_by_region(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('region', s.region, 'issue_type', s.issue_type, 'count', s.cnt)
                            order by s.region, s.issue_type), '[]'::jsonb)
  from (
    select f.region, f.issue_type, count(*) as cnt
    from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
    group by f.region, f.issue_type
  ) s
$$;

-- ---------------------------------------------------------------------
-- Report 3: payments per region (long format)
-- ---------------------------------------------------------------------
create or replace function public.report_payments_by_region(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'region', s.region, 'payment_type', s.payment_type, 'payment_source', s.payment_source,
           'payment_status', s.payment_status, 'total', s.total, 'count', s.cnt)
         order by s.region), '[]'::jsonb)
  from (
    select f.region,
           coalesce(f.payment_type, 'Unspecified') as payment_type,
           coalesce(f.payment_source, 'Unspecified') as payment_source,
           coalesce(f.payment_status, 'Unspecified') as payment_status,
           sum(f.payment_amount) as total,
           count(*) as cnt
    from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
    where f.payment_amount is not null
    group by 1, 2, 3, 4
  ) s
$$;

-- ---------------------------------------------------------------------
-- Report 4: officer performance per contact type
-- ---------------------------------------------------------------------
create or replace function public.report_officer_performance(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select * from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type)
    where assigned_officer_id is not null
  ),
  ct as (
    select x.assigned_officer_id, jsonb_object_agg(x.contact_type, x.cnt) as by_contact_type
    from (select assigned_officer_id, contact_type, count(*) as cnt from f group by 1, 2) x
    group by x.assigned_officer_id
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.resolved desc, s.officer_name), '[]'::jsonb)
  from (
    select o.id as officer_id,
           o.full_name as officer_name,
           o.region,
           o.is_active,
           coalesce(ct.by_contact_type, '{}'::jsonb) as by_contact_type,
           count(f.id) as total_assigned,
           count(f.id) filter (where f.status in ('Resolved', 'Closed')) as resolved,
           count(f.id) filter (where f.status in ('Open', 'In-Progress')) as active,
           coalesce(round(100.0 * count(f.id) filter (where f.status in ('Resolved', 'Closed'))
                          / nullif(count(f.id), 0), 1), 0) as resolution_rate,
           round((extract(epoch from avg(coalesce(f.completion_date, f.resolved_at) - f.date_opened)
                  filter (where f.status in ('Resolved', 'Closed'))) / 3600.0)::numeric, 1) as avg_resolution_hours,
           count(f.id) filter (where f.status in ('Open', 'In-Progress') and f.due_date < current_date) as overdue,
           coalesce(sum(f.payment_amount), 0) as payments
    from public.officers o
    left join f on f.assigned_officer_id = o.id
    left join ct on ct.assigned_officer_id = o.id
    where (p_officer is null or o.id = p_officer)
    group by o.id, o.full_name, o.region, o.is_active, ct.by_contact_type
    having o.is_active or count(f.id) > 0
  ) s
$$;

-- ---------------------------------------------------------------------
-- Report 5: SLA / overdue ageing
-- ---------------------------------------------------------------------
create or replace function public.report_sla_aging(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with a as (
    select f.region, f.assigned_officer_id, (current_date - f.due_date) as days_overdue
    from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
    where f.status in ('Open', 'In-Progress') and f.due_date < current_date
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'd0_2', count(*) filter (where days_overdue <= 2),
        'd3_7', count(*) filter (where days_overdue between 3 and 7),
        'd8_14', count(*) filter (where days_overdue between 8 and 14),
        'd15_plus', count(*) filter (where days_overdue >= 15),
        'total', count(*))
      from a),
    'by_region', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.total desc, r.region), '[]'::jsonb)
      from (
        select a.region,
               count(*) filter (where days_overdue <= 2) as d0_2,
               count(*) filter (where days_overdue between 3 and 7) as d3_7,
               count(*) filter (where days_overdue between 8 and 14) as d8_14,
               count(*) filter (where days_overdue >= 15) as d15_plus,
               count(*) as total,
               max(days_overdue) as max_days
        from a group by a.region
      ) r),
    'by_officer', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.total desc), '[]'::jsonb)
      from (
        select coalesce(o.full_name, 'Unassigned') as officer_name,
               count(*) filter (where days_overdue <= 2) as d0_2,
               count(*) filter (where days_overdue between 3 and 7) as d3_7,
               count(*) filter (where days_overdue between 8 and 14) as d8_14,
               count(*) filter (where days_overdue >= 15) as d15_plus,
               count(*) as total
        from a left join public.officers o on o.id = a.assigned_officer_id
        group by 1
      ) r)
  )
$$;

-- ---------------------------------------------------------------------
-- DM officer landing page summary
-- ---------------------------------------------------------------------
create or replace function public.officer_summary(p_officer uuid default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'assigned', count(*),
    'active', count(*) filter (where t.status in ('Open', 'In-Progress')),
    'open', count(*) filter (where t.status = 'Open'),
    'in_progress', count(*) filter (where t.status = 'In-Progress'),
    'overdue', count(*) filter (where t.status in ('Open', 'In-Progress') and t.due_date < current_date),
    'due_today', count(*) filter (where t.status in ('Open', 'In-Progress') and t.due_date = current_date),
    'resolved', count(*) filter (where t.status in ('Resolved', 'Closed')),
    'resolved_this_month', count(*) filter (
       where t.status in ('Resolved', 'Closed')
         and coalesce(t.resolved_at, t.completion_date) >= date_trunc('month', now()))
  )
  from public.tickets t
  where t.assigned_officer_id = coalesce(p_officer, public.current_officer_id())
$$;

-- ---------------------------------------------------------------------
-- Officer workload (for the assignment picker). SECURITY DEFINER so agents
-- can balance workload without seeing other tickets.
-- ---------------------------------------------------------------------
create or replace function public.officer_workload()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(w) order by w.full_name)
    from (
      select o.id, o.full_name, o.region, o.is_active, o.profile_id,
             count(t.id) filter (where t.status = 'Open') as open_count,
             count(t.id) filter (where t.status = 'In-Progress') as in_progress_count,
             count(t.id) filter (where t.due_date < current_date) as overdue_count
      from public.officers o
      left join public.tickets t
        on t.assigned_officer_id = o.id and t.status in ('Open', 'In-Progress')
      group by o.id
    ) w
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Client lookup across all tickets (for ticket creation / duplicates)
-- ---------------------------------------------------------------------
create or replace function public.client_lookup(p_client_id text default null, p_phone text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_phone text := public.normalize_gh_phone(nullif(btrim(coalesce(p_phone, '')), ''));
begin
  if coalesce(public.auth_role() in ('admin', 'supervisor', 'agent'), false) = false then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if v_phone is not null and v_phone !~ '^0[0-9]{9}$' then
    v_phone := null;
  end if;
  if v_id is null and v_phone is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.date_opened desc)
    from (
      select t.id, t.ticket_number, t.client_name, t.client_id, t.contact_number, t.community,
             t.region, t.contact_type, t.issue_type, t.status, t.date_opened, t.due_date
      from public.tickets t
      where (v_id is not null and lower(t.client_id) = lower(v_id))
         or (v_phone is not null and t.contact_number = v_phone)
      order by t.date_opened desc
      limit 15
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Community suggestions (distinct previously used values)
-- ---------------------------------------------------------------------
create or replace function public.community_suggestions(p_query text default '', p_region text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := replace(replace(coalesce(btrim(p_query), ''), '%', ''), '_', '');
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(c.community order by c.n desc, c.community)
    from (
      select t.community, count(*) as n
      from public.tickets t
      where (v_q = '' or t.community ilike '%' || v_q || '%')
        and (p_region is null or t.region = p_region)
      group by t.community
      order by count(*) desc
      limit 12
    ) c
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Execute grants: authenticated users only
-- ---------------------------------------------------------------------
revoke execute on function public.filtered_tickets(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.dashboard_kpis(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.dashboard_trend(timestamptz, timestamptz, text, uuid, text, text, text) from public, anon;
revoke execute on function public.dashboard_breakdown(text, timestamptz, timestamptz, text, uuid, text, text, integer) from public, anon;
revoke execute on function public.report_status_by_region(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_issue_type_by_region(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_payments_by_region(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_officer_performance(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.report_sla_aging(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.officer_summary(uuid) from public, anon;
revoke execute on function public.officer_workload() from public, anon;
revoke execute on function public.client_lookup(text, text) from public, anon;
revoke execute on function public.community_suggestions(text, text) from public, anon;

grant execute on function public.filtered_tickets(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.dashboard_kpis(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.dashboard_trend(timestamptz, timestamptz, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.dashboard_breakdown(text, timestamptz, timestamptz, text, uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.report_status_by_region(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_issue_type_by_region(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_payments_by_region(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_officer_performance(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.report_sla_aging(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.officer_summary(uuid) to authenticated, service_role;
grant execute on function public.officer_workload() to authenticated, service_role;
grant execute on function public.client_lookup(text, text) to authenticated, service_role;
grant execute on function public.community_suggestions(text, text) to authenticated, service_role;

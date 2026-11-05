-- =====================================================================
-- 0012: Turnaround time tracking
--   response_minutes   : ticket raised -> first worked on (waiting time)
--   resolution_minutes : ticket raised -> completed (turnaround time)
-- Both are stored on the ticket so reports stay fast on large tables.
-- =====================================================================

alter table public.tickets add column if not exists first_response_at timestamptz;
alter table public.tickets add column if not exists response_minutes integer;
alter table public.tickets add column if not exists resolution_minutes integer;

create index if not exists tickets_resolution_minutes_idx on public.tickets (resolution_minutes)
  where resolution_minutes is not null;

create or replace function public.minutes_between(p_from timestamptz, p_to timestamptz)
returns integer
language sql immutable as $$
  select case
    when p_from is null or p_to is null then null
    else greatest(0, (extract(epoch from (p_to - p_from)) / 60.0)::integer)
  end
$$;

-- Runs last of the BEFORE triggers (names fire in alphabetical order), so
-- completion_date/status are already final when the timings are computed.
create or replace function public.tickets_timing()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- first time anyone works on it
    if new.first_response_at is null
       and (new.status = 'In-Progress' and old.status = 'Open') then
      new.first_response_at := now();
    end if;
    if new.first_response_at is null and new.status in ('Resolved', 'Closed')
       and old.status in ('Open', 'In-Progress') then
      new.first_response_at := coalesce(new.completion_date, now());
    end if;
    -- a reopened ticket starts its clock again
    if old.status in ('Resolved', 'Closed') and new.status in ('Open', 'In-Progress') then
      new.first_response_at := null;
      new.response_minutes := null;
      new.resolution_minutes := null;
    end if;
  end if;

  new.response_minutes := public.minutes_between(new.date_opened, new.first_response_at);
  new.resolution_minutes := case
    when new.status in ('Resolved', 'Closed')
      then public.minutes_between(new.date_opened, coalesce(new.completion_date, new.resolved_at))
    else null
  end;
  return new;
end $$;

drop trigger if exists tickets_zz_timing on public.tickets;
create trigger tickets_zz_timing before insert or update on public.tickets
  for each row execute function public.tickets_timing();

-- Backfill from existing history
update public.tickets t
set first_response_at = coalesce(
      t.first_response_at,
      (select min(a.created_at) from public.ticket_activity a
       where a.ticket_id = t.id
         and (a.action = 'status_changed' or a.action = 'commented')),
      t.resolved_at,
      t.completion_date)
where t.first_response_at is null;

update public.tickets t
set response_minutes = public.minutes_between(t.date_opened, t.first_response_at),
    resolution_minutes = case
      when t.status in ('Resolved', 'Closed')
        then public.minutes_between(t.date_opened, coalesce(t.completion_date, t.resolved_at))
      else null end
where t.response_minutes is null or t.resolution_minutes is null;

-- ---------------------------------------------------------------------
-- The list view gains the timing columns (t.* changes shape, so the view
-- has to be dropped rather than replaced).
-- ---------------------------------------------------------------------
drop view if exists public.tickets_view;
create view public.tickets_view
with (security_invoker = true) as
select
  t.*,
  o.full_name as officer_name,
  o.region as officer_region,
  cp.full_name as created_by_name,
  (t.status in ('Open', 'In-Progress') and t.due_date < current_date) as is_overdue,
  (t.due_date - current_date) as days_to_due,
  case
    when t.status in ('Resolved', 'Closed')
      then (coalesce(t.completion_date, t.resolved_at) at time zone 'Africa/Accra')::date <= t.due_date
    else null
  end as sla_met
from public.tickets t
left join public.officers o on o.id = t.assigned_officer_id
left join public.profiles cp on cp.id = t.created_by;

grant select on public.tickets_view to authenticated;

-- ---------------------------------------------------------------------
-- Turnaround report
-- ---------------------------------------------------------------------
create or replace function public.report_turnaround(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select * from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type)
  ),
  done as (
    select * from f where status in ('Resolved', 'Closed') and resolution_minutes is not null
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'tickets', (select count(*) from f),
        'resolved', count(*),
        'avg_resolution_minutes', round(avg(resolution_minutes)::numeric, 0),
        'median_resolution_minutes', round(percentile_cont(0.5) within group (order by resolution_minutes)::numeric, 0),
        'p90_resolution_minutes', round(percentile_cont(0.9) within group (order by resolution_minutes)::numeric, 0),
        'fastest_minutes', min(resolution_minutes),
        'slowest_minutes', max(resolution_minutes),
        'avg_response_minutes', round(avg(response_minutes)::numeric, 0),
        'median_response_minutes', round(percentile_cont(0.5) within group (order by response_minutes)::numeric, 0),
        'total_minutes', coalesce(sum(resolution_minutes), 0),
        'within_sla', coalesce(round(100.0 * count(*) filter (
            where (coalesce(completion_date, resolved_at) at time zone 'Africa/Accra')::date <= due_date)
            / nullif(count(*), 0), 1), 0))
      from done),
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object('label', b.label, 'count', b.cnt) order by b.ord), '[]'::jsonb)
      from (
        select x.ord, x.label, count(*) as cnt
        from (
          select case
                   when resolution_minutes < 60 then 1
                   when resolution_minutes < 240 then 2
                   when resolution_minutes < 1440 then 3
                   when resolution_minutes < 4320 then 4
                   when resolution_minutes < 10080 then 5
                   else 6 end as ord,
                 case
                   when resolution_minutes < 60 then 'Under 1 hour'
                   when resolution_minutes < 240 then '1 – 4 hours'
                   when resolution_minutes < 1440 then '4 – 24 hours'
                   when resolution_minutes < 4320 then '1 – 3 days'
                   when resolution_minutes < 10080 then '3 – 7 days'
                   else 'Over 7 days' end as label
          from done
        ) x
        group by x.ord, x.label
      ) b),
    'by_officer', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.avg_resolution_minutes nulls last), '[]'::jsonb)
      from (
        select coalesce(o.full_name, 'Unassigned') as officer_name,
               o.region,
               count(d.id) as resolved,
               round(avg(d.resolution_minutes)::numeric, 0) as avg_resolution_minutes,
               round(percentile_cont(0.5) within group (order by d.resolution_minutes)::numeric, 0) as median_resolution_minutes,
               round(avg(d.response_minutes)::numeric, 0) as avg_response_minutes,
               min(d.resolution_minutes) as fastest_minutes,
               max(d.resolution_minutes) as slowest_minutes,
               coalesce(sum(d.resolution_minutes), 0) as total_minutes,
               coalesce(round(100.0 * count(*) filter (
                 where (coalesce(d.completion_date, d.resolved_at) at time zone 'Africa/Accra')::date <= d.due_date)
                 / nullif(count(*), 0), 1), 0) as within_sla
        from done d
        left join public.officers o on o.id = d.assigned_officer_id
        group by o.full_name, o.region
      ) s),
    'by_issue_type', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.avg_resolution_minutes desc nulls last), '[]'::jsonb)
      from (
        select d.issue_type as label,
               count(*) as resolved,
               round(avg(d.resolution_minutes)::numeric, 0) as avg_resolution_minutes,
               round(percentile_cont(0.5) within group (order by d.resolution_minutes)::numeric, 0) as median_resolution_minutes,
               round(avg(d.response_minutes)::numeric, 0) as avg_response_minutes,
               coalesce(round(100.0 * count(*) filter (
                 where (coalesce(d.completion_date, d.resolved_at) at time zone 'Africa/Accra')::date <= d.due_date)
                 / nullif(count(*), 0), 1), 0) as within_sla
        from done d group by d.issue_type
      ) s),
    'by_region', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.avg_resolution_minutes desc nulls last), '[]'::jsonb)
      from (
        select d.region as label,
               count(*) as resolved,
               round(avg(d.resolution_minutes)::numeric, 0) as avg_resolution_minutes,
               round(avg(d.response_minutes)::numeric, 0) as avg_response_minutes
        from done d group by d.region
      ) s),
    'by_contact_type', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.avg_resolution_minutes desc nulls last), '[]'::jsonb)
      from (
        select d.contact_type as label,
               count(*) as resolved,
               round(avg(d.resolution_minutes)::numeric, 0) as avg_resolution_minutes,
               round(avg(d.response_minutes)::numeric, 0) as avg_response_minutes
        from done d group by d.contact_type
      ) s),
    'trend', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.bucket), '[]'::jsonb)
      from (
        select (date_trunc('month', d.date_opened at time zone 'Africa/Accra'))::date as bucket,
               count(*) as resolved,
               round(avg(d.resolution_minutes)::numeric, 0) as avg_resolution_minutes,
               round(avg(d.response_minutes)::numeric, 0) as avg_response_minutes
        from done d group by 1
      ) s)
  )
$$;

revoke execute on function public.report_turnaround(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
grant execute on function public.report_turnaround(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
revoke execute on function public.minutes_between(timestamptz, timestamptz) from public, anon;
grant execute on function public.minutes_between(timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- The audit trail must ignore the new timing columns, otherwise every
-- status change would also log "updated 3 fields". Same function as in
-- migration 0004 with an extended ignore list.
-- ---------------------------------------------------------------------
create or replace function public.tickets_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_diff_old jsonb;
  v_diff_new jsonb;
  v_old_officer text;
  v_new_officer text;
  v_ignore text[] := array['updated_at', 'updated_by', 'assigned_at', 'assigned_by', 'resolved_at',
                           'closed_at', 'reopened_at', 'reopen_count', 'assignment_note',
                           'first_response_at', 'response_minutes', 'resolution_minutes'];
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'created', null, jsonb_build_object(
      'ticket_number', new.ticket_number, 'status', new.status, 'issue_type', new.issue_type,
      'region', new.region, 'client_name', new.client_name, 'priority', new.priority));

    if new.assigned_officer_id is not null then
      select full_name into v_new_officer from public.officers where id = new.assigned_officer_id;
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
      values (new.id, v_uid, 'assigned', null,
              jsonb_build_object('officer_id', new.assigned_officer_id, 'officer', v_new_officer),
              new.assignment_note);
      perform public.notify_officer(new.assigned_officer_id, new, 'assignment',
        format('Ticket %s (%s – %s) has been assigned to you', new.ticket_number, new.client_name, new.issue_type));
    end if;
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- Assignment change
  if new.assigned_officer_id is distinct from old.assigned_officer_id then
    select full_name into v_old_officer from public.officers where id = old.assigned_officer_id;
    select full_name into v_new_officer from public.officers where id = new.assigned_officer_id;
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
    values (new.id, v_uid,
            case when old.assigned_officer_id is null then 'assigned'
                 when new.assigned_officer_id is null then 'unassigned'
                 else 'reassigned' end,
            case when old.assigned_officer_id is null then null
                 else jsonb_build_object('officer_id', old.assigned_officer_id, 'officer', v_old_officer) end,
            case when new.assigned_officer_id is null then null
                 else jsonb_build_object('officer_id', new.assigned_officer_id, 'officer', v_new_officer) end,
            new.assignment_note);

    perform public.notify_officer(new.assigned_officer_id, new,
      case when old.assigned_officer_id is null then 'assignment' else 'reassignment' end,
      format('Ticket %s (%s – %s) has been assigned to you', new.ticket_number, new.client_name, new.issue_type));
    if old.assigned_officer_id is not null then
      perform public.notify_officer(old.assigned_officer_id, new, 'unassignment',
        format('Ticket %s has been reassigned to %s', new.ticket_number, coalesce(v_new_officer, 'nobody')));
    end if;
  end if;

  -- Status change
  if new.status is distinct from old.status then
    if old.status in ('Resolved', 'Closed') and new.status in ('Open', 'In-Progress') then
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
      values (new.id, v_uid, 'reopened',
              jsonb_build_object('status', old.status),
              jsonb_build_object('status', new.status), new.reopen_reason);
      perform public.notify_officer(new.assigned_officer_id, new, 'reopened',
        format('Ticket %s was reopened: %s', new.ticket_number, new.reopen_reason));
    else
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
      values (new.id, v_uid, 'status_changed',
              jsonb_build_object('status', old.status),
              jsonb_build_object('status', new.status));
      if new.status = 'Resolved' and old.created_by is not null and old.created_by is distinct from v_uid then
        insert into public.notifications (user_id, ticket_id, type, message)
        values (old.created_by, new.id, 'resolved',
                format('Ticket %s (%s) was marked Resolved', new.ticket_number, new.client_name));
      end if;
    end if;
  end if;

  -- Any other field changes
  select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb),
         coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb)
    into v_diff_new, v_diff_old
  from jsonb_object_keys(v_new) as k
  where (v_new -> k) is distinct from (v_old -> k)
    and k <> all (v_ignore)
    and k not in ('assigned_officer_id', 'status', 'reopen_reason');

  if v_diff_new <> '{}'::jsonb then
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'updated', v_diff_old, v_diff_new);
  end if;

  return new;
end $$;

drop trigger if exists tickets_after_change on public.tickets;
create trigger tickets_after_change after insert or update on public.tickets
  for each row execute function public.tickets_after_change();



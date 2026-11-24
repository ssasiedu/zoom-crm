-- =====================================================================
-- 0013: Resolution assistant
--   Looks at how similar issues were actually resolved in the past.
--   SECURITY DEFINER so an officer can learn from the whole history,
--   but it deliberately returns no client identifiers (no name, phone
--   or customer id) — only the issue and how it was handled.
-- =====================================================================

create index if not exists tickets_description_trgm_idx
  on public.tickets using gin (description gin_trgm_ops);

create or replace function public.similar_tickets(
  p_issue_type text default null,
  p_description text default null,
  p_community text default null,
  p_region text default null,
  p_exclude uuid default null,
  p_limit integer default 8
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.score desc, x.date_opened desc)
    from (
      select t.ticket_number,
             t.issue_type,
             t.community,
             t.region,
             t.contact_type,
             t.description,
             t.remarks,
             t.responsible_party,
             t.payment_type,
             t.payment_status,
             t.resolution_minutes,
             t.date_opened,
             round((
               (case when p_issue_type is not null and t.issue_type = p_issue_type then 0.45 else 0 end)
               + (case when p_community is not null and t.community = p_community then 0.15 else 0 end)
               + (case when p_region is not null and t.region = p_region then 0.10 else 0 end)
               + (case when v_q is null then 0 else 0.30 * similarity(t.description, v_q) end)
             )::numeric, 3) as score
      from public.tickets t
      where t.status in ('Resolved', 'Closed')
        and coalesce(btrim(t.remarks), '') <> ''
        and (p_exclude is null or t.id <> p_exclude)
        and (p_issue_type is null or t.issue_type = p_issue_type
             or (v_q is not null and t.description % v_q))
      order by (
               (case when p_issue_type is not null and t.issue_type = p_issue_type then 0.45 else 0 end)
               + (case when p_community is not null and t.community = p_community then 0.15 else 0 end)
               + (case when p_region is not null and t.region = p_region then 0.10 else 0 end)
               + (case when v_q is null then 0 else 0.30 * similarity(t.description, v_q) end)
             ) desc,
             t.date_opened desc
      limit greatest(coalesce(p_limit, 8), 1)
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- What history says about this kind of issue
-- ---------------------------------------------------------------------
create or replace function public.issue_playbook(
  p_issue_type text,
  p_region text default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return (
    with h as (
      select * from public.tickets
      where issue_type = p_issue_type
        and (p_region is null or region = p_region)
    ),
    done as (select * from h where status in ('Resolved', 'Closed'))
    select jsonb_build_object(
      'issue_type', p_issue_type,
      'tickets', (select count(*) from h),
      'resolved', (select count(*) from done),
      'sla_days', (select it.sla_days from public.issue_types it where it.name = p_issue_type),
      'median_resolution_minutes',
        (select round(percentile_cont(0.5) within group (order by resolution_minutes)::numeric, 0)
         from done where resolution_minutes is not null),
      'avg_resolution_minutes',
        (select round(avg(resolution_minutes)::numeric, 0) from done where resolution_minutes is not null),
      'within_sla',
        (select coalesce(round(100.0 * count(*) filter (
           where (coalesce(completion_date, resolved_at) at time zone 'Africa/Accra')::date <= due_date)
           / nullif(count(*), 0), 1), 0) from done),
      'responsible_parties', coalesce((
        select jsonb_agg(jsonb_build_object('label', s.label, 'count', s.cnt) order by s.cnt desc)
        from (select responsible_party as label, count(*) as cnt from done
              where coalesce(btrim(responsible_party), '') <> ''
              group by 1 order by 2 desc limit 5) s), '[]'::jsonb),
      'payment_types', coalesce((
        select jsonb_agg(jsonb_build_object('label', s.label, 'count', s.cnt) order by s.cnt desc)
        from (select payment_type as label, count(*) as cnt from done
              where payment_type is not null group by 1 order by 2 desc limit 5) s), '[]'::jsonb),
      'recent_resolutions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'ticket_number', s.ticket_number, 'remarks', s.remarks,
                 'resolution_minutes', s.resolution_minutes, 'date_opened', s.date_opened)
               order by s.date_opened desc)
        from (select ticket_number, remarks, resolution_minutes, date_opened from done
              where coalesce(btrim(remarks), '') <> ''
              order by date_opened desc limit 5) s), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.similar_tickets(text, text, text, text, uuid, integer) from public, anon;
grant execute on function public.similar_tickets(text, text, text, text, uuid, integer) to authenticated, service_role;
revoke execute on function public.issue_playbook(text, text) from public, anon;
grant execute on function public.issue_playbook(text, text) to authenticated, service_role;

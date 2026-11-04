-- =====================================================================
-- District Operation Officers: the field layer
--
-- Until now a ticket ended with the officer who took the call. The work
-- itself happens in the districts, so the team needs a layer below:
--
--   1. The officer who takes the call is given the ticket automatically,
--      so nothing sits unowned while it is being written down.
--   2. They forward it to the District Operation Officer who covers that
--      district. Forwarding does not take the ticket off them — they
--      stay accountable for it, the district officer does the field work.
--   3. Forwarding alerts both the district officer and their regional
--      manager, by notification and by SMS.
--   4. A regional manager sees the tickets forwarded inside their region;
--      a district officer sees the ones forwarded to them, and nothing
--      else.
--   5. Forwarded work is reported by region, district, officer and status.
--
-- Deliberately NOT changed: forwarding leaves the status alone. A ticket
-- becomes In-Progress when the district officer actually starts on it,
-- which is also what lets the capturing agent forward at all — agents
-- are not allowed to move a ticket's status.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Districts. A lookup like the others: referenced by name with ON UPDATE
-- CASCADE, so renaming one in Administration follows through to every
-- ticket and officer, and a district in use can be deactivated but not
-- deleted.
-- ---------------------------------------------------------------------
create table if not exists public.districts (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  region text not null references public.regions (name) on update cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists districts_region_idx on public.districts (region, sort_order);
create unique index if not exists districts_name_ci_idx on public.districts (upper(btrim(name)));

drop trigger if exists set_updated_at on public.districts;
create trigger set_updated_at before update on public.districts
  for each row execute function public.set_updated_at();

alter table public.districts enable row level security;
drop policy if exists districts_read on public.districts;
drop policy if exists districts_admin_write on public.districts;
create policy districts_read on public.districts
  for select to authenticated using (true);
create policy districts_admin_write on public.districts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Officers gain a kind, a district and a manager.
--
-- One table still holds everyone who can be given work, so assignment,
-- notifications and the performance reports keep working unchanged.
-- ---------------------------------------------------------------------
alter table public.officers
  add column if not exists kind text not null default 'dm_officer',
  add column if not exists district text,
  add column if not exists manager_officer_id uuid;

do $$ begin
  alter table public.officers
    add constraint officers_kind_check
    check (kind in ('dm_officer', 'district_officer', 'regional_manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.officers
    add constraint officers_district_fkey
    foreign key (district) references public.districts (name)
    on update cascade on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.officers
    add constraint officers_manager_fkey
    foreign key (manager_officer_id) references public.officers (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.officers
    add constraint officers_no_self_manage check (manager_officer_id is distinct from id);
exception when duplicate_object then null; end $$;

create index if not exists officers_kind_idx on public.officers (kind, is_active);
create index if not exists officers_district_idx on public.officers (district) where district is not null;
create index if not exists officers_manager_idx on public.officers (manager_officer_id);

comment on column public.officers.kind is
  'dm_officer (desk), district_officer (field) or regional_manager (owns a region)';
comment on column public.officers.manager_officer_id is
  'the regional manager this officer reports to';

-- A district officer belongs to a district; a regional manager does not.
create or replace function public.officers_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_region text;
begin
  new.full_name := btrim(new.full_name);
  new.phone := public.normalize_gh_phone(new.phone);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.district := nullif(btrim(coalesce(new.district, '')), '');

  if new.kind = 'district_officer' and new.district is null then
    raise exception 'A District Operation Officer must be given a district';
  end if;
  if new.kind <> 'district_officer' then
    new.district := null;
  end if;

  -- The district decides the region, so the two can never disagree.
  if new.district is not null then
    select d.region into v_region from public.districts d where d.name = new.district;
    if v_region is null then
      raise exception 'Unknown district %', new.district;
    end if;
    new.region := v_region;
  end if;

  if new.manager_officer_id is not null then
    if not exists (
      select 1 from public.officers o
       where o.id = new.manager_officer_id and o.kind = 'regional_manager'
    ) then
      raise exception 'A manager must be a regional manager';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists officers_before_write on public.officers;
create trigger officers_before_write before insert or update on public.officers
  for each row execute function public.officers_before_write();

-- ---------------------------------------------------------------------
-- Tickets gain the field layer.
-- ---------------------------------------------------------------------
alter table public.tickets
  add column if not exists district text,
  add column if not exists district_officer_id uuid,
  add column if not exists forwarded_at timestamptz,
  add column if not exists forwarded_by uuid,
  add column if not exists forward_note text,
  add column if not exists field_notes text;

do $$ begin
  alter table public.tickets
    add constraint tickets_district_fkey
    foreign key (district) references public.districts (name)
    on update cascade on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tickets
    add constraint tickets_district_officer_fkey
    foreign key (district_officer_id) references public.officers (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tickets
    add constraint tickets_forwarded_by_fkey
    foreign key (forwarded_by) references public.profiles (id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists tickets_district_officer_idx
  on public.tickets (district_officer_id, status) where district_officer_id is not null;
create index if not exists tickets_district_idx
  on public.tickets (district, status) where district is not null;
create index if not exists tickets_forwarded_idx
  on public.tickets (forwarded_at desc) where forwarded_at is not null;

comment on column public.tickets.district_officer_id is
  'the District Operation Officer doing the field work; the ticket stays assigned to whoever took the call';

-- The list view needs the field officer's name, and their manager's.
drop view if exists public.tickets_view;
create view public.tickets_view
with (security_invoker = true) as
select
  t.*,
  o.full_name as officer_name,
  o.region as officer_region,
  cp.full_name as created_by_name,
  fo.full_name as district_officer_name,
  fm.full_name as district_officer_manager,
  (t.status in ('Open', 'In-Progress') and t.due_date < current_date) as is_overdue,
  (t.due_date - current_date) as days_to_due,
  case
    when t.status in ('Resolved', 'Closed')
      then (coalesce(t.completion_date, t.resolved_at) at time zone 'Africa/Accra')::date <= t.due_date
    else null
  end as sla_met
from public.tickets t
left join public.officers o on o.id = t.assigned_officer_id
left join public.profiles cp on cp.id = t.created_by
left join public.officers fo on fo.id = t.district_officer_id
left join public.officers fm on fm.id = fo.manager_officer_id;

grant select on public.tickets_view to authenticated;

-- ---------------------------------------------------------------------
-- Who am I, in field terms
-- ---------------------------------------------------------------------
create or replace function public.current_profile_region()
returns text
language sql stable security definer set search_path = public as $$
  select p.region from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.current_officer_kind()
returns text
language sql stable security definer set search_path = public as $$
  select o.kind from public.officers o where o.profile_id = auth.uid() limit 1
$$;

-- ---------------------------------------------------------------------
-- The officer who takes the call keeps the ticket.
--
-- A separate BEFORE INSERT trigger rather than a change to
-- tickets_before_insert, so the ticket-number, SLA and validation logic
-- stays in one piece. Trigger names fire in alphabetical order, so
-- tickets_before_insert has already run by the time this does.
-- ---------------------------------------------------------------------
create or replace function public.tickets_bz_autoassign()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_officer uuid;
begin
  if auth.uid() is null or new.assigned_officer_id is not null then
    return new;
  end if;

  v_officer := public.current_officer_id();
  if v_officer is null then
    return new;
  end if;
  /* Field officers and regional managers do not capture calls. */
  if coalesce(public.current_officer_kind(), 'dm_officer') <> 'dm_officer' then
    return new;
  end if;

  new.assigned_officer_id := v_officer;
  new.assigned_at := now();
  new.assigned_by := auth.uid();
  return new;
end $$;

drop trigger if exists tickets_bz_autoassign on public.tickets;
create trigger tickets_bz_autoassign before insert on public.tickets
  for each row execute function public.tickets_bz_autoassign();

-- ---------------------------------------------------------------------
-- What the field layer may change.
--
-- tickets_before_update already restricts agents and DM officers; the
-- two new roles fall through it, so they are handled here. Runs after
-- that function (bz sorts after before_update).
-- ---------------------------------------------------------------------
create or replace function public.tickets_bz_field_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := public.auth_role();
  v_core_changed boolean;
begin
  if auth.uid() is null or v_role not in ('district_officer', 'regional_manager') then
    return new;
  end if;

  v_core_changed := (new.client_name, new.client_id, new.contact_number, new.contact_type,
                     new.community, new.description, new.issue_type, new.region, new.district,
                     new.due_date, new.date_opened, new.payment_amount)
                    is distinct from
                    (old.client_name, old.client_id, old.contact_number, old.contact_type,
                     old.community, old.description, old.issue_type, old.region, old.district,
                     old.due_date, old.date_opened, old.payment_amount);

  if v_core_changed then
    raise exception 'The field layer cannot change the details of a ticket, only how the work is going'
      using errcode = '42501';
  end if;

  if new.assigned_officer_id is distinct from old.assigned_officer_id then
    raise exception 'Only a supervisor can reassign a ticket' using errcode = '42501';
  end if;

  if v_role = 'district_officer' then
    if new.district_officer_id is distinct from old.district_officer_id then
      raise exception 'A District Operation Officer cannot forward a ticket on' using errcode = '42501';
    end if;
    if new.status = 'Closed' and old.status <> 'Closed' then
      raise exception 'Only supervisors or administrators can close tickets' using errcode = '42501';
    end if;
    if new.status in ('Open', 'In-Progress') and new.due_date < current_date
       and coalesce(btrim(new.reason_for_open_status), '') = '' then
      raise exception 'Reason for open status is required because this ticket is overdue';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists tickets_bz_field_guard on public.tickets;
create trigger tickets_bz_field_guard before update on public.tickets
  for each row execute function public.tickets_bz_field_guard();

-- ---------------------------------------------------------------------
-- Forwarding a ticket to the district
-- ---------------------------------------------------------------------
create or replace function public.forward_ticket(
  p_ticket uuid,
  p_district_officer uuid,
  p_note text default null
)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := public.auth_role();
  v_me uuid := public.current_officer_id();
  v_ticket public.tickets;
  v_officer public.officers;
begin
  if v_role is null then
    raise exception 'Your account is inactive or has no profile' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket;
  if v_ticket.id is null then
    raise exception 'Ticket not found';
  end if;

  select * into v_officer from public.officers where id = p_district_officer;
  if v_officer.id is null or v_officer.kind <> 'district_officer' then
    raise exception 'Pick a District Operation Officer to forward to';
  end if;
  if not v_officer.is_active then
    raise exception '% is no longer active', v_officer.full_name;
  end if;

  -- Who may forward: managers, or the officer the ticket is sitting with.
  if not (
    v_role in ('admin', 'supervisor')
    or (v_me is not null and v_ticket.assigned_officer_id = v_me)
    or (v_role = 'regional_manager' and v_ticket.region = public.current_profile_region())
  ) then
    raise exception 'You can only forward tickets that are with you' using errcode = '42501';
  end if;

  if v_ticket.status in ('Resolved', 'Closed') then
    raise exception 'Ticket % is already %', v_ticket.ticket_number, v_ticket.status;
  end if;
  if v_ticket.district_officer_id = p_district_officer then
    raise exception 'Ticket % is already with %', v_ticket.ticket_number, v_officer.full_name;
  end if;

  update public.tickets t
     set district_officer_id = p_district_officer,
         district = v_officer.district,
         forwarded_at = now(),
         forwarded_by = auth.uid(),
         forward_note = nullif(btrim(coalesce(p_note, '')), '')
   where t.id = p_ticket
  returning * into v_ticket;

  return v_ticket;
end $$;

-- ---------------------------------------------------------------------
-- Telling the district officer and their regional manager
-- ---------------------------------------------------------------------
create or replace function public.queue_officer_sms(
  p_officer public.officers, p_ticket public.tickets, p_event text, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_phone text := public.normalize_gh_phone(p_officer.phone);
begin
  if v_phone is null or v_phone !~ '^(0|\+233)[0-9]{9}$' then
    return;
  end if;
  if coalesce(btrim(p_body), '') = '' then
    return;
  end if;
  insert into public.sms_messages
    (ticket_id, recipient, recipient_name, message, template_code, trigger_event, requested_by)
  values
    (p_ticket.id, v_phone, p_officer.full_name, left(p_body, 918), p_event, p_event, auth.uid());
end $$;

-- 'ticket_forwarded' is a new template event.
do $$ begin
  alter table public.sms_templates drop constraint if exists sms_templates_event_check;
  alter table public.sms_templates
    add constraint sms_templates_event_check
    check (event is null or event in (
      'ticket_created', 'ticket_assigned', 'ticket_in_progress',
      'ticket_resolved', 'ticket_closed', 'ticket_reopened', 'ticket_forwarded'));
end $$;

insert into public.sms_templates (code, name, body, event, auto_send, is_system, sort_order) values
  ('ticket_forwarded', 'Forwarded to the district',
   'Ticket {ticket_number} ({issue_type}) in {district}, {region} has been forwarded to {district_officer}. Customer {client_name} on {contact_number}. Due {due_date}. {company}',
   'ticket_forwarded', true, true, 25)
on conflict (code) do nothing;

create or replace function public.tickets_forward_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_officer public.officers;
  v_manager public.officers;
  v_tpl public.sms_templates;
  v_sms_on boolean;
  v_body text;
  v_vars jsonb;
begin
  if tg_op = 'UPDATE'
     and new.district_officer_id is not distinct from old.district_officer_id then
    return null;
  end if;
  if new.district_officer_id is null then
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, auth.uid(), 'forward_cleared',
            jsonb_build_object('district_officer_id', old.district_officer_id), null);
    return null;
  end if;

  select * into v_officer from public.officers where id = new.district_officer_id;
  if v_officer.manager_officer_id is not null then
    select * into v_manager from public.officers where id = v_officer.manager_officer_id;
  end if;

  insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
  values (new.id, auth.uid(), 'forwarded',
          case when tg_op = 'UPDATE' and old.district_officer_id is not null
               then jsonb_build_object('officer_id', old.district_officer_id) end,
          jsonb_build_object('officer_id', v_officer.id, 'officer', v_officer.full_name,
                             'district', v_officer.district, 'region', v_officer.region),
          new.forward_note);

  perform public.notify_officer(v_officer.id, new, 'forwarded',
    format('Ticket %s (%s – %s) in %s has been forwarded to you',
           new.ticket_number, new.client_name, new.issue_type,
           coalesce(v_officer.district, new.region)));

  if v_manager.id is not null then
    perform public.notify_officer(v_manager.id, new, 'forwarded',
      format('Ticket %s (%s – %s) was forwarded to %s in %s',
             new.ticket_number, new.client_name, new.issue_type,
             v_officer.full_name, coalesce(v_officer.district, new.region)));
  end if;

  -- SMS, if SMS is switched on and set to send by itself
  select coalesce((value ->> 'enabled')::boolean, false)
         and coalesce((value ->> 'auto_send')::boolean, true)
    into v_sms_on
  from public.app_settings where key = 'sms';

  if not coalesce(v_sms_on, false) then
    return null;
  end if;

  select * into v_tpl from public.sms_templates
   where event = 'ticket_forwarded' and is_active and auto_send limit 1;
  if v_tpl.id is null then
    return null;
  end if;

  v_vars := public.ticket_sms_vars(new)
            || jsonb_build_object(
                 'district', coalesce(v_officer.district, ''),
                 'district_officer', v_officer.full_name,
                 'regional_manager', coalesce(v_manager.full_name, ''),
                 'forward_note', coalesce(new.forward_note, ''));
  v_body := public.apply_placeholders(v_tpl.body, v_vars);

  perform public.queue_officer_sms(v_officer, new, 'ticket_forwarded', v_body);
  if v_manager.id is not null then
    perform public.queue_officer_sms(v_manager, new, 'ticket_forwarded', v_body);
  end if;

  return null;
end $$;

drop trigger if exists tickets_forward_after_change on public.tickets;
create trigger tickets_forward_after_change after insert or update on public.tickets
  for each row execute function public.tickets_forward_after_change();

-- ---------------------------------------------------------------------
-- Who the capturing officer can forward to
-- ---------------------------------------------------------------------
create or replace function public.district_officers(p_region text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.region, x.district, x.full_name)
    from (
      select o.id, o.full_name, o.district, o.region, o.phone, o.is_active,
             m.id as manager_id, m.full_name as manager_name, m.phone as manager_phone,
             count(t.id) filter (where t.status in ('Open', 'In-Progress')) as active_tickets
      from public.officers o
      left join public.officers m on m.id = o.manager_officer_id
      left join public.tickets t on t.district_officer_id = o.id
      where o.kind = 'district_officer'
        and o.is_active
        and (p_region is null or o.region = p_region)
      group by o.id, o.full_name, o.district, o.region, o.phone, o.is_active,
               m.id, m.full_name, m.phone
    ) x
  ), '[]'::jsonb);
end $$;

-- Region → its districts and the officers covering them, for the
-- "load officers per region" screen.
create or replace function public.region_district_officers()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.sort_order, r.region)
    from (
      select g.name as region,
             g.sort_order,
             (select coalesce(jsonb_agg(to_jsonb(m) order by m.full_name), '[]'::jsonb)
                from (select o.id, o.full_name, o.phone, o.email, o.is_active
                        from public.officers o
                       where o.kind = 'regional_manager' and o.region = g.name) m
             ) as managers,
             (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.district), '[]'::jsonb)
                from (
                  select dd.name as district,
                         dd.sort_order,
                         dd.is_active,
                         (select coalesce(jsonb_agg(to_jsonb(o2) order by o2.full_name), '[]'::jsonb)
                            from (select o.id, o.full_name, o.phone, o.email, o.is_active,
                                         mo.full_name as manager_name
                                    from public.officers o
                                    left join public.officers mo on mo.id = o.manager_officer_id
                                   where o.kind = 'district_officer' and o.district = dd.name) o2
                         ) as officers
                    from public.districts dd
                   where dd.region = g.name
                ) d
             ) as districts
        from public.regions g
    ) r
  ), '[]'::jsonb);
end $$;

-- The district officer's own landing page, same shape as officer_summary
-- so the queue screen can read either.
create or replace function public.field_summary(p_officer uuid default null)
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
  where t.district_officer_id = coalesce(p_officer, public.current_officer_id())
$$;

-- ---------------------------------------------------------------------
-- Report: forwarded work by region, district, officer and status
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
               c.avg_field_hours,
               coalesce(round(100.0 * (c.resolved + c.closed) / nullif(c.total, 0), 1), 0) as resolution_rate
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
               count(distinct c.district) as districts,
               count(distinct c.officer_id) as officers,
               coalesce(round(100.0 * sum(c.resolved + c.closed) / nullif(sum(c.total), 0), 1), 0) as resolution_rate
          from counts c
         group by c.region
      ) s)
  )
$$;

-- ---------------------------------------------------------------------
-- RLS: the field layer sees only forwarded work
-- ---------------------------------------------------------------------
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    (select public.is_manager())
    or ((select public.auth_role()) = 'agent' and created_by = (select auth.uid()))
    or (assigned_officer_id is not null and assigned_officer_id = (select public.current_officer_id()))
    /* the District Operation Officer this was forwarded to */
    or (district_officer_id is not null and district_officer_id = (select public.current_officer_id()))
    /* a regional manager sees what has been forwarded inside their region */
    or ((select public.auth_role()) = 'regional_manager'
        and district_officer_id is not null
        and region = (select public.current_profile_region()))
  );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using (
    (select public.is_manager())
    or ((select public.auth_role()) = 'agent' and created_by = (select auth.uid()))
    or ((select public.auth_role()) = 'dm_officer'
        and assigned_officer_id = (select public.current_officer_id()))
    or ((select public.auth_role()) = 'district_officer'
        and district_officer_id = (select public.current_officer_id()))
    or ((select public.auth_role()) = 'regional_manager'
        and district_officer_id is not null
        and region = (select public.current_profile_region()))
  )
  with check (
    (select public.is_manager())
    or ((select public.auth_role()) = 'agent' and created_by = (select auth.uid()))
    or ((select public.auth_role()) = 'dm_officer'
        and assigned_officer_id = (select public.current_officer_id()))
    or ((select public.auth_role()) = 'district_officer'
        and district_officer_id = (select public.current_officer_id()))
    or ((select public.auth_role()) = 'regional_manager'
        and district_officer_id is not null
        and region = (select public.current_profile_region()))
  );

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke execute on function public.forward_ticket(uuid, uuid, text) from public, anon;
revoke execute on function public.district_officers(text) from public, anon;
revoke execute on function public.region_district_officers() from public, anon;
revoke execute on function public.report_forwarded_tickets(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
revoke execute on function public.field_summary(uuid) from public, anon;
grant execute on function public.field_summary(uuid) to authenticated, service_role;

grant execute on function public.current_profile_region() to authenticated, service_role;
grant execute on function public.current_officer_kind() to authenticated, service_role;
grant execute on function public.forward_ticket(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.district_officers(text) to authenticated, service_role;
grant execute on function public.region_district_officers() to authenticated, service_role;
grant execute on function public.report_forwarded_tickets(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ghana's 261 districts, grouped by region.
--
-- A starting point, not gospel: names vary between sources and the MMDA
-- list changes, so Administration can rename, deactivate, add and bulk
-- upload districts. Suffixes (Municipal, Metropolitan, District) are
-- left off so the list reads uniformly.
--
-- The regions go in first because districts reference them, and on a
-- fresh database seed.sql has not run yet.
-- ---------------------------------------------------------------------
insert into public.regions (name, sort_order) values
  ('Ahafo', 1), ('Ashanti', 2), ('Bono', 3), ('Bono East', 4), ('Central', 5), ('Eastern', 6),
  ('Greater Accra', 7), ('North East', 8), ('Northern', 9), ('Oti', 10), ('Savannah', 11),
  ('Upper East', 12), ('Upper West', 13), ('Volta', 14), ('Western', 15), ('Western North', 16)
on conflict (name) do nothing;

insert into public.districts (name, region, sort_order) values
  ('Asunafo North', 'Ahafo', 1),
  ('Asunafo South', 'Ahafo', 2),
  ('Asutifi North', 'Ahafo', 3),
  ('Asutifi South', 'Ahafo', 4),
  ('Tano North', 'Ahafo', 5),
  ('Tano South', 'Ahafo', 6),
  ('Adansi Asokwa', 'Ashanti', 1),
  ('Adansi North', 'Ashanti', 2),
  ('Adansi South', 'Ashanti', 3),
  ('Afigya-Kwabre North', 'Ashanti', 4),
  ('Afigya-Kwabre South', 'Ashanti', 5),
  ('Ahafo-Ano North', 'Ashanti', 6),
  ('Ahafo-Ano South East', 'Ashanti', 7),
  ('Ahafo-Ano South West', 'Ashanti', 8),
  ('Akrofuom', 'Ashanti', 9),
  ('Amansie Central', 'Ashanti', 10),
  ('Amansie West', 'Ashanti', 11),
  ('Amansie South', 'Ashanti', 12),
  ('Asante-Akim Central', 'Ashanti', 13),
  ('Asante-Akim North', 'Ashanti', 14),
  ('Asante-Akim South', 'Ashanti', 15),
  ('Asokore-Mampong', 'Ashanti', 16),
  ('Asokwa', 'Ashanti', 17),
  ('Atwima-Kwanwoma', 'Ashanti', 18),
  ('Atwima-Mponua', 'Ashanti', 19),
  ('Atwima-Nwabiagya', 'Ashanti', 20),
  ('Atwima-Nwabiagya North', 'Ashanti', 21),
  ('Bekwai', 'Ashanti', 22),
  ('Bosome Freho', 'Ashanti', 23),
  ('Bosomtwe', 'Ashanti', 24),
  ('Ejisu', 'Ashanti', 25),
  ('Ejura/Sekyedumase', 'Ashanti', 26),
  ('Juaben', 'Ashanti', 27),
  ('Kumasi', 'Ashanti', 28),
  ('Kwabre East', 'Ashanti', 29),
  ('Kwadaso', 'Ashanti', 30),
  ('Mampong', 'Ashanti', 31),
  ('Obuasi East', 'Ashanti', 32),
  ('Obuasi', 'Ashanti', 33),
  ('Offinso', 'Ashanti', 34),
  ('Offinso North', 'Ashanti', 35),
  ('Oforikrom', 'Ashanti', 36),
  ('Old Tafo', 'Ashanti', 37),
  ('Sekyere Afram Plains', 'Ashanti', 38),
  ('Sekyere Central', 'Ashanti', 39),
  ('Sekyere East', 'Ashanti', 40),
  ('Sekyere Kumawu', 'Ashanti', 41),
  ('Sekyere South', 'Ashanti', 42),
  ('Suame', 'Ashanti', 43),
  ('Banda', 'Bono', 1),
  ('Berekum East', 'Bono', 2),
  ('Berekum West', 'Bono', 3),
  ('Dormaa Central', 'Bono', 4),
  ('Dormaa East', 'Bono', 5),
  ('Dormaa West', 'Bono', 6),
  ('Jaman North', 'Bono', 7),
  ('Jaman South', 'Bono', 8),
  ('Sunyani', 'Bono', 9),
  ('Sunyani West', 'Bono', 10),
  ('Tain', 'Bono', 11),
  ('Wenchi', 'Bono', 12),
  ('Atebubu-Amantin', 'Bono East', 1),
  ('Kintampo North', 'Bono East', 2),
  ('Kintampo South', 'Bono East', 3),
  ('Nkoranza North', 'Bono East', 4),
  ('Nkoranza South', 'Bono East', 5),
  ('Pru East', 'Bono East', 6),
  ('Pru West', 'Bono East', 7),
  ('Sene East', 'Bono East', 8),
  ('Sene West', 'Bono East', 9),
  ('Techiman', 'Bono East', 10),
  ('Techiman North', 'Bono East', 11),
  ('Abura/Asebu/Kwamankese', 'Central', 1),
  ('Agona East', 'Central', 2),
  ('Agona West', 'Central', 3),
  ('Ajumako/Enyan/Essiam', 'Central', 4),
  ('Asikuma Odoben Brakwa', 'Central', 5),
  ('Assin Central', 'Central', 6),
  ('Assin North', 'Central', 7),
  ('Assin South', 'Central', 8),
  ('Awutu Senya East', 'Central', 9),
  ('Awutu Senya West', 'Central', 10),
  ('Cape Coast', 'Central', 11),
  ('Effutu', 'Central', 12),
  ('Ekumfi', 'Central', 13),
  ('Gomoa East', 'Central', 14),
  ('Gomoa Central', 'Central', 15),
  ('Gomoa West', 'Central', 16),
  ('Komenda/Edina/Eguafo/Abirem', 'Central', 17),
  ('Mfantsiman', 'Central', 18),
  ('Twifo Atti Morkwa', 'Central', 19),
  ('Twifo/Hemang/Lower Denkyira', 'Central', 20),
  ('Upper Denkyira East', 'Central', 21),
  ('Upper Denkyira West', 'Central', 22),
  ('Abuakwa North', 'Eastern', 1),
  ('Abuakwa South', 'Eastern', 2),
  ('Achiase', 'Eastern', 3),
  ('Akuapim North', 'Eastern', 4),
  ('Akuapim South', 'Eastern', 5),
  ('Akyemansa', 'Eastern', 6),
  ('Asene Manso Akroso', 'Eastern', 7),
  ('Asuogyaman', 'Eastern', 8),
  ('Atiwa East', 'Eastern', 9),
  ('Atiwa West', 'Eastern', 10),
  ('Ayensuano', 'Eastern', 11),
  ('Birim Central', 'Eastern', 12),
  ('Birim North', 'Eastern', 13),
  ('Birim South', 'Eastern', 14),
  ('Denkyembour', 'Eastern', 15),
  ('Fanteakwa North', 'Eastern', 16),
  ('Fanteakwa South', 'Eastern', 17),
  ('Kwaebibirem', 'Eastern', 18),
  ('Kwahu Afram Plains North', 'Eastern', 19),
  ('Kwahu Afram Plains South', 'Eastern', 20),
  ('Kwahu East', 'Eastern', 21),
  ('Kwahu South', 'Eastern', 22),
  ('Kwahu West', 'Eastern', 23),
  ('Lower Manya Krobo', 'Eastern', 24),
  ('New Juaben North', 'Eastern', 25),
  ('New Juaben South', 'Eastern', 26),
  ('Nsawam Adoagyire', 'Eastern', 27),
  ('Okere', 'Eastern', 28),
  ('Suhum', 'Eastern', 29),
  ('Upper Manya Krobo', 'Eastern', 30),
  ('Upper West Akim', 'Eastern', 31),
  ('West Akim', 'Eastern', 32),
  ('Yilo-Krobo', 'Eastern', 33),
  ('Ablekuma Central', 'Greater Accra', 1),
  ('Ablekuma North', 'Greater Accra', 2),
  ('Ablekuma West', 'Greater Accra', 3),
  ('Accra', 'Greater Accra', 4),
  ('Ada East', 'Greater Accra', 5),
  ('Ada West', 'Greater Accra', 6),
  ('Adenta', 'Greater Accra', 7),
  ('Ashaiman', 'Greater Accra', 8),
  ('Ayawaso Central', 'Greater Accra', 9),
  ('Ayawaso East', 'Greater Accra', 10),
  ('Ayawaso North', 'Greater Accra', 11),
  ('Ayawaso West', 'Greater Accra', 12),
  ('Ga Central', 'Greater Accra', 13),
  ('Ga East', 'Greater Accra', 14),
  ('Ga North', 'Greater Accra', 15),
  ('Ga South', 'Greater Accra', 16),
  ('Ga West', 'Greater Accra', 17),
  ('Korle-Klottey', 'Greater Accra', 18),
  ('Kpone-Katamanso', 'Greater Accra', 19),
  ('Krowor', 'Greater Accra', 20),
  ('La-Dade-Kotopon', 'Greater Accra', 21),
  ('La-Nkwantanang-Madina', 'Greater Accra', 22),
  ('Ledzokuku', 'Greater Accra', 23),
  ('Ningo-Prampram', 'Greater Accra', 24),
  ('Okaikwei North', 'Greater Accra', 25),
  ('Shai-Osudoku', 'Greater Accra', 26),
  ('Tema', 'Greater Accra', 27),
  ('Tema West', 'Greater Accra', 28),
  ('Weija Gbawe', 'Greater Accra', 29),
  ('Bunkpurugu Nyankpanduri', 'North East', 1),
  ('Chereponi', 'North East', 2),
  ('East Mamprusi', 'North East', 3),
  ('Mamprugu Moagduri', 'North East', 4),
  ('West Mamprusi', 'North East', 5),
  ('Yunyoo-Nasuan', 'North East', 6),
  ('Gushegu', 'Northern', 1),
  ('Karaga', 'Northern', 2),
  ('Kpandai', 'Northern', 3),
  ('Kumbungu', 'Northern', 4),
  ('Mion', 'Northern', 5),
  ('Nanton', 'Northern', 6),
  ('Nanumba North', 'Northern', 7),
  ('Nanumba South', 'Northern', 8),
  ('Saboba', 'Northern', 9),
  ('Sagnarigu', 'Northern', 10),
  ('Savelugu', 'Northern', 11),
  ('Tamale', 'Northern', 12),
  ('Tatale Sanguli', 'Northern', 13),
  ('Tolon', 'Northern', 14),
  ('Yendi', 'Northern', 15),
  ('Zabzugu', 'Northern', 16),
  ('Biakoye', 'Oti', 1),
  ('Guan', 'Oti', 2),
  ('Jasikan', 'Oti', 3),
  ('Kadjebi', 'Oti', 4),
  ('Krachi East', 'Oti', 5),
  ('Krachi Nchumuru', 'Oti', 6),
  ('Krachi West', 'Oti', 7),
  ('Nkwanta North', 'Oti', 8),
  ('Nkwanta South', 'Oti', 9),
  ('Bole', 'Savannah', 1),
  ('Central Gonja', 'Savannah', 2),
  ('East Gonja', 'Savannah', 3),
  ('North Gonja', 'Savannah', 4),
  ('North East Gonja', 'Savannah', 5),
  ('Sawla-Tuna-Kalba', 'Savannah', 6),
  ('West Gonja', 'Savannah', 7),
  ('Bawku', 'Upper East', 1),
  ('Bawku West', 'Upper East', 2),
  ('Binduri', 'Upper East', 3),
  ('Bolgatanga East', 'Upper East', 4),
  ('Bolgatanga', 'Upper East', 5),
  ('Bongo', 'Upper East', 6),
  ('Builsa North', 'Upper East', 7),
  ('Builsa South', 'Upper East', 8),
  ('Garu', 'Upper East', 9),
  ('Kassena-Nankana', 'Upper East', 10),
  ('Kassena-Nankana West', 'Upper East', 11),
  ('Nabdam', 'Upper East', 12),
  ('Pusiga', 'Upper East', 13),
  ('Talensi', 'Upper East', 14),
  ('Tempane', 'Upper East', 15),
  ('Daffiama Bussie Issa', 'Upper West', 1),
  ('Jirapa', 'Upper West', 2),
  ('Lambussie Karni', 'Upper West', 3),
  ('Lawra', 'Upper West', 4),
  ('Nadowli-Kaleo', 'Upper West', 5),
  ('Nandom', 'Upper West', 6),
  ('Sissala East', 'Upper West', 7),
  ('Sissala West', 'Upper West', 8),
  ('Wa East', 'Upper West', 9),
  ('Wa', 'Upper West', 10),
  ('Wa West', 'Upper West', 11),
  ('Adaklu', 'Volta', 1),
  ('Afadzato South', 'Volta', 2),
  ('Agotime Ziope', 'Volta', 3),
  ('Akatsi North', 'Volta', 4),
  ('Akatsi South', 'Volta', 5),
  ('Anloga', 'Volta', 6),
  ('Central Tongu', 'Volta', 7),
  ('Ho', 'Volta', 8),
  ('Ho West', 'Volta', 9),
  ('Hohoe', 'Volta', 10),
  ('Keta', 'Volta', 11),
  ('Ketu North', 'Volta', 12),
  ('Ketu South', 'Volta', 13),
  ('Kpando', 'Volta', 14),
  ('North Dayi', 'Volta', 15),
  ('North Tongu', 'Volta', 16),
  ('South Dayi', 'Volta', 17),
  ('South Tongu', 'Volta', 18),
  ('Ahanta West', 'Western', 1),
  ('Amenfi Central', 'Western', 2),
  ('Amenfi West', 'Western', 3),
  ('Effia Kwesimintsim', 'Western', 4),
  ('Ellembelle', 'Western', 5),
  ('Jomoro', 'Western', 6),
  ('Mpohor', 'Western', 7),
  ('Nzema East', 'Western', 8),
  ('Prestea-Huni Valley', 'Western', 9),
  ('Sekondi Takoradi', 'Western', 10),
  ('Shama', 'Western', 11),
  ('Tarkwa-Nsuaem', 'Western', 12),
  ('Wassa Amenfi East', 'Western', 13),
  ('Wassa East', 'Western', 14),
  ('Aowin', 'Western North', 1),
  ('Bia East', 'Western North', 2),
  ('Bia West', 'Western North', 3),
  ('Bibiani Anhwiaso Bekwai', 'Western North', 4),
  ('Bodi', 'Western North', 5),
  ('Juaboso', 'Western North', 6),
  ('Sefwi Akontombra', 'Western North', 7),
  ('Sefwi-Wiawso', 'Western North', 8),
  ('Suaman', 'Western North', 9)
on conflict (name) do nothing;

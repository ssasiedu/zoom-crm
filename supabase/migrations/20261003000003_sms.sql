-- =====================================================================
-- 0010: SMS messaging (mNotify by default)
--   * sms_templates  : editable message templates with {placeholders}
--   * sms_messages   : every message queued/sent, with provider response
--   * triggers       : queue an SMS automatically on ticket events
-- Credentials live in app_settings (key 'sms', is_secret) and are only
-- ever read server-side by the send-sms edge function.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Placeholder rendering, shared by the triggers and the UI preview
-- ---------------------------------------------------------------------
create or replace function public.apply_placeholders(p_body text, p_vars jsonb)
returns text
language plpgsql immutable as $$
declare
  k text;
  v text;
  out_text text := coalesce(p_body, '');
begin
  for k, v in select key, coalesce(value, '') from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    out_text := replace(out_text, '{' || k || '}', v);
  end loop;
  -- any placeholder we don't know about is dropped rather than sent raw
  return btrim(regexp_replace(out_text, '\{[a-z_]+\}', '', 'g'));
end $$;

create or replace function public.ticket_sms_vars(t public.tickets)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ticket_number', t.ticket_number,
    'client_name', t.client_name,
    'first_name', split_part(btrim(t.client_name), ' ', 1),
    'customer_id', coalesce(t.client_id, ''),
    'contact_number', t.contact_number,
    'issue_type', t.issue_type,
    'status', t.status::text,
    'community', t.community,
    'region', t.region,
    'description', t.description,
    'remarks', coalesce(t.remarks, ''),
    'responsible_party', coalesce(t.responsible_party, ''),
    'due_date', to_char(t.due_date, 'DD/MM/YYYY'),
    'date_opened', to_char(t.date_opened at time zone 'Africa/Accra', 'DD/MM/YYYY'),
    'completion_date', coalesce(to_char(t.completion_date at time zone 'Africa/Accra', 'DD/MM/YYYY'), ''),
    'payment_amount', coalesce(to_char(t.payment_amount, 'FM999G999G999D00'), ''),
    'officer', coalesce((select o.full_name from public.officers o where o.id = t.assigned_officer_id), ''),
    'company', coalesce((select value ->> 'app_name' from public.app_settings where key = 'branding'), 'Zoomlion')
  )
$$;

-- ---------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------
create table if not exists public.sms_templates (
  id bigint generated always as identity primary key,
  code text not null unique check (length(btrim(code)) > 0),
  name text not null check (length(btrim(name)) > 0),
  body text not null check (length(btrim(body)) between 1 and 918),
  /* null = ad-hoc template offered in the Send SMS dialog */
  event text check (event is null or event in (
    'ticket_created', 'ticket_assigned', 'ticket_in_progress',
    'ticket_resolved', 'ticket_closed', 'ticket_reopened')),
  auto_send boolean not null default false,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sms_templates_event_idx on public.sms_templates (event) where event is not null;

drop trigger if exists set_updated_at on public.sms_templates;
create trigger set_updated_at before update on public.sms_templates
  for each row execute function public.set_updated_at();

insert into public.sms_templates (code, name, body, event, auto_send, is_system, sort_order) values
  ('ticket_created', 'Ticket logged',
   'Dear {first_name}, we have logged your {issue_type} report. Your ticket number is {ticket_number}. We will get back to you by {due_date}. {company}',
   'ticket_created', false, true, 10),
  ('ticket_assigned', 'Officer assigned',
   'Dear {first_name}, ticket {ticket_number} has been assigned to our officer {officer}. They will contact you shortly. {company}',
   'ticket_assigned', false, true, 20),
  ('ticket_in_progress', 'Work started',
   'Dear {first_name}, we have started working on ticket {ticket_number} ({issue_type}). {company}',
   'ticket_in_progress', false, true, 30),
  ('ticket_resolved', 'Issue resolved',
   'Dear {first_name}, ticket {ticket_number} ({issue_type}) has been resolved. Thank you for your patience. {company}',
   'ticket_resolved', false, true, 40),
  ('ticket_closed', 'Ticket closed',
   'Dear {first_name}, your ticket {ticket_number} has been closed. Thank you for choosing {company}. Call us again on any service issue.',
   'ticket_closed', true, true, 50),
  ('ticket_reopened', 'Ticket reopened',
   'Dear {first_name}, ticket {ticket_number} has been reopened and is receiving further attention. {company}',
   'ticket_reopened', false, true, 60),
  ('payment_reminder', 'Payment reminder (ad-hoc)',
   'Dear {first_name}, our records show an outstanding balance on your account {customer_id}. Kindly arrange payment. {company}',
   null, false, false, 70),
  ('callback_promise', 'Callback promise (ad-hoc)',
   'Dear {first_name}, thank you for speaking with us about ticket {ticket_number}. We will call you back as agreed. {company}',
   null, false, false, 80)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Message log / outbox
-- ---------------------------------------------------------------------
create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets (id) on delete set null,
  recipient text not null check (recipient ~ '^(0|\+233)[0-9]{9}$'),
  recipient_name text,
  message text not null check (length(btrim(message)) between 1 and 918),
  template_code text,
  trigger_event text not null default 'manual',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  provider text,
  provider_message_id text,
  provider_response jsonb,
  error text,
  attempts integer not null default 0,
  segments integer not null default 1,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists sms_messages_ticket_idx on public.sms_messages (ticket_id, created_at desc);
create index if not exists sms_messages_status_idx on public.sms_messages (status, created_at);
create index if not exists sms_messages_created_idx on public.sms_messages (created_at desc);
create index if not exists sms_messages_recipient_idx on public.sms_messages (recipient);

-- ---------------------------------------------------------------------
-- Queue an SMS when a ticket event happens
-- ---------------------------------------------------------------------
create or replace function public.tickets_sms_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event text;
  v_tpl public.sms_templates;
  v_enabled boolean;
  v_body text;
begin
  select coalesce((value ->> 'enabled')::boolean, false) and coalesce((value ->> 'auto_send')::boolean, true)
    into v_enabled
  from public.app_settings where key = 'sms';

  if not coalesce(v_enabled, false) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_event := 'ticket_created';
  elsif new.status is distinct from old.status then
    v_event := case new.status
                 when 'In-Progress' then case when old.status in ('Resolved', 'Closed')
                                              then 'ticket_reopened' else 'ticket_in_progress' end
                 when 'Resolved' then 'ticket_resolved'
                 when 'Closed' then 'ticket_closed'
                 when 'Open' then case when old.status in ('Resolved', 'Closed') then 'ticket_reopened' else null end
               end;
  elsif new.assigned_officer_id is distinct from old.assigned_officer_id
        and new.assigned_officer_id is not null then
    v_event := 'ticket_assigned';
  end if;

  if v_event is null then
    return null;
  end if;

  select * into v_tpl from public.sms_templates
  where event = v_event and is_active and auto_send limit 1;

  if v_tpl.id is null or new.contact_number is null then
    return null;
  end if;

  v_body := public.apply_placeholders(v_tpl.body, public.ticket_sms_vars(new));
  if coalesce(btrim(v_body), '') = '' then
    return null;
  end if;

  insert into public.sms_messages
    (ticket_id, recipient, recipient_name, message, template_code, trigger_event, requested_by)
  values
    (new.id, new.contact_number, new.client_name, left(v_body, 918), v_tpl.code, v_event, auth.uid());

  return null;
end $$;

drop trigger if exists tickets_sms_after_change on public.tickets;
create trigger tickets_sms_after_change after insert or update on public.tickets
  for each row execute function public.tickets_sms_after_change();

-- ---------------------------------------------------------------------
-- RLS: messages follow ticket visibility; managers see everything.
-- Rows are only ever written by the send-sms edge function (service role)
-- or by the trigger above, so there is no insert policy.
-- ---------------------------------------------------------------------
alter table public.sms_templates enable row level security;
drop policy if exists sms_templates_read on public.sms_templates;
drop policy if exists sms_templates_admin_write on public.sms_templates;
create policy sms_templates_read on public.sms_templates
  for select to authenticated using (true);
create policy sms_templates_admin_write on public.sms_templates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.sms_messages enable row level security;
drop policy if exists sms_messages_read on public.sms_messages;
drop policy if exists sms_messages_manager_write on public.sms_messages;
create policy sms_messages_read on public.sms_messages
  for select to authenticated
  using (
    (select public.is_manager())
    or (ticket_id is not null
        and exists (select 1 from public.tickets t where t.id = sms_messages.ticket_id))
  );
create policy sms_messages_manager_write on public.sms_messages
  for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- ---------------------------------------------------------------------
-- Delivery statistics for the admin screen
-- ---------------------------------------------------------------------
create or replace function public.sms_stats(p_days integer default 30)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'sent', count(*) filter (where status = 'sent'),
    'pending', count(*) filter (where status = 'pending'),
    'failed', count(*) filter (where status = 'failed'),
    'segments', coalesce(sum(segments) filter (where status = 'sent'), 0),
    'today', count(*) filter (where (created_at at time zone 'Africa/Accra')::date = (now() at time zone 'Africa/Accra')::date)
  )
  from public.sms_messages
  where created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
$$;

revoke execute on function public.sms_stats(integer) from public, anon;
grant execute on function public.sms_stats(integer) to authenticated, service_role;
revoke execute on function public.apply_placeholders(text, jsonb) from public, anon;
grant execute on function public.apply_placeholders(text, jsonb) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sms_messages'
  ) then
    alter publication supabase_realtime add table public.sms_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Is SMS usable right now?
--
-- The app_settings['sms'] row is secret (it holds the API key) so only
-- admins can read it. Agents and officers still need to know whether to
-- offer a "Send SMS" button, so this function exposes just the flag.
-- ---------------------------------------------------------------------
create or replace function public.sms_enabled()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (value ->> 'enabled')::boolean
       and coalesce(length(btrim(value ->> 'api_key')), 0) > 0
     from public.app_settings where key = 'sms'),
    false)
$$;

revoke execute on function public.sms_enabled() from public, anon;
grant execute on function public.sms_enabled() to authenticated, service_role;

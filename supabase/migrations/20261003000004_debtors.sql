-- =====================================================================
-- 0011: Monthly debtor call lists
--   debtor_periods : one row per month the list is uploaded for
--   debtors        : the uploaded rows + what the officer logged back
--   lookups        : customer_types, providers, debtor_feedback
-- =====================================================================

-- ---------------------------------------------------------------------
-- New lookup tables (same shape as the existing ones)
-- ---------------------------------------------------------------------
create table if not exists public.customer_types (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.providers (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debtor_feedback (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  /* feedback that means money was or will be collected, used in reports */
  is_positive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['customer_types', 'providers', 'debtor_feedback'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

insert into public.customer_types (name, sort_order) values
  ('RESIDENTIAL', 10), ('COMMERCIAL', 20), ('INSTITUTIONAL', 30),
  ('INDUSTRIAL', 40), ('GOVERNMENT', 50)
on conflict (name) do nothing;

insert into public.providers (name, sort_order) values
  ('ZOOMLION', 10), ('OTHER PROVIDER', 20)
on conflict (name) do nothing;

insert into public.debtor_feedback (name, sort_order, is_positive) values
  ('NO RESPONSE', 10, false),
  ('STOPPED BY ZL', 20, false),
  ('STOPPED BY CLIENT', 30, false),
  ('PAID', 40, true),
  ('WILL PAY', 50, true),
  ('RELOCATED', 60, false),
  ('DUPLICATE', 70, false),
  ('CANNOT BE REACH', 80, false),
  ('WRONG CONTACT', 90, false),
  ('DEACTIVATED BY TELCO', 100, false),
  ('REC. NEEDED', 110, false),
  ('WRONG NUMBER', 120, false),
  ('CALL DROP', 130, false),
  ('CALL BACK', 140, false),
  ('NEVER REGISTERED', 150, false),
  ('REGISTERED BUT WAS NEVER SERVICED', 160, false)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------
create table if not exists public.debtor_periods (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  notes text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debtor_periods_first_of_month check (extract(day from period_month) = 1)
);

drop trigger if exists set_updated_at on public.debtor_periods;
create trigger set_updated_at before update on public.debtor_periods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Debtor rows
-- ---------------------------------------------------------------------
create table if not exists public.debtors (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.debtor_periods (id) on delete cascade,
  customer_id text,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_type text references public.customer_types (name) on update cascade on delete set null,
  provider text references public.providers (name) on update cascade on delete set null,
  community text,
  region text references public.regions (name) on update cascade on delete set null,
  contact_number text check (contact_number is null or contact_number ~ '^(0|\+233)[0-9]{9}$'),
  outstanding_balance numeric(12, 2) not null default 0 check (outstanding_balance >= 0),
  officer_id uuid references public.officers (id) on delete set null,
  amount_collected numeric(12, 2) check (amount_collected is null or amount_collected >= 0),
  feedback text references public.debtor_feedback (name) on update cascade on delete set null,
  comment text,
  promised_amount numeric(12, 2) check (promised_amount is null or promised_amount >= 0),
  promised_date date,
  call_attempts integer not null default 0,
  contacted_at timestamptz,
  contacted_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  work_status text generated always as (
    case when coalesce(amount_collected, 0) > 0 then 'Collected'
         when feedback is not null then 'Worked'
         else 'Pending' end
  ) stored
);

create index if not exists debtors_period_idx on public.debtors (period_id);
create index if not exists debtors_officer_idx on public.debtors (officer_id);
create index if not exists debtors_period_officer_idx on public.debtors (period_id, officer_id);
create index if not exists debtors_feedback_idx on public.debtors (feedback);
create index if not exists debtors_work_status_idx on public.debtors (work_status);
create index if not exists debtors_provider_idx on public.debtors (provider);
create index if not exists debtors_customer_type_idx on public.debtors (customer_type);
create index if not exists debtors_community_idx on public.debtors (community);
create index if not exists debtors_customer_id_idx on public.debtors (lower(customer_id));
create index if not exists debtors_contact_idx on public.debtors (contact_number);
create index if not exists debtors_name_trgm_idx on public.debtors using gin (customer_name gin_trgm_ops);

-- SMS can be sent to a debtor as well as to a ticket client
alter table public.sms_messages
  add column if not exists debtor_id uuid references public.debtors (id) on delete set null;
create index if not exists sms_messages_debtor_idx on public.sms_messages (debtor_id, created_at desc);

-- ---------------------------------------------------------------------
-- Business rules
-- ---------------------------------------------------------------------
create or replace function public.debtors_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.auth_role();
  v_officer uuid := public.current_officer_id();
begin
  new.customer_id := nullif(btrim(coalesce(new.customer_id, '')), '');
  new.customer_name := btrim(new.customer_name);
  new.community := nullif(btrim(coalesce(new.community, '')), '');
  new.comment := nullif(btrim(coalesce(new.comment, '')), '');
  new.contact_number := nullif(public.normalize_gh_phone(nullif(btrim(coalesce(new.contact_number, '')), '')), '');
  -- spreadsheets carry a lot of broken numbers; keep the row, drop the number
  if new.contact_number is not null and new.contact_number !~ '^(0|\+233)[0-9]{9}$' then
    new.contact_number := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_uid, new.created_by);
    new.created_at := now();
  else
    new.id := old.id;
    new.period_id := old.period_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    -- Officers may only fill in the call result on their own rows
    if v_uid is not null and v_role = 'dm_officer' then
      if new.officer_id is distinct from old.officer_id
         or old.officer_id is distinct from v_officer then
        raise exception 'You can only update debtor records assigned to you' using errcode = '42501';
      end if;
      if (new.customer_id, new.customer_name, new.customer_type, new.provider, new.community,
          new.region, new.contact_number, new.outstanding_balance)
         is distinct from
         (old.customer_id, old.customer_name, old.customer_type, old.provider, old.community,
          old.region, old.contact_number, old.outstanding_balance) then
        raise exception 'Officers can only record amount collected, feedback and comments' using errcode = '42501';
      end if;
    end if;

    if (new.feedback, new.amount_collected, new.comment)
       is distinct from (old.feedback, old.amount_collected, old.comment) then
      new.contacted_at := now();
      new.contacted_by := coalesce(v_uid, new.contacted_by);
      if new.feedback is distinct from old.feedback then
        new.call_attempts := old.call_attempts + 1;
      end if;
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(v_uid, new.updated_by);

  if new.amount_collected is not null and new.feedback is null then
    raise exception 'Choose a feedback reason when recording an amount collected';
  end if;

  -- region defaults to the assigned officer's region
  if new.region is null and new.officer_id is not null then
    select o.region into new.region from public.officers o where o.id = new.officer_id;
  end if;

  return new;
end $$;

drop trigger if exists debtors_before_write on public.debtors;
create trigger debtors_before_write before insert or update on public.debtors
  for each row execute function public.debtors_before_write();

-- One summary notification per officer after an upload or a bulk
-- assignment (a row-level trigger would send hundreds).
create or replace function public.notify_debtor_assignment(p_period uuid, p_officers uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_sent integer := 0;
  r record;
  v_month text;
begin
  if not public.is_manager() then
    raise exception 'Only supervisors or administrators can assign debtor lists' using errcode = '42501';
  end if;
  select trim(to_char(p.period_month, 'Month YYYY')) into v_month
  from public.debtor_periods p where p.id = p_period;

  for r in
    select o.profile_id, count(*) as n, coalesce(sum(d.outstanding_balance), 0) as amount
    from public.debtors d
    join public.officers o on o.id = d.officer_id
    where d.period_id = p_period
      and o.profile_id is not null
      and (p_officers is null or d.officer_id = any (p_officers))
    group by o.profile_id
  loop
    insert into public.notifications (user_id, ticket_id, type, message)
    values (r.profile_id, null, 'debtor_assignment',
            format('%s debtor accounts (GH%s %s) are on your %s call list',
                   r.n, '₵', to_char(r.amount, 'FM999G999G999D00'), coalesce(v_month, 'monthly')));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

revoke execute on function public.notify_debtor_assignment(uuid, uuid[]) from public, anon;
grant execute on function public.notify_debtor_assignment(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['customer_types', 'providers', 'debtor_feedback'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_admin_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_admin_write" on public.%I for all to authenticated
                    using ((select public.is_admin())) with check ((select public.is_admin()))', t, t);
  end loop;
end $$;

alter table public.debtor_periods enable row level security;
drop policy if exists debtor_periods_read on public.debtor_periods;
drop policy if exists debtor_periods_write on public.debtor_periods;
create policy debtor_periods_read on public.debtor_periods
  for select to authenticated using (true);
create policy debtor_periods_write on public.debtor_periods
  for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

alter table public.debtors enable row level security;
drop policy if exists debtors_select on public.debtors;
drop policy if exists debtors_insert on public.debtors;
drop policy if exists debtors_update on public.debtors;
drop policy if exists debtors_delete on public.debtors;

create policy debtors_select on public.debtors
  for select to authenticated
  using (
    (select public.is_manager())
    or (officer_id is not null and officer_id = (select public.current_officer_id()))
  );

create policy debtors_insert on public.debtors
  for insert to authenticated
  with check ((select public.is_manager()));

create policy debtors_update on public.debtors
  for update to authenticated
  using (
    (select public.is_manager())
    or (officer_id is not null and officer_id = (select public.current_officer_id()))
  )
  with check (
    (select public.is_manager())
    or (officer_id is not null and officer_id = (select public.current_officer_id()))
  );

create policy debtors_delete on public.debtors
  for delete to authenticated using ((select public.is_manager()));

-- ---------------------------------------------------------------------
-- Helper: add lookup values found in an upload (managers only)
-- ---------------------------------------------------------------------
create or replace function public.ensure_lookup_values(p_table text, p_names text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_added integer := 0;
  v_rows integer;
  v_name text;
  v_next integer;
begin
  if not public.is_manager() then
    raise exception 'Only supervisors or administrators can add lookup values' using errcode = '42501';
  end if;
  if p_table not in ('customer_types', 'providers', 'debtor_feedback', 'regions') then
    raise exception 'Unsupported lookup table %', p_table;
  end if;
  foreach v_name in array coalesce(p_names, array[]::text[]) loop
    v_name := btrim(v_name);
    continue when v_name = '';
    execute format('select coalesce(max(sort_order), 0) + 10 from public.%I', p_table) into v_next;
    execute format('insert into public.%I (name, sort_order) values ($1, $2) on conflict (name) do nothing', p_table)
      using v_name, v_next;
    get diagnostics v_rows = row_count;
    v_added := v_added + coalesce(v_rows, 0);
  end loop;
  return v_added;
end $$;

revoke execute on function public.ensure_lookup_values(text, text[]) from public, anon;
grant execute on function public.ensure_lookup_values(text, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------
create or replace function public.debtors_filtered(
  p_period uuid default null,
  p_officer uuid default null,
  p_provider text default null,
  p_customer_type text default null,
  p_community text default null,
  p_region text default null,
  p_feedback text default null
)
returns setof public.debtors
language sql stable security invoker set search_path = public as $$
  select d.*
  from public.debtors d
  where (p_period is null or d.period_id = p_period)
    and (p_officer is null or d.officer_id = p_officer)
    and (p_provider is null or d.provider = p_provider)
    and (p_customer_type is null or d.customer_type = p_customer_type)
    and (p_community is null or d.community ilike '%' || p_community || '%')
    and (p_region is null or d.region = p_region)
    and (p_feedback is null or d.feedback = p_feedback)
$$;

create or replace function public.debtor_summary(
  p_period uuid default null, p_officer uuid default null, p_provider text default null,
  p_customer_type text default null, p_community text default null, p_region text default null,
  p_feedback text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'customers', count(*),
    'outstanding', coalesce(sum(f.outstanding_balance), 0),
    'collected', coalesce(sum(f.amount_collected), 0),
    'promised', coalesce(sum(f.promised_amount), 0),
    'worked', count(*) filter (where f.work_status <> 'Pending'),
    'pending', count(*) filter (where f.work_status = 'Pending'),
    'collected_count', count(*) filter (where f.work_status = 'Collected'),
    'unassigned', count(*) filter (where f.officer_id is null),
    'contact_rate', coalesce(round(100.0 * count(*) filter (where f.work_status <> 'Pending')
                      / nullif(count(*), 0), 1), 0),
    'collection_rate', coalesce(round(100.0 * coalesce(sum(f.amount_collected), 0)
                      / nullif(sum(f.outstanding_balance), 0), 1), 0)
  )
  from public.debtors_filtered(p_period, p_officer, p_provider, p_customer_type,
                               p_community, p_region, p_feedback) f
$$;

create or replace function public.report_debtor_officers(
  p_period uuid default null, p_officer uuid default null, p_provider text default null,
  p_customer_type text default null, p_community text default null, p_region text default null,
  p_feedback text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select * from public.debtors_filtered(p_period, p_officer, p_provider, p_customer_type,
                                          p_community, p_region, p_feedback)
  ),
  fb as (
    select x.officer_id, jsonb_object_agg(x.feedback, x.cnt) as by_feedback
    from (select officer_id, feedback, count(*) as cnt from f where feedback is not null group by 1, 2) x
    group by x.officer_id
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.collected desc, s.officer_name), '[]'::jsonb)
  from (
    select coalesce(o.id::text, 'unassigned') as officer_id,
           coalesce(o.full_name, 'Unassigned') as officer_name,
           o.region,
           count(f.id) as customers,
           coalesce(sum(f.outstanding_balance), 0) as outstanding,
           coalesce(sum(f.amount_collected), 0) as collected,
           coalesce(sum(f.promised_amount), 0) as promised,
           count(f.id) filter (where f.work_status <> 'Pending') as worked,
           count(f.id) filter (where f.work_status = 'Pending') as pending,
           count(f.id) filter (where f.work_status = 'Collected') as collected_count,
           coalesce(round(100.0 * count(f.id) filter (where f.work_status <> 'Pending')
                    / nullif(count(f.id), 0), 1), 0) as contact_rate,
           coalesce(round(100.0 * coalesce(sum(f.amount_collected), 0)
                    / nullif(sum(f.outstanding_balance), 0), 1), 0) as collection_rate,
           coalesce(fb.by_feedback, '{}'::jsonb) as by_feedback
    from f
    left join public.officers o on o.id = f.officer_id
    left join fb on fb.officer_id is not distinct from f.officer_id
    group by o.id, o.full_name, o.region, fb.by_feedback
  ) s
$$;

create or replace function public.report_debtor_breakdown(
  p_dimension text,
  p_period uuid default null, p_officer uuid default null, p_provider text default null,
  p_customer_type text default null, p_community text default null, p_region text default null,
  p_feedback text default null, p_limit integer default 50
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.outstanding desc, s.label), '[]'::jsonb)
  from (
    select case p_dimension
             when 'provider' then coalesce(f.provider, 'Unspecified')
             when 'customer_type' then coalesce(f.customer_type, 'Unspecified')
             when 'community' then coalesce(f.community, 'Unspecified')
             when 'region' then coalesce(f.region, 'Unspecified')
             when 'feedback' then coalesce(f.feedback, 'Not yet called')
             when 'work_status' then f.work_status
           end as label,
           count(*) as customers,
           coalesce(sum(f.outstanding_balance), 0) as outstanding,
           coalesce(sum(f.amount_collected), 0) as collected,
           count(*) filter (where f.work_status <> 'Pending') as worked
    from public.debtors_filtered(p_period, p_officer, p_provider, p_customer_type,
                                 p_community, p_region, p_feedback) f
    group by 1
    order by 3 desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) s
  where s.label is not null
$$;

create or replace function public.report_debtor_trend(p_months integer default 12)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.period_month), '[]'::jsonb)
  from (
    select p.period_month,
           count(d.id) as customers,
           coalesce(sum(d.outstanding_balance), 0) as outstanding,
           coalesce(sum(d.amount_collected), 0) as collected,
           count(d.id) filter (where d.work_status <> 'Pending') as worked,
           coalesce(round(100.0 * coalesce(sum(d.amount_collected), 0)
                    / nullif(sum(d.outstanding_balance), 0), 1), 0) as collection_rate
    from public.debtor_periods p
    left join public.debtors d on d.period_id = p.id
    where p.period_month >= (date_trunc('month', now() at time zone 'Africa/Accra')
                             - make_interval(months => greatest(coalesce(p_months, 12), 1)))::date
    group by p.period_month
  ) s
$$;

/** Cards on the officer's debtor page */
create or replace function public.officer_debtor_summary(p_period uuid default null, p_officer uuid default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'customers', count(*),
    'pending', count(*) filter (where d.work_status = 'Pending'),
    'worked', count(*) filter (where d.work_status <> 'Pending'),
    'collected_count', count(*) filter (where d.work_status = 'Collected'),
    'outstanding', coalesce(sum(d.outstanding_balance), 0),
    'collected', coalesce(sum(d.amount_collected), 0),
    'promised', coalesce(sum(d.promised_amount), 0),
    'collection_rate', coalesce(round(100.0 * coalesce(sum(d.amount_collected), 0)
                        / nullif(sum(d.outstanding_balance), 0), 1), 0),
    'due_promises', count(*) filter (where d.promised_date is not null
                        and d.promised_date <= (now() at time zone 'Africa/Accra')::date
                        and coalesce(d.amount_collected, 0) = 0)
  )
  from public.debtors d
  where d.officer_id = coalesce(p_officer, public.current_officer_id())
    and (p_period is null or d.period_id = p_period)
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'debtors_filtered(uuid, uuid, text, text, text, text, text)',
    'debtor_summary(uuid, uuid, text, text, text, text, text)',
    'report_debtor_officers(uuid, uuid, text, text, text, text, text)',
    'report_debtor_breakdown(text, uuid, uuid, text, text, text, text, text, integer)',
    'report_debtor_trend(integer)',
    'officer_debtor_summary(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['debtors', 'debtor_periods'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

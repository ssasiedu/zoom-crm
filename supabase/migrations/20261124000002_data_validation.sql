-- =====================================================================
-- Data validation exercises
--
-- The debtor list answers one standing question — who owes us money.
-- This answers a different question each time: take a list of customers,
-- call them, write down what they say, and give management a picture at
-- the end. "Are these inactive accounts really inactive" is one exercise;
-- next month it might be checking contact details or confirming service
-- frequency.
--
-- So the unit here is a named batch with a stated purpose rather than a
-- month, and the officer records a *response* rather than a collection
-- feedback. Everything else deliberately mirrors the debtor module —
-- same fields, same call log keeping every call, same rollup, same
-- officer guard — because the team already knows how to work that one.
--
--   validation_batches   : one row per exercise, with a name and purpose
--   validation_customers : the uploaded rows + what came back
--   validation_call_log  : one row per call, each able to carry a payment
--   validation_responses : the configurable list of answers
-- =====================================================================

-- ---------------------------------------------------------------------
-- What a customer can say.
--
-- outcome is what turns a pile of calls into a management decision: how
-- many confirmed they are still with us, how many have gone, and how
-- many we never reached at all.
-- ---------------------------------------------------------------------
create table if not exists public.validation_responses (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  outcome text not null default 'other'
    check (outcome in ('active', 'inactive', 'unreachable', 'other')),
  /* the response means money was or will be collected */
  is_positive boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.validation_responses;
create trigger set_updated_at before update on public.validation_responses
  for each row execute function public.set_updated_at();

insert into public.validation_responses (name, outcome, is_positive, sort_order) values
  ('STILL ACTIVE', 'active', false, 10),
  ('ACTIVE – DETAILS UPDATED', 'active', false, 20),
  ('PAID', 'active', true, 30),
  ('WILL PAY', 'active', true, 40),
  ('STOPPED BY CLIENT', 'inactive', false, 50),
  ('STOPPED BY ZL', 'inactive', false, 60),
  ('RELOCATED', 'inactive', false, 70),
  ('NEVER REGISTERED', 'inactive', false, 80),
  ('DUPLICATE', 'inactive', false, 90),
  ('NO RESPONSE', 'unreachable', false, 100),
  ('WRONG NUMBER', 'unreachable', false, 110),
  ('CANNOT BE REACHED', 'unreachable', false, 120),
  ('DEACTIVATED BY TELCO', 'unreachable', false, 130),
  ('CALL BACK', 'other', false, 140),
  ('CALL DROP', 'other', false, 150)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- The exercise itself
-- ---------------------------------------------------------------------
create table if not exists public.validation_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  /* why this list is being called — shown to the officers working it */
  purpose text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists validation_batches_name_ci_idx
  on public.validation_batches (upper(btrim(name)));

drop trigger if exists set_updated_at on public.validation_batches;
create trigger set_updated_at before update on public.validation_batches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- The customers on the list. Same fields as a debtor row.
-- ---------------------------------------------------------------------
create table if not exists public.validation_customers (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.validation_batches (id) on delete cascade,
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
  response text references public.validation_responses (name) on update cascade on delete set null,
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
    case when response is not null then 'Answered' else 'Pending' end
  ) stored
);

create index if not exists validation_customers_batch_idx on public.validation_customers (batch_id);
create index if not exists validation_customers_officer_idx on public.validation_customers (officer_id);
create index if not exists validation_customers_batch_officer_idx on public.validation_customers (batch_id, officer_id);
create index if not exists validation_customers_response_idx on public.validation_customers (response);
create index if not exists validation_customers_work_status_idx on public.validation_customers (work_status);
create index if not exists validation_customers_region_idx on public.validation_customers (region);
create index if not exists validation_customers_community_idx on public.validation_customers (community);
create index if not exists validation_customers_customer_id_idx on public.validation_customers (lower(customer_id));
create index if not exists validation_customers_contact_idx on public.validation_customers (contact_number);
create index if not exists validation_customers_name_trgm_idx
  on public.validation_customers using gin (customer_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- One row per call, exactly as the debtor list keeps them
-- ---------------------------------------------------------------------
create table if not exists public.validation_call_log (
  id uuid primary key default gen_random_uuid(),
  validation_id uuid not null references public.validation_customers (id) on delete cascade,
  /* denormalised so reports can group by batch without a second join */
  batch_id uuid not null references public.validation_batches (id) on delete cascade,
  officer_id uuid references public.officers (id) on delete set null,

  called_at timestamptz not null default now(),
  response text not null references public.validation_responses (name)
    on update cascade on delete restrict,
  amount_collected numeric(12, 2) check (amount_collected is null or amount_collected >= 0),
  payment_reference text,
  promised_amount numeric(12, 2) check (promised_amount is null or promised_amount >= 0),
  promised_date date,
  comment text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists validation_call_log_customer_idx
  on public.validation_call_log (validation_id, called_at desc);
create index if not exists validation_call_log_officer_idx on public.validation_call_log (officer_id, called_at);
create index if not exists validation_call_log_batch_idx on public.validation_call_log (batch_id);
create index if not exists validation_call_log_called_at_idx on public.validation_call_log (called_at);

drop trigger if exists set_updated_at on public.validation_call_log;
create trigger set_updated_at before update on public.validation_call_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Business rules on the customer row
-- ---------------------------------------------------------------------
create or replace function public.validation_customers_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.auth_role();
begin
  /* the rollup below, writing the summary columns back */
  if coalesce(current_setting('app.validation_rollup', true), 'off') = 'on' then
    new.updated_at := now();
    return new;
  end if;

  new.customer_id := nullif(btrim(coalesce(new.customer_id, '')), '');
  new.customer_name := btrim(new.customer_name);
  new.community := nullif(btrim(coalesce(new.community, '')), '');
  new.comment := nullif(btrim(coalesce(new.comment, '')), '');
  new.contact_number := nullif(public.normalize_gh_phone(nullif(btrim(coalesce(new.contact_number, '')), '')), '');
  /* spreadsheets carry a lot of broken numbers; keep the row, drop the number */
  if new.contact_number is not null and new.contact_number !~ '^(0|\+233)[0-9]{9}$' then
    new.contact_number := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_uid, new.created_by);
    new.created_at := now();
    if v_uid is not null and not public.is_manager() then
      raise exception 'Only supervisors or administrators can load a validation list'
        using errcode = '42501';
    end if;
  else
    new.id := old.id;
    new.batch_id := old.batch_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    /* An officer's work goes through the call log and comes back through
       the rollup, so the row itself is not theirs to edit. */
    if v_uid is not null and v_role in ('dm_officer', 'district_officer') then
      raise exception 'Record your call under Call history so every call is kept'
        using errcode = '42501';
    end if;
    if v_uid is not null and not public.is_manager() and v_role is not null then
      raise exception 'Only supervisors or administrators can change a validation record'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(v_uid, new.updated_by);

  /* region defaults to the assigned officer's region */
  if new.region is null and new.officer_id is not null then
    select o.region into new.region from public.officers o where o.id = new.officer_id;
  end if;

  return new;
end $$;

drop trigger if exists validation_customers_before_write on public.validation_customers;
create trigger validation_customers_before_write
  before insert or update on public.validation_customers
  for each row execute function public.validation_customers_before_write();

-- ---------------------------------------------------------------------
-- Business rules on a logged call
-- ---------------------------------------------------------------------
create or replace function public.validation_call_log_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.validation_customers;
begin
  select * into v_row from public.validation_customers c where c.id = new.validation_id;
  if not found then
    raise exception 'That customer is no longer on the list';
  end if;

  new.batch_id := v_row.batch_id;
  new.officer_id := coalesce(v_row.officer_id, new.officer_id);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_uid, new.created_by);
    new.called_at := coalesce(new.called_at, now());
  end if;

  if new.called_at > now() + interval '5 minutes' then
    raise exception 'A call cannot be recorded in the future';
  end if;

  if coalesce(new.amount_collected, 0) > 0 and coalesce(btrim(new.response), '') = '' then
    raise exception 'Choose a response when recording an amount collected';
  end if;

  return new;
end $$;

drop trigger if exists validation_call_log_before_write on public.validation_call_log;
create trigger validation_call_log_before_write
  before insert or update on public.validation_call_log
  for each row execute function public.validation_call_log_before_write();

-- ---------------------------------------------------------------------
-- Roll the log up into the customer row
-- ---------------------------------------------------------------------
create or replace function public.validation_rollup(p_customer uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_latest public.validation_call_log;
begin
  /* SECURITY DEFINER changes the role but not auth.uid(), so without this
     flag the officer guard above would block the rollup's own write. */
  perform set_config('app.validation_rollup', 'on', true);

  select * into v_latest
    from public.validation_call_log l
   where l.validation_id = p_customer
   order by l.called_at desc, l.created_at desc
   limit 1;

  if not found then
    update public.validation_customers
       set response = null, amount_collected = null, comment = null,
           promised_amount = null, promised_date = null,
           call_attempts = 0, contacted_at = null, contacted_by = null
     where id = p_customer;
    perform set_config('app.validation_rollup', 'off', true);
    return;
  end if;

  update public.validation_customers c
     set response = v_latest.response,
         comment = v_latest.comment,
         promised_amount = v_latest.promised_amount,
         promised_date = v_latest.promised_date,
         contacted_at = v_latest.called_at,
         contacted_by = v_latest.created_by,
         amount_collected = (
           select nullif(sum(coalesce(l.amount_collected, 0)), 0)
             from public.validation_call_log l where l.validation_id = p_customer),
         call_attempts = (
           select count(*) from public.validation_call_log l where l.validation_id = p_customer)
   where c.id = p_customer;

  perform set_config('app.validation_rollup', 'off', true);
end $$;

create or replace function public.validation_call_log_after_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.validation_rollup(coalesce(new.validation_id, old.validation_id));
  if tg_op = 'UPDATE' and new.validation_id is distinct from old.validation_id then
    perform public.validation_rollup(old.validation_id);
  end if;
  return null;
end $$;

drop trigger if exists validation_call_log_after_write on public.validation_call_log;
create trigger validation_call_log_after_write
  after insert or update or delete on public.validation_call_log
  for each row execute function public.validation_call_log_after_write();

-- ---------------------------------------------------------------------
-- RLS — the same shape as the debtor list
-- ---------------------------------------------------------------------
alter table public.validation_responses enable row level security;
drop policy if exists validation_responses_read on public.validation_responses;
drop policy if exists validation_responses_admin_write on public.validation_responses;
create policy validation_responses_read on public.validation_responses
  for select to authenticated using (true);
create policy validation_responses_admin_write on public.validation_responses
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.validation_batches enable row level security;
drop policy if exists validation_batches_read on public.validation_batches;
drop policy if exists validation_batches_write on public.validation_batches;
create policy validation_batches_read on public.validation_batches
  for select to authenticated using (true);
create policy validation_batches_write on public.validation_batches
  for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

alter table public.validation_customers enable row level security;
drop policy if exists validation_customers_select on public.validation_customers;
drop policy if exists validation_customers_insert on public.validation_customers;
drop policy if exists validation_customers_update on public.validation_customers;
drop policy if exists validation_customers_delete on public.validation_customers;

create policy validation_customers_select on public.validation_customers
  for select to authenticated
  using (
    (select public.is_manager())
    or (officer_id is not null and officer_id = (select public.current_officer_id()))
  );
create policy validation_customers_insert on public.validation_customers
  for insert to authenticated with check ((select public.is_manager()));
create policy validation_customers_update on public.validation_customers
  for update to authenticated
  using (
    (select public.is_manager())
    or (officer_id is not null and officer_id = (select public.current_officer_id()))
  )
  with check (
    (select public.is_manager())
    or (officer_id is not null and officer_id = (select public.current_officer_id()))
  );
create policy validation_customers_delete on public.validation_customers
  for delete to authenticated using ((select public.is_manager()));

alter table public.validation_call_log enable row level security;
drop policy if exists validation_call_log_select on public.validation_call_log;
drop policy if exists validation_call_log_insert on public.validation_call_log;
drop policy if exists validation_call_log_update on public.validation_call_log;
drop policy if exists validation_call_log_delete on public.validation_call_log;

create policy validation_call_log_select on public.validation_call_log
  for select to authenticated
  using (
    (select public.is_manager())
    or exists (
      select 1 from public.validation_customers c
      where c.id = validation_id and c.officer_id = (select public.current_officer_id())
    )
  );
create policy validation_call_log_insert on public.validation_call_log
  for insert to authenticated
  with check (
    (select public.is_manager())
    or exists (
      select 1 from public.validation_customers c
      where c.id = validation_id and c.officer_id = (select public.current_officer_id())
    )
  );
create policy validation_call_log_update on public.validation_call_log
  for update to authenticated
  using ((select public.is_manager()) or created_by = (select auth.uid()))
  with check ((select public.is_manager()) or created_by = (select auth.uid()));
create policy validation_call_log_delete on public.validation_call_log
  for delete to authenticated using ((select public.is_manager()));

-- ---------------------------------------------------------------------
-- Realtime, so a second officer sees a call appear
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.validation_customers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.validation_call_log;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.validation_batches;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Telling officers a list has landed
-- ---------------------------------------------------------------------
create or replace function public.notify_validation_assignment(p_batch uuid, p_officers uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_sent integer := 0;
  r record;
  v_name text;
begin
  if not public.is_manager() then
    raise exception 'Only supervisors or administrators can assign a validation list' using errcode = '42501';
  end if;
  select b.name into v_name from public.validation_batches b where b.id = p_batch;

  for r in
    select o.profile_id, count(*) as n
    from public.validation_customers c
    join public.officers o on o.id = c.officer_id
    where c.batch_id = p_batch
      and o.profile_id is not null
      and (p_officers is null or c.officer_id = any (p_officers))
    group by o.profile_id
  loop
    insert into public.notifications (user_id, ticket_id, type, message)
    values (r.profile_id, null, 'validation_assignment',
            format('%s customers to call for %s', r.n, coalesce(v_name, 'a validation exercise')));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- ---------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------
create or replace function public.validations_filtered(
  p_batch uuid default null,
  p_officer uuid default null,
  p_provider text default null,
  p_customer_type text default null,
  p_community text default null,
  p_region text default null,
  p_response text default null,
  p_outcome text default null
)
returns setof public.validation_customers
language sql stable security invoker set search_path = public as $$
  select c.*
  from public.validation_customers c
  left join public.validation_responses r on r.name = c.response
  where (p_batch is null or c.batch_id = p_batch)
    and (p_officer is null or c.officer_id = p_officer)
    and (p_provider is null or c.provider = p_provider)
    and (p_customer_type is null or c.customer_type = p_customer_type)
    and (p_community is null or c.community = p_community)
    and (p_region is null or c.region = p_region)
    and (p_response is null or c.response = p_response)
    and (p_outcome is null or r.outcome = p_outcome)
$$;

/** Calls made inside a date window, for the dashboard and monthly report */
create or replace function public.filtered_validation_calls(
  p_from timestamptz default null, p_to timestamptz default null,
  p_region text default null, p_officer uuid default null, p_batch uuid default null
)
returns table (
  id uuid, validation_id uuid, batch_id uuid, officer_id uuid, region text,
  called_at timestamptz, response text, outcome text, amount_collected numeric
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.validation_id, l.batch_id, l.officer_id, c.region,
         l.called_at, l.response, coalesce(r.outcome, 'other'), coalesce(l.amount_collected, 0)
  from public.validation_call_log l
  join public.validation_customers c on c.id = l.validation_id
  left join public.validation_responses r on r.name = l.response
  where (p_from is null or l.called_at >= p_from)
    and (p_to is null or l.called_at < p_to)
    and (p_region is null or c.region = p_region)
    and (p_officer is null or l.officer_id = p_officer)
    and (p_batch is null or l.batch_id = p_batch)
$$;

/** The headline numbers for one exercise */
create or replace function public.validation_summary(
  p_batch uuid default null,
  p_officer uuid default null,
  p_provider text default null,
  p_customer_type text default null,
  p_community text default null,
  p_region text default null,
  p_response text default null,
  p_outcome text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select c.*, coalesce(r.outcome, 'other') as outcome
    from public.validations_filtered(p_batch, p_officer, p_provider, p_customer_type,
                                     p_community, p_region, p_response, p_outcome) c
    left join public.validation_responses r on r.name = c.response
  )
  select jsonb_build_object(
    'customers', count(*),
    'answered', count(*) filter (where response is not null),
    'pending', count(*) filter (where response is null),
    'active', count(*) filter (where outcome = 'active'),
    'inactive', count(*) filter (where outcome = 'inactive'),
    'unreachable', count(*) filter (where outcome = 'unreachable'),
    'other', count(*) filter (where response is not null and outcome = 'other'),
    'calls', coalesce(sum(call_attempts), 0),
    'collected', coalesce(sum(amount_collected), 0),
    'customers_paid', count(*) filter (where coalesce(amount_collected, 0) > 0),
    'outstanding', coalesce(sum(outstanding_balance), 0),
    'answer_rate', coalesce(round(100.0 * count(*) filter (where response is not null)
                                  / nullif(count(*), 0), 1), 0)
  )
  from f
$$;

/** Every response and how many gave it — the heart of the exercise */
create or replace function public.report_validation_responses(
  p_batch uuid default null, p_officer uuid default null, p_region text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.response), '[]'::jsonb)
  from (
    select c.response,
           coalesce(r.outcome, 'other') as outcome,
           coalesce(r.sort_order, 9999) as sort_order,
           count(*) as customers,
           coalesce(sum(c.amount_collected), 0) as collected,
           coalesce(sum(c.outstanding_balance), 0) as outstanding
      from public.validations_filtered(p_batch, p_officer, null, null, null, p_region, null, null) c
      left join public.validation_responses r on r.name = c.response
     where c.response is not null
     group by c.response, r.outcome, r.sort_order
  ) s
$$;

/** The same picture per region, for a management decision by area */
create or replace function public.report_validation_by_region(
  p_batch uuid default null, p_officer uuid default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.customers desc, s.region), '[]'::jsonb)
  from (
    select coalesce(c.region, 'Unspecified') as region,
           count(*) as customers,
           count(*) filter (where c.response is not null) as answered,
           count(*) filter (where r.outcome = 'active') as active,
           count(*) filter (where r.outcome = 'inactive') as inactive,
           count(*) filter (where r.outcome = 'unreachable') as unreachable,
           coalesce(sum(c.amount_collected), 0) as collected,
           coalesce(sum(c.outstanding_balance), 0) as outstanding,
           coalesce(round(100.0 * count(*) filter (where c.response is not null)
                          / nullif(count(*), 0), 1), 0) as answer_rate
      from public.validations_filtered(p_batch, p_officer, null, null, null, null, null, null) c
      left join public.validation_responses r on r.name = c.response
     group by coalesce(c.region, 'Unspecified')
  ) s
$$;

/** Who did the calling */
create or replace function public.report_validation_by_officer(
  p_batch uuid default null, p_region text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.customers desc, s.officer_name), '[]'::jsonb)
  from (
    select c.officer_id,
           coalesce(o.full_name, 'Unassigned') as officer_name,
           count(*) as customers,
           count(*) filter (where c.response is not null) as answered,
           count(*) filter (where c.response is null) as pending,
           coalesce(sum(c.call_attempts), 0) as calls,
           count(*) filter (where r.outcome = 'active') as active,
           count(*) filter (where r.outcome = 'inactive') as inactive,
           count(*) filter (where r.outcome = 'unreachable') as unreachable,
           coalesce(sum(c.amount_collected), 0) as collected,
           coalesce(round(100.0 * count(*) filter (where c.response is not null)
                          / nullif(count(*), 0), 1), 0) as answer_rate
      from public.validations_filtered(p_batch, null, null, null, null, p_region, null, null) c
      left join public.officers o on o.id = c.officer_id
      left join public.validation_responses r on r.name = c.response
     group by c.officer_id, o.full_name
  ) s
$$;

/** Every exercise with its progress, for the list screen */
create or replace function public.validation_batch_list()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
  from (
    select b.id, b.name, b.purpose, b.status, b.created_at,
           count(c.id) as customers,
           count(c.id) filter (where c.response is not null) as answered,
           count(c.id) filter (where r.outcome = 'active') as active,
           count(c.id) filter (where r.outcome = 'inactive') as inactive,
           count(c.id) filter (where r.outcome = 'unreachable') as unreachable,
           coalesce(sum(c.amount_collected), 0) as collected,
           coalesce(round(100.0 * count(c.id) filter (where c.response is not null)
                          / nullif(count(c.id), 0), 1), 0) as answer_rate
      from public.validation_batches b
      left join public.validation_customers c on c.batch_id = b.id
      left join public.validation_responses r on r.name = c.response
     group by b.id, b.name, b.purpose, b.status, b.created_at
  ) s
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke execute on function public.notify_validation_assignment(uuid, uuid[]) from public, anon;
revoke execute on function public.validations_filtered(uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.validation_summary(uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.report_validation_responses(uuid, uuid, text) from public, anon;
revoke execute on function public.report_validation_by_region(uuid, uuid) from public, anon;
revoke execute on function public.report_validation_by_officer(uuid, text) from public, anon;
revoke execute on function public.validation_batch_list() from public, anon;
revoke execute on function public.filtered_validation_calls(timestamptz, timestamptz, text, uuid, uuid) from public, anon;

grant execute on function public.notify_validation_assignment(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.validations_filtered(uuid, uuid, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.validation_summary(uuid, uuid, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.report_validation_responses(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.report_validation_by_region(uuid, uuid) to authenticated, service_role;
grant execute on function public.report_validation_by_officer(uuid, text) to authenticated, service_role;
grant execute on function public.validation_batch_list() to authenticated, service_role;
grant execute on function public.filtered_validation_calls(timestamptz, timestamptz, text, uuid, uuid) to authenticated, service_role;

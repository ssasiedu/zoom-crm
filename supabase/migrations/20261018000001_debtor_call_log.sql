-- =====================================================================
-- Debtor call log: one row per call, each able to carry a payment
--
-- A debtor row held a single feedback, amount and comment, so a second
-- call overwrote the first and a part payment replaced the one before
-- it. Neither the number of calls made nor the money actually collected
-- could be trusted, and there was no trace of how a balance was paid
-- down.
--
-- This adds debtor_call_log. Every call an officer records becomes its
-- own row. A trigger rolls the log back into the debtors table, so
-- debtors.feedback (the latest outcome), debtors.amount_collected (the
-- sum of every payment), debtors.call_attempts and debtors.contacted_at
-- stay correct and every existing report, export and policy keeps
-- working untouched.
-- =====================================================================

create table if not exists public.debtor_call_log (
  id uuid primary key default gen_random_uuid(),
  debtor_id uuid not null references public.debtors (id) on delete cascade,
  /* denormalised so reports can group by period without a second join */
  period_id uuid not null references public.debtor_periods (id) on delete cascade,
  /* the officer the work counts for; the debtor's officer at the time */
  officer_id uuid references public.officers (id) on delete set null,

  called_at timestamptz not null default now(),
  feedback text not null references public.debtor_feedback (name)
    on update cascade on delete restrict,
  amount_collected numeric(12, 2) check (amount_collected is null or amount_collected >= 0),
  /* how the money came in, and anything that identifies the transaction */
  payment_reference text,
  promised_amount numeric(12, 2) check (promised_amount is null or promised_amount >= 0),
  promised_date date,
  comment text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debtor_call_log_debtor_idx on public.debtor_call_log (debtor_id, called_at desc);
create index if not exists debtor_call_log_officer_idx on public.debtor_call_log (officer_id, called_at);
create index if not exists debtor_call_log_period_idx on public.debtor_call_log (period_id);
create index if not exists debtor_call_log_called_at_idx on public.debtor_call_log (called_at);
create index if not exists debtor_call_log_paid_idx on public.debtor_call_log (called_at)
  where amount_collected is not null and amount_collected > 0;

drop trigger if exists set_updated_at on public.debtor_call_log;
create trigger set_updated_at before update on public.debtor_call_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Stamp the period and officer from the debtor, and the author from the
-- session, so a caller cannot credit the work to someone else.
-- ---------------------------------------------------------------------
create or replace function public.debtor_call_log_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_debtor public.debtors;
begin
  select * into v_debtor from public.debtors d where d.id = new.debtor_id;
  if not found then
    raise exception 'That debtor record no longer exists';
  end if;

  new.period_id := v_debtor.period_id;
  new.officer_id := coalesce(v_debtor.officer_id, new.officer_id);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_uid, new.created_by);
    new.called_at := coalesce(new.called_at, now());
  end if;

  if new.called_at > now() + interval '5 minutes' then
    raise exception 'A call cannot be recorded in the future';
  end if;

  if coalesce(new.amount_collected, 0) > 0 and coalesce(btrim(new.feedback), '') = '' then
    raise exception 'Choose a feedback reason when recording an amount collected';
  end if;

  return new;
end $$;

drop trigger if exists debtor_call_log_before_write on public.debtor_call_log;
create trigger debtor_call_log_before_write before insert or update on public.debtor_call_log
  for each row execute function public.debtor_call_log_before_write();

-- ---------------------------------------------------------------------
-- Roll the log up into the debtor row: latest outcome, total collected,
-- number of calls. This is what keeps the existing reports correct.
-- ---------------------------------------------------------------------
create or replace function public.debtor_rollup(p_debtor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_latest public.debtor_call_log;
begin
  /* SECURITY DEFINER changes the role but not auth.uid(), so without this
     flag the officer guard on debtors would block the rollup's own write.
     Transaction-local, and cleared again below. */
  perform set_config('app.debtor_rollup', 'on', true);

  select * into v_latest
    from public.debtor_call_log l
   where l.debtor_id = p_debtor
   order by l.called_at desc, l.created_at desc
   limit 1;

  if not found then
    update public.debtors
       set feedback = null, amount_collected = null, comment = null,
           promised_amount = null, promised_date = null,
           call_attempts = 0, contacted_at = null, contacted_by = null
     where id = p_debtor;
    perform set_config('app.debtor_rollup', 'off', true);
    return;
  end if;

  update public.debtors d
     set feedback = v_latest.feedback,
         comment = v_latest.comment,
         promised_amount = v_latest.promised_amount,
         promised_date = v_latest.promised_date,
         contacted_at = v_latest.called_at,
         contacted_by = v_latest.created_by,
         amount_collected = (
           select nullif(sum(coalesce(l.amount_collected, 0)), 0)
             from public.debtor_call_log l where l.debtor_id = p_debtor),
         call_attempts = (
           select count(*) from public.debtor_call_log l where l.debtor_id = p_debtor)
   where d.id = p_debtor;

  perform set_config('app.debtor_rollup', 'off', true);
end $$;

create or replace function public.debtor_call_log_after_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.debtor_rollup(coalesce(new.debtor_id, old.debtor_id));
  if tg_op = 'UPDATE' and new.debtor_id is distinct from old.debtor_id then
    perform public.debtor_rollup(old.debtor_id);
  end if;
  return null;
end $$;

drop trigger if exists debtor_call_log_after_write on public.debtor_call_log;
create trigger debtor_call_log_after_write
  after insert or update or delete on public.debtor_call_log
  for each row execute function public.debtor_call_log_after_write();

-- ---------------------------------------------------------------------
-- Officers now record a call by adding a log entry, so the direct edit
-- of those fields on the debtor row is no longer theirs to make. The
-- rollup runs as the definer, so it is not blocked by this.
-- ---------------------------------------------------------------------
create or replace function public.debtors_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.auth_role();
begin
  /* the rollup above, writing the summary columns back */
  if coalesce(current_setting('app.debtor_rollup', true), 'off') = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_uid, new.created_by);
    if v_uid is not null and not public.is_manager() then
      raise exception 'Only supervisors or administrators can assign debtor lists'
        using errcode = '42501';
    end if;
  else
    -- An officer may not change anything on the row directly; their work
    -- goes through debtor_call_log and comes back through the rollup.
    if v_uid is not null and v_role = 'dm_officer' then
      raise exception 'Record your call under Call history so every call is kept'
        using errcode = '42501';
    end if;
    if v_uid is not null and not public.is_manager() and v_role is not null then
      raise exception 'Only supervisors or administrators can change a debtor record'
        using errcode = '42501';
    end if;
  end if;

  if new.contact_number is not null then
    new.contact_number := public.normalize_gh_phone(new.contact_number);
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(v_uid, new.updated_by);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Move the single result already on each debtor row into the log, so no
-- recorded work is lost and the counts line up from day one.
-- ---------------------------------------------------------------------
insert into public.debtor_call_log
  (debtor_id, period_id, officer_id, called_at, feedback, amount_collected,
   promised_amount, promised_date, comment, created_by, created_at)
select d.id, d.period_id, d.officer_id,
       coalesce(d.contacted_at, d.updated_at, now()),
       d.feedback, d.amount_collected, d.promised_amount, d.promised_date,
       d.comment, d.contacted_by, coalesce(d.contacted_at, d.updated_at, now())
  from public.debtors d
 where d.feedback is not null
   and not exists (select 1 from public.debtor_call_log l where l.debtor_id = d.id);

-- Re-derive the summary columns from the log for every debtor.
do $$
declare r record;
begin
  for r in select distinct debtor_id from public.debtor_call_log loop
    perform public.debtor_rollup(r.debtor_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS: you can see a call on a debtor you can see; officers may add
-- calls on their own rows; only the author or a manager may correct one.
-- ---------------------------------------------------------------------
alter table public.debtor_call_log enable row level security;

drop policy if exists debtor_call_log_select on public.debtor_call_log;
drop policy if exists debtor_call_log_insert on public.debtor_call_log;
drop policy if exists debtor_call_log_update on public.debtor_call_log;
drop policy if exists debtor_call_log_delete on public.debtor_call_log;

create policy debtor_call_log_select on public.debtor_call_log
  for select to authenticated
  using (exists (select 1 from public.debtors d where d.id = debtor_id));

create policy debtor_call_log_insert on public.debtor_call_log
  for insert to authenticated
  with check (
    (select public.is_manager())
    or exists (
      select 1 from public.debtors d
       where d.id = debtor_id
         and d.officer_id is not null
         and d.officer_id = (select public.current_officer_id()))
  );

create policy debtor_call_log_update on public.debtor_call_log
  for update to authenticated
  using ((select public.is_manager()) or created_by = (select auth.uid()))
  with check ((select public.is_manager()) or created_by = (select auth.uid()));

create policy debtor_call_log_delete on public.debtor_call_log
  for delete to authenticated
  using ((select public.is_manager()) or created_by = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'debtor_call_log'
  ) then
    alter publication supabase_realtime add table public.debtor_call_log;
  end if;
end $$;

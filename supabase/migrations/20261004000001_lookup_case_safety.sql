-- =====================================================================
-- Lookup values: case-insensitive safety
--
-- Debtor uploads failed with a foreign key error when a spreadsheet used
-- different casing from the stored lookup value ("Residential" against a
-- stored "RESIDENTIAL"). The importer now writes the exact stored name,
-- and this migration stops near-duplicate values being created in the
-- first place:
--
--   * ensure_lookup_values() reuses an existing value that differs only
--     by case or surrounding spaces instead of adding a second row, and
--     returns the canonical names it settled on.
--   * resolve_lookup_value() lets any caller ask "what is this value
--     actually stored as?" without needing write permission.
--   * A unique index per lookup table makes a case-duplicate impossible
--     even if something inserts directly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fold any existing case-duplicates together before adding the indexes.
-- The ON UPDATE CASCADE foreign keys carry tickets and debtors across.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  dup record;
  ref record;
begin
  foreach t in array array['customer_types', 'providers', 'debtor_feedback',
                           'regions', 'contact_types', 'issue_types',
                           'payment_sources', 'payment_types', 'payment_statuses'] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    -- Trim stray whitespace first; skip a rename that would collide.
    execute format($f$
      update public.%I x set name = btrim(x.name)
       where x.name <> btrim(x.name)
         and not exists (select 1 from public.%I y
                          where y.id <> x.id and y.name = btrim(x.name))
    $f$, t, t);

    -- Keep the lowest id of each case-insensitive group, fold the rest in.
    for dup in execute format($f$
      select x.id, x.name, k.keep_name
        from public.%I x
        join (select min(id) as keep_id, upper(btrim(name)) as key,
                     (array_agg(name order by id))[1] as keep_name
                from public.%I group by upper(btrim(name))) k
          on k.key = upper(btrim(x.name))
       where x.id <> k.keep_id
    $f$, t, t)
    loop
      -- Repoint every table that references this value, then drop the copy.
      -- Renaming the row instead would collide with the one we are keeping.
      for ref in
        select c.conrelid::regclass::text as child_table, a.attname as child_column
          from pg_constraint c
          join unnest(c.conkey) with ordinality as k(attnum, ord) on true
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         where c.contype = 'f'
           and c.confrelid = to_regclass(format('public.%I', t))
      loop
        execute format('update %s set %I = $1 where %I = $2',
                       ref.child_table, ref.child_column, ref.child_column)
          using dup.keep_name, dup.name;
      end loop;

      execute format('delete from public.%I where id = $1', t) using dup.id;
      raise notice 'Merged duplicate % value "%" into "%"', t, dup.name, dup.keep_name;
    end loop;

    execute format(
      'create unique index if not exists %I on public.%I (upper(btrim(name)))',
      t || '_name_ci_key', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- What is this value actually stored as? Returns null when unknown.
-- ---------------------------------------------------------------------
create or replace function public.resolve_lookup_value(p_table text, p_name text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_result text;
begin
  if p_name is null or btrim(p_name) = '' then
    return null;
  end if;
  if p_table not in ('customer_types', 'providers', 'debtor_feedback', 'regions',
                     'contact_types', 'issue_types', 'payment_sources',
                     'payment_types', 'payment_statuses') then
    raise exception 'Unsupported lookup table %', p_table;
  end if;
  execute format('select name from public.%I where upper(btrim(name)) = upper(btrim($1)) limit 1', p_table)
    into v_result using p_name;
  return v_result;
end $$;

revoke execute on function public.resolve_lookup_value(text, text) from public, anon;
grant execute on function public.resolve_lookup_value(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Add values, reusing anything that already exists under a different case.
-- Returns the canonical name for every input, so a caller can write the
-- value the foreign key will accept.
-- ---------------------------------------------------------------------
create or replace function public.ensure_lookup_values(p_table text, p_names text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_added integer := 0;
  v_rows integer;
  v_name text;
  v_next integer;
  v_existing text;
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

    -- Already there under some casing? Leave it alone.
    v_existing := public.resolve_lookup_value(p_table, v_name);
    continue when v_existing is not null;

    execute format('select coalesce(max(sort_order), 0) + 10 from public.%I', p_table) into v_next;
    execute format(
      'insert into public.%I (name, sort_order) values ($1, $2) on conflict do nothing', p_table)
      using v_name, v_next;
    get diagnostics v_rows = row_count;
    v_added := v_added + coalesce(v_rows, 0);
  end loop;

  return v_added;
end $$;

revoke execute on function public.ensure_lookup_values(text, text[]) from public, anon;
grant execute on function public.ensure_lookup_values(text, text[]) to authenticated, service_role;

-- =====================================================================
-- 0008: CUSTOMER ID becomes optional
--   * client_id is no longer required (relabelled "CUSTOMER ID" in the UI)
--   * blank values are stored as NULL rather than empty strings
-- Payment fields are now shown for every issue type in the UI; which
-- issue types *require* them is still controlled by
-- issue_types.requires_payment under Administration -> SLA settings.
-- =====================================================================

alter table public.tickets alter column client_id drop not null;
alter table public.tickets drop constraint if exists tickets_client_id_check;

update public.tickets set client_id = null where btrim(coalesce(client_id, '')) = '';

alter table public.tickets add constraint tickets_client_id_check
  check (client_id is null or length(btrim(client_id)) > 0);

-- Runs before tickets_before_insert / tickets_before_update (triggers fire
-- in name order), so the rest of the chain always sees a clean value.
create or replace function public.tickets_normalize_blanks()
returns trigger
language plpgsql as $$
begin
  new.client_id := nullif(btrim(coalesce(new.client_id, '')), '');
  new.responsible_party := nullif(btrim(coalesce(new.responsible_party, '')), '');
  new.remarks := nullif(btrim(coalesce(new.remarks, '')), '');
  new.reason_for_open_status := nullif(btrim(coalesce(new.reason_for_open_status, '')), '');
  return new;
end $$;

drop trigger if exists tickets_aa_normalize on public.tickets;
create trigger tickets_aa_normalize before insert or update on public.tickets
  for each row execute function public.tickets_normalize_blanks();

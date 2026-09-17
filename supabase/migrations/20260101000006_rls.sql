-- =====================================================================
-- 0006: Row Level Security
--   admin       : everything
--   supervisor  : all tickets (read, assign, update, close, reopen)
--   agent       : create tickets; read/update (assign) tickets they created
--   dm_officer  : read/update only tickets assigned to their officer record
-- Function calls are wrapped in (select ...) so Postgres caches them per
-- statement instead of evaluating per row.
-- =====================================================================

-- ---------- Lookup tables ----------
do $$
declare t text;
begin
  foreach t in array array['regions','contact_types','issue_types','payment_sources','payment_types','payment_statuses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_admin_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_admin_write" on public.%I for all to authenticated
                    using ((select public.is_admin())) with check ((select public.is_admin()))', t, t);
  end loop;
end $$;

-- ---------- Profiles ----------
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated using (true);
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using ((select public.is_admin()));

-- ---------- Officers ----------
alter table public.officers enable row level security;
drop policy if exists officers_read on public.officers;
drop policy if exists officers_admin_write on public.officers;
create policy officers_read on public.officers
  for select to authenticated using (true);
create policy officers_admin_write on public.officers
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Tickets ----------
alter table public.tickets enable row level security;
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

create policy tickets_select on public.tickets
  for select to authenticated
  using (
    (select public.is_manager())
    or ((select public.auth_role()) = 'agent' and created_by = (select auth.uid()))
    or (assigned_officer_id is not null and assigned_officer_id = (select public.current_officer_id()))
  );

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check ((select public.auth_role()) in ('admin', 'supervisor', 'agent'));

create policy tickets_update on public.tickets
  for update to authenticated
  using (
    (select public.is_manager())
    or ((select public.auth_role()) = 'agent' and created_by = (select auth.uid()))
    or ((select public.auth_role()) = 'dm_officer'
        and assigned_officer_id = (select public.current_officer_id()))
  )
  with check (
    (select public.is_manager())
    or ((select public.auth_role()) = 'agent' and created_by = (select auth.uid()))
    or ((select public.auth_role()) = 'dm_officer'
        and assigned_officer_id = (select public.current_officer_id()))
  );

create policy tickets_delete on public.tickets
  for delete to authenticated using ((select public.is_admin()));

-- ---------- Activity (written only by triggers) ----------
alter table public.ticket_activity enable row level security;
drop policy if exists ticket_activity_read on public.ticket_activity;
create policy ticket_activity_read on public.ticket_activity
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_activity.ticket_id));

-- ---------- Comments ----------
alter table public.ticket_comments enable row level security;
drop policy if exists ticket_comments_read on public.ticket_comments;
drop policy if exists ticket_comments_insert on public.ticket_comments;
drop policy if exists ticket_comments_delete on public.ticket_comments;
create policy ticket_comments_read on public.ticket_comments
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id));
create policy ticket_comments_insert on public.ticket_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id)
  );
create policy ticket_comments_delete on public.ticket_comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- ---------- Attachments ----------
alter table public.ticket_attachments enable row level security;
drop policy if exists ticket_attachments_read on public.ticket_attachments;
drop policy if exists ticket_attachments_insert on public.ticket_attachments;
drop policy if exists ticket_attachments_delete on public.ticket_attachments;
create policy ticket_attachments_read on public.ticket_attachments
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_attachments.ticket_id));
create policy ticket_attachments_insert on public.ticket_attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (select 1 from public.tickets t where t.id = ticket_attachments.ticket_id)
  );
create policy ticket_attachments_delete on public.ticket_attachments
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select public.is_manager()));

-- ---------- Notifications ----------
alter table public.notifications enable row level security;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- Saved views ----------
alter table public.saved_views enable row level security;
drop policy if exists saved_views_own on public.saved_views;
create policy saved_views_own on public.saved_views
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Anonymous visitors get nothing
revoke all on all tables in schema public from anon;
grant select on public.tickets_view to authenticated;

-- =====================================================================
-- 0007: Storage bucket, storage policies and Realtime publication
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments', 'ticket-attachments', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf',
        'text/plain', 'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword', 'application/vnd.ms-excel']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object paths are "<ticket_id>/<uuid>-<file name>". Access follows ticket RLS.
drop policy if exists "ticket attachments read" on storage.objects;
drop policy if exists "ticket attachments upload" on storage.objects;
drop policy if exists "ticket attachments delete" on storage.objects;

create policy "ticket attachments read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (select 1 from public.tickets t where t.id::text = (storage.foldername(name))[1])
  );

create policy "ticket attachments upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and exists (select 1 from public.tickets t where t.id::text = (storage.foldername(name))[1])
  );

create policy "ticket attachments delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (owner = (select auth.uid()) or (select public.is_manager()))
  );

-- Realtime
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['tickets', 'notifications', 'ticket_comments', 'ticket_attachments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

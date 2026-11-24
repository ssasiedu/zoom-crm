-- =====================================================================
-- 0009: Application settings + branding (logo, name, colours)
--   app_settings is a small key/value store. Rows flagged is_secret
--   (API keys) are readable by admins only; edge functions read them
--   with the service role.
-- =====================================================================

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_secret boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.app_settings_touch()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before insert or update on public.app_settings
  for each row execute function public.app_settings_touch();

-- Defaults -------------------------------------------------------------
insert into public.app_settings (key, value, is_secret) values
  ('branding', jsonb_build_object(
      'app_name', 'Zoomlion CRM',
      'tagline', 'Service & Debt Management',
      'logo_url', null,
      'primary_color', '#14532d',
      'accent_color', '#e5a50a'
   ), false)
on conflict (key) do nothing;

insert into public.app_settings (key, value, is_secret) values
  ('sms', jsonb_build_object(
      'enabled', false,
      'provider', 'mnotify',
      'endpoint', 'https://api.mnotify.com/api/sms/quick',
      'api_key', '',
      'sender_id', 'Zoomlion',
      'auto_send', true,
      'is_schedule', false,
      'schedule_date', '',
      'daily_limit', 1000
   ), true)
on conflict (key) do nothing;

insert into public.app_settings (key, value, is_secret) values
  ('ai', jsonb_build_object(
      'enabled', false,
      'provider', 'anthropic',
      'api_key', '',
      'model', 'claude-3-5-haiku-latest',
      'max_similar', 8
   ), true)
on conflict (key) do nothing;

-- RLS ------------------------------------------------------------------
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
drop policy if exists app_settings_admin_write on public.app_settings;

-- Branding (not secret) is readable before sign-in so the login page can
-- show the company logo; API keys stay admin-only.
create policy app_settings_read on public.app_settings
  for select to anon, authenticated
  using (not is_secret or (select public.is_admin()));

grant select on public.app_settings to anon;

create policy app_settings_admin_write on public.app_settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Branding assets bucket (public: the logo is shown on the sign-in page)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "branding read" on storage.objects;
drop policy if exists "branding admin write" on storage.objects;
drop policy if exists "branding admin delete" on storage.objects;

create policy "branding read" on storage.objects
  for select using (bucket_id = 'branding');

create policy "branding admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and (select public.is_admin()));

create policy "branding admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and (select public.is_admin()));

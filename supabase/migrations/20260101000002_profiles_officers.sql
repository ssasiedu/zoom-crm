-- =====================================================================
-- 0002: Profiles, officers and role helper functions
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  role public.app_role not null default 'agent',
  region text references public.regions (name) on update cascade on delete set null,
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

create table if not exists public.officers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique check (length(btrim(full_name)) > 0),
  profile_id uuid unique references public.profiles (id) on delete set null,
  region text references public.regions (name) on update cascade on delete set null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists officers_region_idx on public.officers (region);

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.officers;
create trigger set_updated_at before update on public.officers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can be used inside RLS
-- policies without recursive policy evaluation).
-- ---------------------------------------------------------------------
create or replace function public.auth_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('admin', 'supervisor'), false)
$$;

create or replace function public.current_officer_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select o.id from public.officers o where o.profile_id = auth.uid() limit 1
$$;

-- ---------------------------------------------------------------------
-- Create a profile for every new auth user. New users are agents by
-- default; admins change roles from the Administration screen (or the
-- invite-user edge function sets it with the service role).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when a user changes it in Auth
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Non-admins may edit their own name/phone/avatar but never privileged
-- columns. Service-role calls (auth.uid() is null) are allowed.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.region is distinct from old.region
       or new.email is distinct from old.email then
      raise exception 'Only administrators can change role, region, email or active status'
        using errcode = '42501';
    end if;
  end if;
  if auth.uid() is not null and new.id = auth.uid() and old.role = 'admin'
     and (new.role <> 'admin' or not new.is_active) then
    raise exception 'You cannot remove your own administrator access' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

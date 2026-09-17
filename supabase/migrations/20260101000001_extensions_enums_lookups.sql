-- =====================================================================
-- 0001: Extensions, enums and lookup tables
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$ begin
  create type public.app_role as enum ('admin', 'supervisor', 'agent', 'dm_officer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('Open', 'In-Progress', 'Resolved', 'Closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_priority as enum ('Low', 'Medium', 'High', 'Urgent');
exception when duplicate_object then null; end $$;

-- Shared updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Lookup tables. Tickets reference lookup values by NAME with
-- ON UPDATE CASCADE, so renaming a value updates existing tickets.
-- ---------------------------------------------------------------------
create table if not exists public.regions (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_types (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.issue_types (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  sla_days integer not null default 3 check (sla_days between 0 and 365),
  requires_payment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_sources (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_types (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_statuses (
  id bigint generated always as identity primary key,
  name text not null unique check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['regions','contact_types','issue_types','payment_sources','payment_types','payment_statuses'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

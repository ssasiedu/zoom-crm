-- =====================================================================
-- 0003: Tickets and related tables
-- =====================================================================

-- Normalise Ghana phone numbers to local format (0XXXXXXXXX)
create or replace function public.normalize_gh_phone(p text)
returns text
language plpgsql immutable as $$
declare v text;
begin
  if p is null then return null; end if;
  v := regexp_replace(p, '[\s\-\(\)\.]', '', 'g');
  if v ~ '^\+233[0-9]{9}$' then
    return '0' || substr(v, 5);
  elsif v ~ '^233[0-9]{9}$' then
    return '0' || substr(v, 4);
  end if;
  return v;
end $$;

create sequence if not exists public.ticket_number_seq start 1 increment 1;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  date_opened timestamptz not null default now(),
  client_name text not null check (length(btrim(client_name)) > 0),
  client_id text not null check (length(btrim(client_id)) > 0),
  contact_number text not null check (contact_number ~ '^(0|\+233)[0-9]{9}$'),
  contact_type text not null references public.contact_types (name) on update cascade,
  community text not null check (length(btrim(community)) > 0),
  description text not null check (length(btrim(description)) > 0),
  issue_type text not null references public.issue_types (name) on update cascade,
  responsible_party text,
  due_date date not null,
  completion_date timestamptz,
  payment_amount numeric(12, 2) check (payment_amount is null or payment_amount >= 0),
  payment_source text references public.payment_sources (name) on update cascade,
  payment_type text references public.payment_types (name) on update cascade,
  payment_status text references public.payment_statuses (name) on update cascade,
  status public.ticket_status not null default 'Open',
  remarks text,
  region text not null references public.regions (name) on update cascade,
  assigned_officer_id uuid references public.officers (id) on delete set null,
  reason_for_open_status text,
  priority public.ticket_priority not null default 'Medium',
  assignment_note text,
  reopen_reason text,
  reopened_at timestamptz,
  reopen_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  assigned_at timestamptz,
  assigned_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint tickets_completion_required
    check (status not in ('Resolved', 'Closed') or completion_date is not null)
);

create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_region_idx on public.tickets (region);
create index if not exists tickets_issue_type_idx on public.tickets (issue_type);
create index if not exists tickets_contact_type_idx on public.tickets (contact_type);
create index if not exists tickets_officer_idx on public.tickets (assigned_officer_id);
create index if not exists tickets_date_opened_idx on public.tickets (date_opened desc);
create index if not exists tickets_due_date_idx on public.tickets (due_date);
create index if not exists tickets_status_due_idx on public.tickets (status, due_date);
create index if not exists tickets_officer_status_idx on public.tickets (assigned_officer_id, status);
create index if not exists tickets_created_by_idx on public.tickets (created_by);
create index if not exists tickets_client_id_lower_idx on public.tickets (lower(client_id));
create index if not exists tickets_contact_number_idx on public.tickets (contact_number);
create index if not exists tickets_client_name_trgm_idx on public.tickets using gin (client_name gin_trgm_ops);
create index if not exists tickets_community_trgm_idx on public.tickets using gin (community gin_trgm_ops);
create index if not exists tickets_number_trgm_idx on public.tickets using gin (ticket_number gin_trgm_ops);
create index if not exists tickets_client_id_trgm_idx on public.tickets using gin (client_id gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------
create table if not exists public.ticket_activity (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ticket_activity_ticket_idx on public.ticket_activity (ticket_id, created_at desc);
create index if not exists ticket_activity_created_idx on public.ticket_activity (created_at desc);
create index if not exists ticket_activity_actor_idx on public.ticket_activity (actor_id);
create index if not exists ticket_activity_action_idx on public.ticket_activity (action);

-- ---------------------------------------------------------------------
-- Internal comments
-- ---------------------------------------------------------------------
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

-- ---------------------------------------------------------------------
-- Attachment metadata (files live in storage bucket ticket-attachments)
-- ---------------------------------------------------------------------
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id, created_at);

-- ---------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ticket_id uuid references public.tickets (id) on delete cascade,
  type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------
-- Saved filter views on the All Tickets page
-- ---------------------------------------------------------------------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------
-- List view with officer name and overdue flag (RLS of the caller applies)
-- ---------------------------------------------------------------------
create or replace view public.tickets_view
with (security_invoker = true) as
select
  t.*,
  o.full_name as officer_name,
  o.region as officer_region,
  cp.full_name as created_by_name,
  (t.status in ('Open', 'In-Progress') and t.due_date < current_date) as is_overdue,
  (t.due_date - current_date) as days_to_due
from public.tickets t
left join public.officers o on o.id = t.assigned_officer_id
left join public.profiles cp on cp.id = t.created_by;

-- =====================================================================
-- 0004: Ticket business rules, audit trail and notifications
-- =====================================================================

-- Field-level validation shared by insert and update
create or replace function public.validate_ticket(t public.tickets)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_requires_payment boolean;
begin
  select it.requires_payment into v_requires_payment
  from public.issue_types it where it.name = t.issue_type;

  if coalesce(v_requires_payment, false) and (
       t.payment_amount is null or t.payment_source is null
       or t.payment_type is null or t.payment_status is null) then
    raise exception 'Payment, payment source, payment type and payment status are required for issue type %', t.issue_type;
  end if;

  if t.status in ('Resolved', 'Closed') then
    if t.completion_date is null then
      raise exception 'Completion date is required when a ticket is Resolved or Closed';
    end if;
    if coalesce(btrim(t.remarks), '') = '' then
      raise exception 'Remarks are required when a ticket is Resolved or Closed';
    end if;
  end if;

  if t.completion_date is not null and t.completion_date < t.date_opened - interval '1 minute' then
    raise exception 'Completion date cannot be earlier than the date opened';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- BEFORE INSERT
-- ---------------------------------------------------------------------
create or replace function public.tickets_before_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.auth_role();
  v_sla integer;
begin
  if v_uid is not null then
    if v_role is null then
      raise exception 'Your account is inactive or has no profile' using errcode = '42501';
    end if;
    if v_role = 'dm_officer' then
      raise exception 'DM officers cannot create tickets' using errcode = '42501';
    end if;
    new.created_by := v_uid;
    new.updated_by := v_uid;
    new.created_at := now();
    new.updated_at := now();
    if v_role <> 'admin' or new.date_opened is null then
      new.date_opened := now();
    end if;
    -- Only managers may override the SLA-based due date
    if v_role not in ('admin', 'supervisor') then
      new.due_date := null;
    end if;
    -- Tickets created from the app always start as Open
    new.status := 'Open';
    new.completion_date := null;
    new.resolved_at := null;
    new.closed_at := null;
    new.reopen_count := 0;
    new.reopened_at := null;
    new.reopen_reason := null;
  end if;

  new.date_opened := coalesce(new.date_opened, now());
  new.contact_number := public.normalize_gh_phone(new.contact_number);
  new.client_name := btrim(new.client_name);
  new.client_id := btrim(new.client_id);
  new.community := btrim(new.community);

  new.ticket_number := 'TKT-' || to_char(new.date_opened at time zone 'Africa/Accra', 'YYYY')
                       || '-' || lpad(nextval('public.ticket_number_seq')::text, 6, '0');

  if new.due_date is null then
    select it.sla_days into v_sla from public.issue_types it where it.name = new.issue_type;
    new.due_date := (new.date_opened at time zone 'Africa/Accra')::date + coalesce(v_sla, 3);
  end if;

  if new.assigned_officer_id is not null then
    if v_uid is not null then
      new.assigned_at := now();
      new.assigned_by := v_uid;
    else
      new.assigned_at := coalesce(new.assigned_at, new.date_opened);
    end if;
  else
    new.assigned_at := null;
    new.assigned_by := null;
  end if;

  if new.status in ('Resolved', 'Closed') then
    new.completion_date := coalesce(new.completion_date, now());
    new.resolved_at := coalesce(new.resolved_at, new.completion_date);
  end if;
  if new.status = 'Closed' then
    new.closed_at := coalesce(new.closed_at, new.completion_date);
  end if;

  perform public.validate_ticket(new);
  return new;
end $$;

drop trigger if exists tickets_before_insert on public.tickets;
create trigger tickets_before_insert before insert on public.tickets
  for each row execute function public.tickets_before_insert();

-- ---------------------------------------------------------------------
-- BEFORE UPDATE: role field permissions, status transitions, timestamps
-- ---------------------------------------------------------------------
create or replace function public.tickets_before_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.auth_role();
  v_transition text;
begin
  -- Immutable columns
  new.id := old.id;
  new.ticket_number := old.ticket_number;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.updated_by := coalesce(v_uid, new.updated_by);

  if new.contact_number is distinct from old.contact_number then
    new.contact_number := public.normalize_gh_phone(new.contact_number);
  end if;

  -- ----- Role based field permissions -----
  if v_uid is not null then
    if v_role is null then
      raise exception 'Your account is inactive or has no profile' using errcode = '42501';
    end if;

    if new.date_opened is distinct from old.date_opened and v_role <> 'admin' then
      raise exception 'Only administrators can edit the date opened' using errcode = '42501';
    end if;

    if v_role = 'dm_officer' then
      if (new.client_name, new.client_id, new.contact_number, new.contact_type, new.community,
          new.description, new.issue_type, new.region, new.due_date, new.priority)
         is distinct from
         (old.client_name, old.client_id, old.contact_number, old.contact_type, old.community,
          old.description, old.issue_type, old.region, old.due_date, old.priority)
         or new.assigned_officer_id is distinct from old.assigned_officer_id then
        raise exception 'DM officers can only update resolution fields on their tickets' using errcode = '42501';
      end if;
      if new.status = 'Closed' and old.status <> 'Closed' then
        raise exception 'Only supervisors or administrators can close tickets' using errcode = '42501';
      end if;
      if new.status in ('Open', 'In-Progress') and new.due_date < current_date
         and coalesce(btrim(new.reason_for_open_status), '') = '' then
        raise exception 'Reason for open status is required because this ticket is overdue';
      end if;
    elsif v_role = 'agent' then
      if new.due_date is distinct from old.due_date
         and new.issue_type is not distinct from old.issue_type then
        raise exception 'Only supervisors or administrators can change the due date' using errcode = '42501';
      end if;
      if new.status is distinct from old.status then
        raise exception 'Agents cannot change ticket status' using errcode = '42501';
      end if;
      if (new.remarks, new.completion_date, new.reason_for_open_status)
         is distinct from (old.remarks, old.completion_date, old.reason_for_open_status) then
        raise exception 'Agents cannot change resolution fields' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Issue type changed without an explicit due date: re-apply the SLA
  if new.issue_type is distinct from old.issue_type and new.due_date is not distinct from old.due_date then
    new.due_date := (new.date_opened at time zone 'Africa/Accra')::date
                    + coalesce((select it.sla_days from public.issue_types it where it.name = new.issue_type), 3);
  end if;

  -- ----- Status transitions -----
  if new.status is distinct from old.status then
    v_transition := old.status::text || '>' || new.status::text;

    if v_transition in ('Open>In-Progress', 'In-Progress>Resolved', 'Resolved>Closed') then
      null; -- normal forward flow
    elsif old.status in ('Resolved', 'Closed') and new.status in ('Open', 'In-Progress') then
      if v_uid is not null and not public.is_manager() then
        raise exception 'Only supervisors or administrators can reopen tickets' using errcode = '42501';
      end if;
      if coalesce(btrim(new.reopen_reason), '') = '' then
        raise exception 'A reason is required to reopen a ticket';
      end if;
      new.completion_date := null;
      new.resolved_at := null;
      new.closed_at := null;
      new.reopened_at := now();
      new.reopen_count := old.reopen_count + 1;
    else
      raise exception 'Invalid status change from % to %. Tickets move Open → In-Progress → Resolved → Closed',
        old.status, new.status;
    end if;

    if new.status = 'Resolved' then
      new.completion_date := coalesce(new.completion_date, now());
      new.resolved_at := now();
    elsif new.status = 'Closed' then
      new.closed_at := now();
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
  end if;

  -- ----- Assignment timestamps -----
  if new.assigned_officer_id is distinct from old.assigned_officer_id then
    if new.assigned_officer_id is null then
      new.assigned_at := null;
      new.assigned_by := null;
    else
      new.assigned_at := now();
      new.assigned_by := coalesce(v_uid, new.assigned_by);
    end if;
  else
    new.assigned_at := old.assigned_at;
    new.assigned_by := old.assigned_by;
    -- an assignment note only makes sense with an assignment change
    new.assignment_note := old.assignment_note;
  end if;

  perform public.validate_ticket(new);
  return new;
end $$;

drop trigger if exists tickets_before_update on public.tickets;
create trigger tickets_before_update before update on public.tickets
  for each row execute function public.tickets_before_update();

-- ---------------------------------------------------------------------
-- Notification helper
-- ---------------------------------------------------------------------
create or replace function public.notify_officer(
  p_officer_id uuid, p_ticket public.tickets, p_type text, p_message text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_profile uuid;
begin
  if p_officer_id is null then return; end if;
  select o.profile_id into v_profile from public.officers o where o.id = p_officer_id;
  if v_profile is null then return; end if;
  insert into public.notifications (user_id, ticket_id, type, message)
  values (v_profile, p_ticket.id, p_type, p_message);
end $$;

-- ---------------------------------------------------------------------
-- AFTER INSERT/UPDATE: audit trail + notifications
-- ---------------------------------------------------------------------
create or replace function public.tickets_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_diff_old jsonb;
  v_diff_new jsonb;
  v_old_officer text;
  v_new_officer text;
  v_ignore text[] := array['updated_at', 'updated_by', 'assigned_at', 'assigned_by', 'resolved_at',
                           'closed_at', 'reopened_at', 'reopen_count', 'assignment_note'];
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'created', null, jsonb_build_object(
      'ticket_number', new.ticket_number, 'status', new.status, 'issue_type', new.issue_type,
      'region', new.region, 'client_name', new.client_name, 'priority', new.priority));

    if new.assigned_officer_id is not null then
      select full_name into v_new_officer from public.officers where id = new.assigned_officer_id;
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
      values (new.id, v_uid, 'assigned', null,
              jsonb_build_object('officer_id', new.assigned_officer_id, 'officer', v_new_officer),
              new.assignment_note);
      perform public.notify_officer(new.assigned_officer_id, new, 'assignment',
        format('Ticket %s (%s – %s) has been assigned to you', new.ticket_number, new.client_name, new.issue_type));
    end if;
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- Assignment change
  if new.assigned_officer_id is distinct from old.assigned_officer_id then
    select full_name into v_old_officer from public.officers where id = old.assigned_officer_id;
    select full_name into v_new_officer from public.officers where id = new.assigned_officer_id;
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
    values (new.id, v_uid,
            case when old.assigned_officer_id is null then 'assigned'
                 when new.assigned_officer_id is null then 'unassigned'
                 else 'reassigned' end,
            case when old.assigned_officer_id is null then null
                 else jsonb_build_object('officer_id', old.assigned_officer_id, 'officer', v_old_officer) end,
            case when new.assigned_officer_id is null then null
                 else jsonb_build_object('officer_id', new.assigned_officer_id, 'officer', v_new_officer) end,
            new.assignment_note);

    perform public.notify_officer(new.assigned_officer_id, new,
      case when old.assigned_officer_id is null then 'assignment' else 'reassignment' end,
      format('Ticket %s (%s – %s) has been assigned to you', new.ticket_number, new.client_name, new.issue_type));
    if old.assigned_officer_id is not null then
      perform public.notify_officer(old.assigned_officer_id, new, 'unassignment',
        format('Ticket %s has been reassigned to %s', new.ticket_number, coalesce(v_new_officer, 'nobody')));
    end if;
  end if;

  -- Status change
  if new.status is distinct from old.status then
    if old.status in ('Resolved', 'Closed') and new.status in ('Open', 'In-Progress') then
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, note)
      values (new.id, v_uid, 'reopened',
              jsonb_build_object('status', old.status),
              jsonb_build_object('status', new.status), new.reopen_reason);
      perform public.notify_officer(new.assigned_officer_id, new, 'reopened',
        format('Ticket %s was reopened: %s', new.ticket_number, new.reopen_reason));
    else
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
      values (new.id, v_uid, 'status_changed',
              jsonb_build_object('status', old.status),
              jsonb_build_object('status', new.status));
      if new.status = 'Resolved' and old.created_by is not null and old.created_by is distinct from v_uid then
        insert into public.notifications (user_id, ticket_id, type, message)
        values (old.created_by, new.id, 'resolved',
                format('Ticket %s (%s) was marked Resolved', new.ticket_number, new.client_name));
      end if;
    end if;
  end if;

  -- Any other field changes
  select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb),
         coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb)
    into v_diff_new, v_diff_old
  from jsonb_object_keys(v_new) as k
  where (v_new -> k) is distinct from (v_old -> k)
    and k <> all (v_ignore)
    and k not in ('assigned_officer_id', 'status', 'reopen_reason');

  if v_diff_new <> '{}'::jsonb then
    insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value)
    values (new.id, v_uid, 'updated', v_diff_old, v_diff_new);
  end if;

  return new;
end $$;

drop trigger if exists tickets_after_change on public.tickets;
create trigger tickets_after_change after insert or update on public.tickets
  for each row execute function public.tickets_after_change();

-- ---------------------------------------------------------------------
-- Comments and attachments also appear in the audit trail
-- ---------------------------------------------------------------------
create or replace function public.ticket_comment_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.tickets;
  v_author text;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  select full_name into v_author from public.profiles where id = new.author_id;
  insert into public.ticket_activity (ticket_id, actor_id, action, new_value)
  values (new.ticket_id, new.author_id, 'commented',
          jsonb_build_object('comment_id', new.id, 'excerpt', left(new.body, 140)));

  -- Tell the assigned officer when someone else comments
  if v_ticket.assigned_officer_id is not null
     and not exists (select 1 from public.officers o
                     where o.id = v_ticket.assigned_officer_id and o.profile_id = new.author_id) then
    perform public.notify_officer(v_ticket.assigned_officer_id, v_ticket, 'comment',
      format('%s commented on ticket %s', coalesce(v_author, 'Someone'), v_ticket.ticket_number));
  end if;
  return new;
end $$;

drop trigger if exists ticket_comment_after_insert on public.ticket_comments;
create trigger ticket_comment_after_insert after insert on public.ticket_comments
  for each row execute function public.ticket_comment_after_insert();

create or replace function public.ticket_attachment_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_activity (ticket_id, actor_id, action, new_value)
    values (new.ticket_id, coalesce(auth.uid(), new.uploaded_by), 'attachment_added',
            jsonb_build_object('file_name', new.file_name, 'size_bytes', new.size_bytes));
    return new;
  else
    if exists (select 1 from public.tickets where id = old.ticket_id) then
      insert into public.ticket_activity (ticket_id, actor_id, action, old_value)
      values (old.ticket_id, auth.uid(), 'attachment_removed',
              jsonb_build_object('file_name', old.file_name));
    end if;
    return old;
  end if;
end $$;

drop trigger if exists ticket_attachment_audit on public.ticket_attachments;
create trigger ticket_attachment_audit after insert or delete on public.ticket_attachments
  for each row execute function public.ticket_attachment_audit();

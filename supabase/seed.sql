-- =====================================================================
-- DM CRM seed data: lookup values, DM officers and ~150 sample tickets
-- Safe to re-run: lookups/officers use ON CONFLICT, tickets are only
-- generated when the tickets table is empty.
-- =====================================================================

insert into public.contact_types (name, sort_order) values
  ('IN-BOUND CALL', 1), ('OUTBOUND CALL', 2), ('WHATSAPP', 3), ('TEXT', 4), ('WALK IN', 5)
on conflict (name) do nothing;

insert into public.issue_types (name, sort_order, sla_days, requires_payment) values
  ('SERVICE REQUEST', 1, 5, false),
  ('DATA ISSUE', 2, 3, false),
  ('SERVICE DEFAULT', 3, 2, false),
  ('PAYMENT ISSUE', 4, 3, true),
  ('PAYMENT ASSIST', 5, 2, true),
  ('ENQUIRY', 6, 1, false),
  ('UNREFLECTED PAYMENTS', 7, 5, true)
on conflict (name) do nothing;

insert into public.payment_sources (name, sort_order) values
  ('New Business', 1), ('Existing Business', 2)
on conflict (name) do nothing;

insert into public.payment_types (name, sort_order) values
  ('Door to Door Collection', 1), ('Corporate Collection', 2), ('Janitorial', 3), ('Landscape', 4),
  ('Cesspit', 5), ('Water Supply', 6), ('Skip/Bin Sale', 7), ('One-off', 8),
  ('Corporate Registration', 9), ('Door to Door Registration', 10)
on conflict (name) do nothing;

insert into public.payment_statuses (name, sort_order) values
  ('Receivables', 1), ('Advance Payment', 2), ('New Business', 3)
on conflict (name) do nothing;

insert into public.regions (name, sort_order) values
  ('Ahafo', 1), ('Ashanti', 2), ('Bono', 3), ('Bono East', 4), ('Central', 5), ('Eastern', 6),
  ('Greater Accra', 7), ('North East', 8), ('Northern', 9), ('Oti', 10), ('Savannah', 11),
  ('Upper East', 12), ('Upper West', 13), ('Volta', 14), ('Western', 15), ('Western North', 16)
on conflict (name) do nothing;

insert into public.officers (full_name, region, is_active) values
  ('GLORIA', 'Greater Accra', true),
  ('JENNIFER TWUM-BARIMAH', 'Ashanti', true),
  ('REJOICE KLUTSE', 'Volta', true),
  ('VIVA', 'Central', true),
  ('ESTHER', 'Eastern', true),
  ('CHARITY', 'Northern', true)
on conflict (full_name) do nothing;

-- ---------------------------------------------------------------------
-- Sample tickets
-- ---------------------------------------------------------------------
do $$
declare
  v_first text[] := array['Kwame','Ama','Kofi','Akosua','Yaw','Abena','Kwabena','Efua','Kojo','Adwoa',
                          'Kwesi','Esi','Fiifi','Afia','Kwaku','Yaa','Selorm','Dzifa','Mawuli','Edem',
                          'Abdul','Fatima','Ibrahim','Amina','Nii','Naa','Ekow','Aba','Samuel','Grace',
                          'Emmanuel','Comfort','Isaac','Patience','Daniel','Mercy','Richard','Joyce'];
  v_last text[] := array['Mensah','Owusu','Boateng','Asante','Osei','Agyeman','Appiah','Addo','Tetteh','Quaye',
                         'Amoah','Darko','Ofori','Sarpong','Adjei','Danso','Abubakar','Iddrisu','Yakubu','Dery',
                         'Kpodo','Agbeko','Fosu','Lamptey','Ankrah','Nyarko','Frimpong','Gyamfi','Acheampong','Bawa',
                         'Kuffour','Amponsah','Tagoe','Nortey','Kumah','Seidu'];
  v_communities jsonb := '{
    "Ahafo": ["Goaso", "Bechem", "Duayaw Nkwanta", "Kenyasi", "Hwidiem"],
    "Ashanti": ["Adum", "Bantama", "Asokwa", "Suame", "Ejisu", "Obuasi", "Kwadaso", "Tafo", "Santasi"],
    "Bono": ["Sunyani", "Berekum", "Dormaa Ahenkro", "Wenchi", "Nsoatre"],
    "Bono East": ["Techiman", "Kintampo", "Nkoranza", "Atebubu", "Yeji"],
    "Central": ["Cape Coast", "Kasoa", "Winneba", "Mankessim", "Elmina", "Swedru"],
    "Eastern": ["Koforidua", "Nkawkaw", "Nsawam", "Akim Oda", "Somanya", "Suhum"],
    "Greater Accra": ["Madina", "Adenta", "Tema Community 1", "Dansoman", "Kaneshie", "Achimota", "Teshie", "Kasoa Road", "Spintex", "Ashaiman", "Dome", "Lapaz"],
    "North East": ["Nalerigu", "Walewale", "Gambaga", "Chereponi"],
    "Northern": ["Tamale Central", "Savelugu", "Yendi", "Kumbungu", "Tolon", "Sagnarigu"],
    "Oti": ["Dambai", "Nkwanta", "Kadjebi", "Jasikan"],
    "Savannah": ["Damongo", "Bole", "Salaga", "Buipe"],
    "Upper East": ["Bolgatanga", "Navrongo", "Bawku", "Zebilla"],
    "Upper West": ["Wa", "Lawra", "Tumu", "Jirapa"],
    "Volta": ["Ho", "Hohoe", "Keta", "Aflao", "Kpando", "Sogakope"],
    "Western": ["Takoradi", "Sekondi", "Tarkwa", "Axim", "Anaji", "Prestea"],
    "Western North": ["Sefwi Wiawso", "Bibiani", "Juaboso", "Enchi"]
  }'::jsonb;
  v_descriptions jsonb := '{
    "SERVICE REQUEST": ["Client requests an additional waste bin for the compound.", "Request to change collection day from Tuesday to Friday.", "Client wants to upgrade to weekly skip collection.", "Request for cesspit emptying service at residence."],
    "DATA ISSUE": ["Client name misspelt on account records.", "Wrong community captured on client profile.", "Duplicate account created for the same household.", "Client phone number on record is outdated."],
    "SERVICE DEFAULT": ["Refuse not collected for two consecutive weeks.", "Collection truck skipped the street on scheduled day.", "Bin returned damaged after collection.", "Janitorial team did not report to site."],
    "PAYMENT ISSUE": ["Client charged twice for monthly collection.", "Payment made via MoMo but receipt not issued.", "Client disputes outstanding balance on bill.", "Wrong amount deducted from client wallet."],
    "PAYMENT ASSIST": ["Client needs help setting up MoMo auto-debit.", "Client requests an installment plan for arrears.", "Client wants guidance on paying via bank transfer.", "Assist client to pay for skip bin purchase."],
    "ENQUIRY": ["Client asked about current collection tariffs.", "Enquiry on how to register a new business account.", "Client asked for nearest customer service office.", "Enquiry about landscape service packages."],
    "UNREFLECTED PAYMENTS": ["Client paid last month but account still shows arrears.", "Bank payment not reflecting after one week.", "MoMo payment reference not found in system.", "Corporate cheque payment not updated on statement."]
  }'::jsonb;
  v_resp text[] := array['Customer Service','Finance','Operations','Billing','IT / Data Team','Field Collections'];
  v_remarks text[] := array['Called client and resolved the issue; client confirmed satisfaction.',
                            'Account corrected and client notified via SMS.',
                            'Payment verified with finance and reflected on the account.',
                            'Field team dispatched; service restored.',
                            'Client guided through the process over the phone.',
                            'Receipt issued and shared on WhatsApp.'];
  v_reasons text[] := array['Awaiting confirmation from finance team.',
                            'Client unreachable after three call attempts.',
                            'Waiting for field team availability.',
                            'Pending bank statement reconciliation.',
                            'Escalated to operations; awaiting feedback.'];
  v_prefixes text[] := array['024','054','055','059','020','050','026','027','057','053'];
  v_regions text[];
  v_contacts text[];
  v_issues text[];
  v_sources text[];
  v_ptypes text[];
  v_pstatuses text[];
  v_officer_all uuid[];
  v_officer_region uuid;
  i integer;
  v_idx integer;
  v_region text;
  v_community text;
  v_issue text;
  v_sla integer;
  v_requires boolean;
  v_opened timestamptz;
  v_due date;
  v_age integer;
  v_r double precision;
  v_status public.ticket_status;
  v_completion timestamptz;
  v_closed timestamptz;
  v_officer uuid;
  v_priority public.ticket_priority;
  v_amount numeric(12,2);
  v_psource text;
  v_ptype text;
  v_pstatus text;
  v_reason text;
  v_remark text;
begin
  if exists (select 1 from public.tickets limit 1) then
    raise notice 'tickets already contain data - skipping sample ticket generation';
    return;
  end if;

  perform setseed(0.2026);

  select array_agg(name order by sort_order) into v_regions from public.regions;
  select array_agg(name order by sort_order) into v_contacts from public.contact_types;
  select array_agg(name order by sort_order) into v_issues from public.issue_types;
  select array_agg(name order by sort_order) into v_sources from public.payment_sources;
  select array_agg(name order by sort_order) into v_ptypes from public.payment_types;
  select array_agg(name order by sort_order) into v_pstatuses from public.payment_statuses;
  select array_agg(id order by full_name) into v_officer_all from public.officers where is_active;

  for i in 1..150 loop
    -- A pool of ~110 clients so some clients have repeat tickets
    v_idx := floor(random() * 110)::int;

    if v_idx % 3 = 0 then
      v_region := 'Greater Accra';
    elsif v_idx % 5 = 0 then
      v_region := 'Ashanti';
    else
      v_region := v_regions[1 + (v_idx % array_length(v_regions, 1))];
    end if;
    v_community := (v_communities -> v_region) ->> (v_idx % jsonb_array_length(v_communities -> v_region));

    v_issue := v_issues[1 + floor(random() * array_length(v_issues, 1))::int];
    select sla_days, requires_payment into v_sla, v_requires from public.issue_types where name = v_issue;

    v_opened := date_trunc('day', now() - make_interval(days => floor(random() * 180)::int))
                + make_interval(mins => 480 + floor(random() * 540)::int);
    if v_opened > now() then
      v_opened := now() - interval '30 minutes';
    end if;
    v_due := (v_opened at time zone 'Africa/Accra')::date + v_sla;
    v_age := current_date - (v_opened at time zone 'Africa/Accra')::date;

    v_r := random();
    if v_age > 21 then
      v_status := (case when v_r < 0.45 then 'Closed' when v_r < 0.82 then 'Resolved'
                       when v_r < 0.92 then 'In-Progress' else 'Open' end)::public.ticket_status;
    elsif v_age > 7 then
      v_status := (case when v_r < 0.20 then 'Closed' when v_r < 0.55 then 'Resolved'
                       when v_r < 0.80 then 'In-Progress' else 'Open' end)::public.ticket_status;
    else
      v_status := (case when v_r < 0.05 then 'Closed' when v_r < 0.25 then 'Resolved'
                       when v_r < 0.55 then 'In-Progress' else 'Open' end)::public.ticket_status;
    end if;

    v_completion := null;
    v_closed := null;
    v_remark := null;
    if v_status in ('Resolved', 'Closed') then
      v_completion := v_opened + make_interval(hours => 2 + floor(random() * greatest(v_sla, 1) * 24 * 1.6)::int);
      if v_completion > now() then v_completion := now() - interval '5 minutes'; end if;
      v_remark := v_remarks[1 + floor(random() * array_length(v_remarks, 1))::int];
      if v_status = 'Closed' then
        v_closed := least(v_completion + interval '1 day', now());
      end if;
    end if;

    -- Assignment: 90% assigned, preferring an officer from the same region
    v_officer := null;
    if random() < 0.9 or v_status <> 'Open' then
      select id into v_officer_region from public.officers where region = v_region and is_active limit 1;
      if v_officer_region is not null and random() < 0.75 then
        v_officer := v_officer_region;
      else
        v_officer := v_officer_all[1 + floor(random() * array_length(v_officer_all, 1))::int];
      end if;
    end if;

    v_r := random();
    v_priority := (case when v_r < 0.15 then 'Low' when v_r < 0.65 then 'Medium'
                       when v_r < 0.90 then 'High' else 'Urgent' end)::public.ticket_priority;

    v_amount := null; v_psource := null; v_ptype := null; v_pstatus := null;
    if v_requires or random() < 0.2 then
      v_amount := round((50 + random() * 2450)::numeric, 2);
      v_psource := v_sources[1 + floor(random() * array_length(v_sources, 1))::int];
      v_ptype := v_ptypes[1 + floor(random() * array_length(v_ptypes, 1))::int];
      v_pstatus := v_pstatuses[1 + floor(random() * array_length(v_pstatuses, 1))::int];
    end if;

    v_reason := null;
    if v_status in ('Open', 'In-Progress') and v_due < current_date then
      v_reason := v_reasons[1 + floor(random() * array_length(v_reasons, 1))::int];
    end if;

    insert into public.tickets (
      date_opened, client_name, client_id, contact_number, contact_type, community, description,
      issue_type, responsible_party, due_date, completion_date, payment_amount, payment_source,
      payment_type, payment_status, status, remarks, region, assigned_officer_id,
      reason_for_open_status, priority, created_at, updated_at, assigned_at, resolved_at, closed_at
    ) values (
      v_opened,
      v_first[1 + (v_idx % array_length(v_first, 1))] || ' ' || v_last[1 + ((v_idx * 7) % array_length(v_last, 1))],
      'CL' || lpad((100000 + v_idx * 37)::text, 6, '0'),
      v_prefixes[1 + (v_idx % array_length(v_prefixes, 1))] || lpad(((v_idx * 7919 + 1234567) % 10000000)::text, 7, '0'),
      v_contacts[1 + floor(random() * array_length(v_contacts, 1))::int],
      v_community,
      (v_descriptions -> v_issue) ->> floor(random() * jsonb_array_length(v_descriptions -> v_issue))::int,
      v_issue,
      case when random() < 0.6 then v_resp[1 + floor(random() * array_length(v_resp, 1))::int] end,
      v_due,
      v_completion,
      v_amount, v_psource, v_ptype, v_pstatus,
      v_status,
      v_remark,
      v_region,
      v_officer,
      v_reason,
      v_priority,
      v_opened,
      coalesce(v_closed, v_completion, v_opened),
      case when v_officer is not null then v_opened + interval '45 minutes' end,
      v_completion,
      v_closed
    );
  end loop;

  -- Backdate the generated audit entries to match each ticket's date
  update public.ticket_activity a
     set created_at = t.date_opened + case when a.action = 'assigned' then interval '45 minutes' else interval '0' end
    from public.tickets t
   where t.id = a.ticket_id;

  -- Add status history for tickets that moved on from Open
  insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, created_at)
  select t.id, null, 'status_changed', '{"status":"Open"}'::jsonb, '{"status":"In-Progress"}'::jsonb,
         t.date_opened + interval '2 hours'
  from public.tickets t where t.status <> 'Open';

  insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, created_at)
  select t.id, null, 'status_changed', '{"status":"In-Progress"}'::jsonb, '{"status":"Resolved"}'::jsonb,
         t.resolved_at
  from public.tickets t where t.status in ('Resolved', 'Closed');

  insert into public.ticket_activity (ticket_id, actor_id, action, old_value, new_value, created_at)
  select t.id, null, 'status_changed', '{"status":"Resolved"}'::jsonb, '{"status":"Closed"}'::jsonb,
         t.closed_at
  from public.tickets t where t.status = 'Closed';

  raise notice 'Generated % sample tickets', (select count(*) from public.tickets);
end $$;

-- ---------------------------------------------------------------------
-- Turnaround figures for the sample tickets.
--
-- The timing trigger fills these in as real tickets move through their
-- statuses. Sample tickets are inserted already finished, so derive the
-- first response from the backdated activity written above; without this
-- the waiting-time charts would be empty on a fresh install.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.tickets') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'tickets'
                      and column_name = 'first_response_at') then
    return;  -- turnaround migration not applied yet
  end if;

  update public.tickets t
     set first_response_at = coalesce(
           (select min(a.created_at) from public.ticket_activity a
             where a.ticket_id = t.id and a.action = 'status_changed'),
           t.resolved_at,
           t.completion_date)
   where t.first_response_at is null;

  update public.tickets t
     set response_minutes = public.minutes_between(t.date_opened, t.first_response_at),
         resolution_minutes = case
           when t.status in ('Resolved', 'Closed')
             then public.minutes_between(t.date_opened, coalesce(t.completion_date, t.resolved_at))
           else null end
   where t.response_minutes is null or t.resolution_minutes is null;
end $$;

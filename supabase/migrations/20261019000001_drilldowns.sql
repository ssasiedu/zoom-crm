-- =====================================================================
-- Drill-downs: the rows behind each total
--
-- The dashboard and the debtor page show sums. These functions return
-- the individual lines those sums are made of, so a figure can be
-- opened and checked rather than taken on trust.
--
-- SECURITY INVOKER throughout, so each person sees only the rows their
-- role allows and the totals always match what they can open.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Every payment behind "Total received": money recorded on tickets and
-- money collected from debtors, in one list.
--   p_source: 'ticket', 'debtor', or null for both
-- ---------------------------------------------------------------------
create or replace function public.report_payment_lines(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null,
  p_source text default null, p_limit integer default 1000
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with lines as (
    select 'Ticket' as source,
           f.ticket_number as reference,
           f.client_name as name,
           f.client_id as customer_id,
           f.contact_number,
           f.region,
           o.full_name as officer,
           f.date_opened as at,
           f.payment_amount as amount,
           concat_ws(' · ', f.issue_type, f.payment_type, f.payment_status) as detail
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
      left join public.officers o on o.id = f.assigned_officer_id
     where f.payment_amount is not null and f.payment_amount > 0
       and (p_source is null or p_source = 'ticket')
    union all
    select 'Debtor',
           coalesce(d.customer_id, '—'),
           d.customer_name,
           d.customer_id,
           d.contact_number,
           d.region,
           o.full_name,
           c.called_at,
           c.amount_collected,
           concat_ws(' · ', c.feedback, l.payment_reference)
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
      join public.debtors d on d.id = c.debtor_id
      join public.debtor_call_log l on l.id = c.id
      left join public.officers o on o.id = c.officer_id
     where c.amount_collected > 0
       and (p_source is null or p_source = 'debtor')
       /* a ticket-only filter cannot apply to a debtor payment */
       and p_issue_type is null
       and (p_contact_type is null or p_contact_type = 'OUTBOUND CALL')
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.at desc), '[]'::jsonb)
  from (select * from lines order by at desc limit greatest(coalesce(p_limit, 1000), 1)) s
$$;

-- ---------------------------------------------------------------------
-- The rows behind the debtor page's figures.
--   p_kind 'outstanding' : every account and what it still owes
--          'collected'   : every payment taken, newest first
--          'paid'        : one row per customer who has paid something
-- ---------------------------------------------------------------------
create or replace function public.debtor_lines(
  p_period uuid default null, p_officer uuid default null, p_provider text default null,
  p_customer_type text default null, p_community text default null, p_region text default null,
  p_feedback text default null, p_kind text default 'outstanding', p_limit integer default 2000
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with base as (
    select f.*, o.full_name as officer_name
      from public.debtors_filtered(p_period, p_officer, p_provider, p_customer_type,
                                   p_community, p_region, p_feedback) f
      left join public.officers o on o.id = f.officer_id
  ),
  rows as (
    select to_jsonb(x) as row, x.sort_at
    from (
      -- Accounts and what each still owes
      select b.customer_id, b.customer_name, b.customer_type, b.provider, b.community,
             b.region, b.contact_number, b.officer_name as officer,
             b.outstanding_balance as outstanding,
             coalesce(b.amount_collected, 0) as collected,
             b.outstanding_balance - coalesce(b.amount_collected, 0) as still_owing,
             b.work_status, b.feedback, b.call_attempts as calls,
             b.contacted_at as sort_at
        from base b
       where p_kind = 'outstanding'

      union all
      -- One row per customer who has paid something
      select b.customer_id, b.customer_name, b.customer_type, b.provider, b.community,
             b.region, b.contact_number, b.officer_name,
             b.outstanding_balance,
             coalesce(b.amount_collected, 0),
             b.outstanding_balance - coalesce(b.amount_collected, 0),
             b.work_status, b.feedback, b.call_attempts,
             b.contacted_at
        from base b
       where p_kind = 'paid' and coalesce(b.amount_collected, 0) > 0
    ) x
    where p_kind in ('outstanding', 'paid')

    union all
    -- Every individual payment
    select to_jsonb(y), y.sort_at
    from (
      select b.customer_id, b.customer_name, b.customer_type, b.provider, b.community,
             b.region, b.contact_number, b.officer_name as officer,
             l.amount_collected as amount, l.payment_reference as reference,
             l.feedback, l.comment, l.called_at as paid_at,
             l.called_at as sort_at
        from base b
        join public.debtor_call_log l on l.debtor_id = b.id
       where p_kind = 'collected' and l.amount_collected is not null and l.amount_collected > 0
    ) y
  )
  select coalesce(jsonb_agg(row order by sort_at desc nulls last), '[]'::jsonb)
  from (select * from rows order by sort_at desc nulls last
         limit greatest(coalesce(p_limit, 2000), 1)) z
$$;

revoke execute on function public.report_payment_lines(timestamptz, timestamptz, text, uuid, text, text, text, integer) from public, anon;
revoke execute on function public.debtor_lines(uuid, uuid, text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.report_payment_lines(timestamptz, timestamptz, text, uuid, text, text, text, integer) to authenticated, service_role;
grant execute on function public.debtor_lines(uuid, uuid, text, text, text, text, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- The dashboard needs the count of debtors who actually paid, beside
-- the money, so the card can show both and be opened.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_combined(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with t as (
    select count(*) filter (where f.contact_type = 'OUTBOUND CALL') as ticket_outbound,
           count(*) filter (where f.contact_type like '%CALL%') as ticket_calls,
           coalesce(sum(f.payment_amount), 0) as ticket_payments,
           count(*) filter (where f.payment_amount > 0) as ticket_payment_count
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
  ),
  d as (
    select count(*) as debtor_calls,
           coalesce(sum(c.amount_collected), 0) as debtor_collected,
           count(*) filter (where c.amount_collected > 0) as debtor_payments_count,
           count(distinct c.debtor_id) filter (where c.amount_collected > 0) as debtors_paid
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
     where p_contact_type is null or p_contact_type in ('OUTBOUND CALL')
  )
  select jsonb_build_object(
    'ticket_outbound_calls', t.ticket_outbound,
    'ticket_calls', t.ticket_calls,
    'debtor_calls', d.debtor_calls,
    'outbound_calls_total', t.ticket_outbound + d.debtor_calls,
    'calls_total', t.ticket_calls + d.debtor_calls,
    'ticket_payments', t.ticket_payments,
    'ticket_payment_count', t.ticket_payment_count,
    'debtor_collected', d.debtor_collected,
    'payments_total', t.ticket_payments + d.debtor_collected,
    'debtor_payments_count', d.debtor_payments_count,
    'debtors_paid', d.debtors_paid
  )
  from t, d
$$;

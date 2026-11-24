-- =====================================================================
-- Make the call activity breakdown add up.
--
-- The dashboard showed in-bound, outbound and debtor calls under the
-- total, but a ticket can arrive by walk-in, WhatsApp or text, and those
-- had no card. Anyone adding the figures up came out short and had to
-- wonder which number was wrong.
--
-- ticket_other_contact is every ticket whose type of contact is not a
-- call in either direction, so:
--
--   call_activity_total = ticket_inbound_calls
--                       + ticket_outbound_calls
--                       + ticket_other_contact
--                       + debtor_calls
--
-- exactly. ticket_phone_change stays outside that sum on purpose: it is
-- an issue type, not a channel, so those tickets are already counted in
-- one of the three ticket figures. The card says so.
-- =====================================================================

create or replace function public.dashboard_combined(
  p_from timestamptz default null, p_to timestamptz default null, p_region text default null,
  p_officer uuid default null, p_issue_type text default null, p_contact_type text default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with phone as (select public.phone_change_issue_types() as types),
  t as (
    select count(*) as ticket_total,
           count(*) filter (where public.call_direction(f.contact_type) = 'outbound') as ticket_outbound,
           count(*) filter (where public.call_direction(f.contact_type) = 'inbound') as ticket_inbound,
           count(*) filter (where public.call_direction(f.contact_type) is null) as ticket_other,
           count(*) filter (where public.call_direction(f.contact_type) is not null) as ticket_calls,
           count(*) filter (where f.issue_type = any(p.types)) as ticket_phone_change,
           coalesce(sum(f.payment_amount), 0) as ticket_payments,
           count(*) filter (where f.payment_amount > 0) as ticket_payment_count
      from public.filtered_tickets(p_from, p_to, p_region, p_officer, p_issue_type, p_contact_type) f
      /* exactly one row, so this only carries the array into the filter */
      cross join phone p
  ),
  d as (
    select count(*) as debtor_calls,
           count(distinct c.debtor_id) as debtor_customers_called,
           coalesce(sum(c.amount_collected), 0) as debtor_collected,
           count(*) filter (where c.amount_collected > 0) as debtor_payments_count,
           count(distinct c.debtor_id) filter (where c.amount_collected > 0) as debtors_paid
      from public.filtered_debtor_calls(p_from, p_to, p_region, p_officer) c
      /* a channel filter is about tickets; debtor calls are all outbound */
     where p_contact_type is null or public.call_direction(p_contact_type) = 'outbound'
  )
  select jsonb_build_object(
    'ticket_total', t.ticket_total,
    'ticket_outbound_calls', t.ticket_outbound,
    'ticket_inbound_calls', t.ticket_inbound,
    'ticket_other_contact', t.ticket_other,
    'ticket_calls', t.ticket_calls,
    'ticket_phone_change', t.ticket_phone_change,
    'debtor_calls', d.debtor_calls,
    'debtor_customers_called', d.debtor_customers_called,
    'inbound_calls_total', t.ticket_inbound,
    'outbound_calls_total', t.ticket_outbound + d.debtor_calls,
    'calls_total', t.ticket_calls + d.debtor_calls,
    /* every ticket, however it arrived, plus every debtor call */
    'call_activity_total', t.ticket_total + d.debtor_calls,
    'ticket_payments', t.ticket_payments,
    'ticket_payment_count', t.ticket_payment_count,
    'debtor_collected', d.debtor_collected,
    'payments_total', t.ticket_payments + d.debtor_collected,
    'debtor_payments_count', d.debtor_payments_count,
    'debtors_paid', d.debtors_paid
  )
  from t, d
$$;

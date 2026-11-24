import { z } from 'zod';
import type { Lookups, Priority, Ticket, TicketInsert, TicketUpdate } from '@/types';
import { emptyToNull, fromInputDateTime, toInputDate, toInputDateTime } from '@/utils/format';
import { isValidGhanaPhone, toLocalPhone } from '@/utils/phone';
import { requiresPayment } from '@/utils/tickets';

const req = (label: string) => z.string().trim().min(1, `${label} is required`);

export function buildTicketSchema(lookups: Lookups | null) {
  return z
    .object({
      client_name: req('CLIENT').max(150),
      client_id: z.string().trim().max(60),
      contact_number: req('CONTACT NUMBER').refine(isValidGhanaPhone, {
        message: 'Use a Ghana number: 0XXXXXXXXX or +233XXXXXXXXX',
      }),
      contact_type: req('TYPE OF CONTACT'),
      community: req('COMMUNITY').max(120),
      region: req('Region'),
      issue_type: req('ISSUE TYPE'),
      description: req('DESCRIPTION').max(4000),
      priority: z.enum(['Low', 'Medium', 'High', 'Urgent']),
      responsible_party: z.string().max(150),
      due_date: z.string(),
      date_opened: z.string(),
      payment_amount: z.string(),
      payment_source: z.string(),
      payment_type: z.string(),
      payment_status: z.string(),
      assigned_officer_id: z.string(),
      assignment_note: z.string().max(500),
      remarks: z.string().max(4000),
    })
    .superRefine((v, ctx) => {
      if (v.payment_amount.trim() !== '') {
        const n = Number(v.payment_amount.replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) {
          ctx.addIssue({ code: 'custom', path: ['payment_amount'], message: 'Enter a valid amount (GH₵)' });
        }
      }
      if (requiresPayment(v.issue_type, lookups)) {
        (
          [
            ['payment_amount', 'PAYMENT'],
            ['payment_source', 'PAYMENT SOURCE'],
            ['payment_type', 'PAYMENT TYPE'],
            ['payment_status', 'PAYMENT STATUS'],
          ] as const
        ).forEach(([key, label]) => {
          if (!v[key].trim()) {
            ctx.addIssue({ code: 'custom', path: [key], message: `${label} is required for ${v.issue_type}` });
          }
        });
      }
      if (v.due_date && v.date_opened && v.due_date < v.date_opened.slice(0, 10)) {
        ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'DUE DATE cannot be before DATE OPENED' });
      }
    });
}

export type TicketFormValues = z.infer<ReturnType<typeof buildTicketSchema>>;

export const EMPTY_TICKET: TicketFormValues = {
  client_name: '',
  client_id: '',
  contact_number: '',
  contact_type: '',
  community: '',
  region: '',
  issue_type: '',
  description: '',
  priority: 'Medium',
  responsible_party: '',
  due_date: '',
  date_opened: '',
  payment_amount: '',
  payment_source: '',
  payment_type: '',
  payment_status: '',
  assigned_officer_id: '',
  assignment_note: '',
  remarks: '',
};

export function ticketToForm(t: Ticket): TicketFormValues {
  return {
    client_name: t.client_name,
    client_id: t.client_id ?? '',
    contact_number: toLocalPhone(t.contact_number),
    contact_type: t.contact_type,
    community: t.community,
    region: t.region,
    issue_type: t.issue_type,
    description: t.description,
    priority: t.priority,
    responsible_party: t.responsible_party ?? '',
    due_date: toInputDate(t.due_date),
    date_opened: toInputDateTime(t.date_opened),
    payment_amount: t.payment_amount === null ? '' : String(t.payment_amount),
    payment_source: t.payment_source ?? '',
    payment_type: t.payment_type ?? '',
    payment_status: t.payment_status ?? '',
    assigned_officer_id: t.assigned_officer_id ?? '',
    assignment_note: '',
    remarks: t.remarks ?? '',
  };
}

function money(v: string): number | null {
  const t = v.trim().replace(/,/g, '');
  return t === '' ? null : Math.round(Number(t) * 100) / 100;
}

function paymentFields(v: TicketFormValues, keep: boolean) {
  return {
    payment_amount: keep ? money(v.payment_amount) : null,
    payment_source: keep ? emptyToNull(v.payment_source) : null,
    payment_type: keep ? emptyToNull(v.payment_type) : null,
    payment_status: keep ? emptyToNull(v.payment_status) : null,
  };
}

export function formToInsert(
  v: TicketFormValues,
  opts: { isAdmin: boolean; lookups: Lookups | null; includeDueDate?: boolean },
): TicketInsert {
  const hasPayment = requiresPayment(v.issue_type, opts.lookups) || v.payment_amount.trim() !== '';
  return {
    client_name: v.client_name.trim(),
    client_id: emptyToNull(v.client_id),
    contact_number: toLocalPhone(v.contact_number),
    contact_type: v.contact_type,
    community: v.community.trim(),
    region: v.region,
    issue_type: v.issue_type,
    description: v.description.trim(),
    priority: v.priority as Priority,
    responsible_party: emptyToNull(v.responsible_party),
    due_date: opts.includeDueDate === false ? undefined : v.due_date || undefined,
    date_opened: opts.isAdmin && v.date_opened ? (fromInputDateTime(v.date_opened) ?? undefined) : undefined,
    ...paymentFields(v, hasPayment),
    assigned_officer_id: emptyToNull(v.assigned_officer_id),
    assignment_note: emptyToNull(v.assignment_note),
    remarks: emptyToNull(v.remarks),
  };
}

/** Only changed fields, so the audit trail stays clean and role checks pass */
export function formToUpdate(
  v: TicketFormValues,
  original: Ticket,
  opts: { isAdmin: boolean; lookups: Lookups | null },
): TicketUpdate {
  const full = formToInsert(v, opts);
  const patch: TicketUpdate = {};
  const keys: (keyof TicketUpdate)[] = [
    'client_name',
    'client_id',
    'contact_number',
    'contact_type',
    'community',
    'region',
    'issue_type',
    'description',
    'priority',
    'responsible_party',
    'due_date',
    'payment_amount',
    'payment_source',
    'payment_type',
    'payment_status',
  ];
  keys.forEach((k) => {
    const next = (full as Record<string, unknown>)[k] ?? null;
    const prev = (original as unknown as Record<string, unknown>)[k] ?? null;
    const norm = (x: unknown) => (k === 'payment_amount' && x !== null ? Number(x) : k === 'contact_number' ? toLocalPhone(String(x ?? '')) : x);
    if (norm(next) !== norm(prev)) (patch as Record<string, unknown>)[k] = next;
  });
  if (opts.isAdmin && full.date_opened && new Date(full.date_opened).getTime() !== new Date(original.date_opened).getTime()) {
    patch.date_opened = full.date_opened;
  }
  return patch;
}

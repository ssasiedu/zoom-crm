import { supabase } from '@/lib/supabase';
import type {
  ClientLookupResult,
  SortSpec,
  Ticket,
  TicketFilters,
  TicketInsert,
  TicketRow,
  TicketStatus,
  TicketUpdate,
} from '@/types';
import { exclusiveEndISO, startOfDayISO } from '@/utils/dateRange';
import { toLocalPhone } from '@/utils/phone';
import { AppError, toAppError, unwrap } from './errors';

export interface ListParams {
  filters?: TicketFilters;
  page?: number; // 0-based
  pageSize?: number;
  sort?: SortSpec[];
  /** restrict to the current officer's tickets (RLS already does this for officers) */
  officerId?: string | null;
}

export interface ListResult {
  rows: TicketRow[];
  count: number;
}

const SORTABLE = new Set([
  'ticket_number',
  'date_opened',
  'client_name',
  'client_id',
  'contact_number',
  'contact_type',
  'community',
  'issue_type',
  'responsible_party',
  'due_date',
  'completion_date',
  'payment_amount',
  'payment_source',
  'payment_type',
  'payment_status',
  'status',
  'region',
  'officer_name',
  'priority',
  'created_at',
  'updated_at',
]);

/** Strip characters that have meaning inside a PostgREST or() expression */
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { [k: string]: any }>(query: Q, f: TicketFilters = {}): Q {
  let q = query;
  if (f.search) {
    const s = sanitizeSearch(f.search);
    if (s) {
      const parts = [
        `ticket_number.ilike.*${s}*`,
        `client_name.ilike.*${s}*`,
        `client_id.ilike.*${s}*`,
        `community.ilike.*${s}*`,
        `contact_number.ilike.*${s}*`,
      ];
      const digits = s.replace(/[^\d+]/g, '');
      if (digits.length >= 4) {
        const local = toLocalPhone(digits);
        if (local !== s) parts.push(`contact_number.ilike.*${local}*`);
      }
      q = q.or(parts.join(','));
    }
  }
  if (f.status) {
    q = Array.isArray(f.status) ? q.in('status', f.status) : q.eq('status', f.status);
  }
  if (f.region) q = q.eq('region', f.region);
  if (f.issue_type) q = q.eq('issue_type', f.issue_type);
  if (f.contact_type) q = q.eq('contact_type', f.contact_type);
  if (f.payment_source) q = q.eq('payment_source', f.payment_source);
  if (f.payment_type) q = q.eq('payment_type', f.payment_type);
  if (f.payment_status) q = q.eq('payment_status', f.payment_status);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.community) q = q.ilike('community', `%${sanitizeSearch(f.community)}%`);
  if (f.officer === 'unassigned') q = q.is('assigned_officer_id', null);
  else if (f.officer) q = q.eq('assigned_officer_id', f.officer);
  if (f.from) q = q.gte('date_opened', startOfDayISO(f.from));
  if (f.to) q = q.lt('date_opened', exclusiveEndISO(f.to));
  if (f.dueFrom) q = q.gte('due_date', f.dueFrom);
  if (f.dueTo) q = q.lte('due_date', f.dueTo);
  if (f.overdue) q = q.eq('is_overdue', true);
  return q;
}

function applySort<Q extends { order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => Q }>(
  query: Q,
  sort: SortSpec[] | undefined,
): Q {
  let q = query;
  const valid = (sort ?? []).filter((s) => SORTABLE.has(s.id));
  if (valid.length === 0) {
    return q.order('date_opened', { ascending: false }).order('id', { ascending: true });
  }
  valid.forEach((s) => {
    q = q.order(s.id, { ascending: !s.desc, nullsFirst: false });
  });
  return q.order('id', { ascending: true });
}

export const ticketsService = {
  async list({ filters, page = 0, pageSize = 25, sort, officerId }: ListParams): Promise<ListResult> {
    let q = supabase.from('tickets_view').select('*', { count: 'exact' });
    q = applyFilters(q, filters);
    if (officerId) q = q.eq('assigned_officer_id', officerId);
    q = applySort(q, sort);
    const from = page * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) throw toAppError(error);
    return { rows: (data ?? []) as TicketRow[], count: count ?? 0 };
  },

  /** Fetch every row matching filters (for export), in batches */
  async listAll(filters: TicketFilters, sort?: SortSpec[], max = 20000): Promise<TicketRow[]> {
    const batch = 1000;
    const out: TicketRow[] = [];
    for (let from = 0; from < max; from += batch) {
      let q = supabase.from('tickets_view').select('*');
      q = applySort(applyFilters(q, filters), sort);
      const { data, error } = await q.range(from, from + batch - 1);
      if (error) throw toAppError(error);
      out.push(...((data ?? []) as TicketRow[]));
      if (!data || data.length < batch) break;
    }
    return out;
  },

  async get(id: string): Promise<TicketRow> {
    const row = unwrap(await supabase.from('tickets_view').select('*').eq('id', id).maybeSingle());
    if (!row) throw new AppError('Ticket not found, or you do not have access to it.', 'PGRST116');
    return row as TicketRow;
  },

  async getByNumber(ticketNumber: string): Promise<TicketRow | null> {
    return unwrap(
      await supabase.from('tickets_view').select('*').eq('ticket_number', ticketNumber.trim().toUpperCase()).maybeSingle(),
    ) as TicketRow | null;
  },

  /** Quick search for the command palette */
  async quickSearch(term: string, limit = 8): Promise<TicketRow[]> {
    if (!term.trim()) return [];
    let q = supabase
      .from('tickets_view')
      .select('*')
      .order('date_opened', { ascending: false })
      .limit(limit);
    q = applyFilters(q, { search: term });
    return unwrap(await q) as TicketRow[];
  },

  async create(values: TicketInsert): Promise<Ticket> {
    return unwrap(await supabase.from('tickets').insert(values).select().single()) as Ticket;
  },

  async createMany(values: TicketInsert[]): Promise<Ticket[]> {
    return unwrap(await supabase.from('tickets').insert(values).select()) as Ticket[];
  },

  async update(id: string, values: TicketUpdate): Promise<Ticket> {
    return unwrap(await supabase.from('tickets').update(values).eq('id', id).select().single()) as Ticket;
  },

  async remove(id: string): Promise<void> {
    unwrap(await supabase.from('tickets').delete().eq('id', id));
  },

  async assign(ids: string[], officerId: string | null, note?: string | null): Promise<number> {
    if (ids.length === 0) return 0;
    const data = unwrap(
      await supabase
        .from('tickets')
        .update({ assigned_officer_id: officerId, assignment_note: note?.trim() || null })
        .in('id', ids)
        .select('id'),
    ) as { id: string }[];
    if (data.length === 0) throw new AppError("No tickets were updated. You may not have access to them.", '42501');
    return data.length;
  },

  /**
   * Change status one ticket at a time so each row passes the transition
   * trigger independently; returns per-row failures.
   */
  async bulkStatus(
    ids: string[],
    status: TicketStatus,
    extra: TicketUpdate = {},
  ): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
    const failed: { id: string; message: string }[] = [];
    let ok = 0;
    for (const id of ids) {
      try {
        await ticketsService.update(id, { ...extra, status });
        ok += 1;
      } catch (err) {
        failed.push({ id, message: toAppError(err).message });
      }
    }
    return { ok, failed };
  },

  async clientLookup(clientId?: string, phone?: string): Promise<ClientLookupResult[]> {
    if (!clientId?.trim() && !phone?.trim()) return [];
    const data = unwrap(
      await supabase.rpc('client_lookup', {
        p_client_id: clientId?.trim() || null,
        p_phone: phone?.trim() || null,
      }),
    );
    return (data ?? []) as ClientLookupResult[];
  },

  async communitySuggestions(query: string, region?: string | null): Promise<string[]> {
    const data = unwrap(
      await supabase.rpc('community_suggestions', { p_query: query ?? '', p_region: region || null }),
    );
    return (data ?? []) as string[];
  },
};

import { supabase } from '@/lib/supabase';
import type {
  SortSpec,
  ValidationBatch,
  ValidationBatchRow,
  ValidationCall,
  ValidationCallInsert,
  ValidationCallUpdate,
  ValidationCustomer,
  ValidationCustomerInsert,
  ValidationCustomerUpdate,
  ValidationFilters,
  ValidationOfficerRow,
  ValidationRegionRow,
  ValidationResponseRow,
  ValidationSummary,
} from '@/types';
import { toNumber } from '@/utils/format';
import { toLocalPhone } from '@/utils/phone';
import { AppError, toAppError, unwrap } from './errors';

const SELECT = '*, officer:officers(full_name), batch:validation_batches(name)';

const CALL_SELECT =
  '*, author:profiles!validation_call_log_created_by_fkey(full_name), officer:officers(full_name)';

const SORTABLE = new Set([
  'customer_name',
  'customer_id',
  'customer_type',
  'provider',
  'community',
  'region',
  'contact_number',
  'outstanding_balance',
  'amount_collected',
  'response',
  'work_status',
  'contacted_at',
  'call_attempts',
  'updated_at',
]);

/** PostgREST treats these as syntax inside a filter, so keep them out of one */
function sanitize(value: string): string {
  return value.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { [k: string]: any }>(query: Q, f: ValidationFilters = {}): Q {
  let q = query;
  if (f.search) {
    const s = sanitize(f.search);
    if (s) {
      const parts = [`customer_name.ilike.*${s}*`, `customer_id.ilike.*${s}*`, `community.ilike.*${s}*`];
      const digits = s.replace(/[^\d+]/g, '');
      if (digits.length >= 4) parts.push(`contact_number.ilike.*${toLocalPhone(digits)}*`);
      q = q.or(parts.join(','));
    }
  }
  if (f.batch) q = q.eq('batch_id', f.batch);
  if (f.officer === 'unassigned') q = q.is('officer_id', null);
  else if (f.officer) q = q.eq('officer_id', f.officer);
  if (f.provider) q = q.eq('provider', f.provider);
  if (f.customerType) q = q.eq('customer_type', f.customerType);
  if (f.region) q = q.eq('region', f.region);
  if (f.community) q = q.ilike('community', `%${sanitize(f.community)}%`);
  if (f.response === 'none') q = q.is('response', null);
  else if (f.response) q = q.eq('response', f.response);
  if (f.workStatus) q = q.eq('work_status', f.workStatus);
  return q;
}

function applySort<Q extends { order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => Q }>(
  query: Q,
  sort?: SortSpec[],
): Q {
  let q = query;
  const valid = (sort ?? []).filter((s) => SORTABLE.has(s.id));
  if (valid.length === 0) {
    /* unanswered first: the point of the exercise is to finish the list */
    return q.order('work_status', { ascending: false }).order('customer_name', { ascending: true });
  }
  valid.forEach((s) => {
    q = q.order(s.id, { ascending: !s.desc, nullsFirst: false });
  });
  return q.order('id', { ascending: true });
}

const numeric = (c: ValidationCustomer): ValidationCustomer => ({
  ...c,
  outstanding_balance: toNumber(c.outstanding_balance),
  amount_collected: c.amount_collected === null ? null : toNumber(c.amount_collected),
  promised_amount: c.promised_amount === null ? null : toNumber(c.promised_amount),
  call_attempts: toNumber(c.call_attempts),
});

const toCall = (r: ValidationCall): ValidationCall => ({
  ...r,
  amount_collected: r.amount_collected === null ? null : toNumber(r.amount_collected),
  promised_amount: r.promised_amount === null ? null : toNumber(r.promised_amount),
});

function rpcParams(f: ValidationFilters) {
  return {
    p_batch: f.batch || null,
    p_officer: f.officer && f.officer !== 'unassigned' ? f.officer : null,
    p_provider: f.provider || null,
    p_customer_type: f.customerType || null,
    p_community: f.community || null,
    p_region: f.region || null,
    p_response: f.response && f.response !== 'none' ? f.response : null,
    p_outcome: f.outcome || null,
  };
}

export const validationsService = {
  /* ---------------- Exercises ---------------- */
  async batches(): Promise<ValidationBatch[]> {
    return (unwrap(
      await supabase.from('validation_batches').select('*').order('created_at', { ascending: false }),
    ) ?? []) as ValidationBatch[];
  },

  /** Every exercise with its progress, for the list screen */
  async batchList(): Promise<ValidationBatchRow[]> {
    const rows = (unwrap(await supabase.rpc('validation_batch_list')) ?? []) as ValidationBatchRow[];
    return rows.map((r) => ({
      ...r,
      customers: toNumber(r.customers),
      answered: toNumber(r.answered),
      active: toNumber(r.active),
      inactive: toNumber(r.inactive),
      unreachable: toNumber(r.unreachable),
      collected: toNumber(r.collected),
      answer_rate: toNumber(r.answer_rate),
    }));
  },

  async createBatch(name: string, purpose?: string | null): Promise<ValidationBatch> {
    return unwrap(
      await supabase
        .from('validation_batches')
        .insert({ name: name.trim(), purpose: purpose?.trim() || null })
        .select()
        .single(),
    ) as ValidationBatch;
  },

  async updateBatch(id: string, values: Partial<Pick<ValidationBatch, 'name' | 'purpose' | 'status'>>) {
    return unwrap(
      await supabase.from('validation_batches').update(values).eq('id', id).select().single(),
    ) as ValidationBatch;
  },

  async removeBatch(id: string) {
    unwrap(await supabase.from('validation_batches').delete().eq('id', id));
  },

  /* ---------------- Customers on the list ---------------- */
  async list(params: {
    filters?: ValidationFilters;
    page?: number;
    pageSize?: number;
    sort?: SortSpec[];
    officerId?: string | null;
  }): Promise<{ rows: ValidationCustomer[]; count: number }> {
    const { filters, page = 0, pageSize = 25, sort, officerId } = params;
    let q = supabase.from('validation_customers').select(SELECT, { count: 'exact' });
    q = applyFilters(q, filters);
    if (officerId) q = q.eq('officer_id', officerId);
    q = applySort(q, sort);
    const from = page * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) throw toAppError(error);
    return { rows: ((data ?? []) as ValidationCustomer[]).map(numeric), count: count ?? 0 };
  },

  async listAll(filters: ValidationFilters, sort?: SortSpec[], max = 20000): Promise<ValidationCustomer[]> {
    const batch = 1000;
    const out: ValidationCustomer[] = [];
    for (let from = 0; from < max; from += batch) {
      let q = supabase.from('validation_customers').select(SELECT);
      q = applySort(applyFilters(q, filters), sort);
      const { data, error } = await q.range(from, from + batch - 1);
      if (error) throw toAppError(error);
      out.push(...((data ?? []) as ValidationCustomer[]).map(numeric));
      if (!data || data.length < batch) break;
    }
    return out;
  },

  async get(id: string): Promise<ValidationCustomer> {
    const row = unwrap(await supabase.from('validation_customers').select(SELECT).eq('id', id).maybeSingle());
    if (!row) throw new AppError('That customer is not on the list, or you do not have access to it.', 'PGRST116');
    return numeric(row as ValidationCustomer);
  },

  async createMany(rows: ValidationCustomerInsert[]): Promise<number> {
    const batch = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batch) {
      const data = unwrap(
        await supabase.from('validation_customers').insert(rows.slice(i, i + batch)).select('id'),
      ) as { id: string }[];
      inserted += data.length;
    }
    return inserted;
  },

  async update(id: string, values: ValidationCustomerUpdate): Promise<ValidationCustomer> {
    return numeric(
      unwrap(
        await supabase.from('validation_customers').update(values).eq('id', id).select(SELECT).single(),
      ) as ValidationCustomer,
    );
  },

  async assign(ids: string[], officerId: string | null): Promise<number> {
    if (ids.length === 0) return 0;
    const data = unwrap(
      await supabase.from('validation_customers').update({ officer_id: officerId }).in('id', ids).select('id'),
    ) as { id: string }[];
    return data.length;
  },

  async remove(ids: string[]) {
    if (ids.length === 0) return;
    unwrap(await supabase.from('validation_customers').delete().in('id', ids));
  },

  async notifyAssignment(batchId: string, officerIds?: string[]): Promise<number> {
    const n = unwrap(
      await supabase.rpc('notify_validation_assignment', {
        p_batch: batchId,
        p_officers: officerIds && officerIds.length > 0 ? officerIds : null,
      }),
    ) as number | null;
    return n ?? 0;
  },

  /* ---------------- Calls ---------------- */
  async calls(validationId: string): Promise<ValidationCall[]> {
    const rows = (unwrap(
      await supabase
        .from('validation_call_log')
        .select(CALL_SELECT)
        .eq('validation_id', validationId)
        .order('called_at', { ascending: false }),
    ) ?? []) as ValidationCall[];
    return rows.map(toCall);
  },

  async addCall(values: ValidationCallInsert): Promise<ValidationCall> {
    return toCall(
      unwrap(await supabase.from('validation_call_log').insert(values).select(CALL_SELECT).single()) as ValidationCall,
    );
  },

  async updateCall(id: string, values: ValidationCallUpdate): Promise<ValidationCall> {
    return toCall(
      unwrap(
        await supabase.from('validation_call_log').update(values).eq('id', id).select(CALL_SELECT).single(),
      ) as ValidationCall,
    );
  },

  async removeCall(id: string) {
    unwrap(await supabase.from('validation_call_log').delete().eq('id', id));
  },

  /* ---------------- Reporting ---------------- */
  async summary(f: ValidationFilters): Promise<ValidationSummary> {
    const d = (unwrap(await supabase.rpc('validation_summary', rpcParams(f))) ?? {}) as Record<string, unknown>;
    return {
      customers: toNumber(d.customers),
      answered: toNumber(d.answered),
      pending: toNumber(d.pending),
      active: toNumber(d.active),
      inactive: toNumber(d.inactive),
      unreachable: toNumber(d.unreachable),
      other: toNumber(d.other),
      calls: toNumber(d.calls),
      collected: toNumber(d.collected),
      customers_paid: toNumber(d.customers_paid),
      outstanding: toNumber(d.outstanding),
      answer_rate: toNumber(d.answer_rate),
    };
  },

  async byResponse(f: ValidationFilters): Promise<ValidationResponseRow[]> {
    const rows = (unwrap(
      await supabase.rpc('report_validation_responses', {
        p_batch: f.batch || null,
        p_officer: f.officer && f.officer !== 'unassigned' ? f.officer : null,
        p_region: f.region || null,
      }),
    ) ?? []) as ValidationResponseRow[];
    return rows.map((r) => ({
      ...r,
      customers: toNumber(r.customers),
      collected: toNumber(r.collected),
      outstanding: toNumber(r.outstanding),
      sort_order: toNumber(r.sort_order),
    }));
  },

  async byRegion(f: ValidationFilters): Promise<ValidationRegionRow[]> {
    const rows = (unwrap(
      await supabase.rpc('report_validation_by_region', {
        p_batch: f.batch || null,
        p_officer: f.officer && f.officer !== 'unassigned' ? f.officer : null,
      }),
    ) ?? []) as ValidationRegionRow[];
    return rows.map((r) => ({
      ...r,
      customers: toNumber(r.customers),
      answered: toNumber(r.answered),
      active: toNumber(r.active),
      inactive: toNumber(r.inactive),
      unreachable: toNumber(r.unreachable),
      collected: toNumber(r.collected),
      outstanding: toNumber(r.outstanding),
      answer_rate: toNumber(r.answer_rate),
    }));
  },

  async byOfficer(f: ValidationFilters): Promise<ValidationOfficerRow[]> {
    const rows = (unwrap(
      await supabase.rpc('report_validation_by_officer', {
        p_batch: f.batch || null,
        p_region: f.region || null,
      }),
    ) ?? []) as ValidationOfficerRow[];
    return rows.map((r) => ({
      ...r,
      customers: toNumber(r.customers),
      answered: toNumber(r.answered),
      pending: toNumber(r.pending),
      calls: toNumber(r.calls),
      active: toNumber(r.active),
      inactive: toNumber(r.inactive),
      unreachable: toNumber(r.unreachable),
      collected: toNumber(r.collected),
      answer_rate: toNumber(r.answer_rate),
    }));
  },
};

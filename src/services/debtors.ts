import { supabase } from '@/lib/supabase';
import type {
  Debtor,
  DebtorBreakdownRow,
  DebtorDimension,
  DebtorFilters,
  DebtorInsert,
  DebtorOfficerRow,
  DebtorPeriod,
  DebtorSummary,
  DebtorTrendRow,
  DebtorUpdate,
  OfficerDebtorSummary,
  SortSpec,
} from '@/types';
import { toNumber } from '@/utils/format';
import { toLocalPhone } from '@/utils/phone';
import { AppError, toAppError, unwrap } from './errors';

const SELECT = '*, officer:officers(full_name), period:debtor_periods(period_month)';

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
  'feedback',
  'work_status',
  'contacted_at',
  'promised_date',
  'updated_at',
]);

function sanitize(value: string): string {
  return value.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { [k: string]: any }>(query: Q, f: DebtorFilters = {}): Q {
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
  if (f.period) q = q.eq('period_id', f.period);
  if (f.officer === 'unassigned') q = q.is('officer_id', null);
  else if (f.officer) q = q.eq('officer_id', f.officer);
  if (f.provider) q = q.eq('provider', f.provider);
  if (f.customerType) q = q.eq('customer_type', f.customerType);
  if (f.region) q = q.eq('region', f.region);
  if (f.community) q = q.ilike('community', `%${sanitize(f.community)}%`);
  if (f.feedback === 'none') q = q.is('feedback', null);
  else if (f.feedback) q = q.eq('feedback', f.feedback);
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
    return q.order('outstanding_balance', { ascending: false }).order('id', { ascending: true });
  }
  valid.forEach((s) => {
    q = q.order(s.id, { ascending: !s.desc, nullsFirst: false });
  });
  return q.order('id', { ascending: true });
}

const numeric = (d: Debtor): Debtor => ({
  ...d,
  outstanding_balance: toNumber(d.outstanding_balance),
  amount_collected: d.amount_collected === null ? null : toNumber(d.amount_collected),
  promised_amount: d.promised_amount === null ? null : toNumber(d.promised_amount),
  call_attempts: toNumber(d.call_attempts),
});

function rpcParams(f: DebtorFilters) {
  return {
    p_period: f.period || null,
    p_officer: f.officer && f.officer !== 'unassigned' ? f.officer : null,
    p_provider: f.provider || null,
    p_customer_type: f.customerType || null,
    p_community: f.community || null,
    p_region: f.region || null,
    p_feedback: f.feedback && f.feedback !== 'none' ? f.feedback : null,
  };
}

export const debtorsService = {
  /* ---------------- Periods ---------------- */
  async periods(): Promise<DebtorPeriod[]> {
    return (unwrap(
      await supabase.from('debtor_periods').select('*').order('period_month', { ascending: false }),
    ) ?? []) as DebtorPeriod[];
  },

  async createPeriod(periodMonth: string, notes?: string | null): Promise<DebtorPeriod> {
    return unwrap(
      await supabase
        .from('debtor_periods')
        .insert({ period_month: periodMonth, notes: notes?.trim() || null })
        .select()
        .single(),
    ) as DebtorPeriod;
  },

  async updatePeriod(id: string, values: Partial<Pick<DebtorPeriod, 'status' | 'notes'>>): Promise<DebtorPeriod> {
    return unwrap(await supabase.from('debtor_periods').update(values).eq('id', id).select().single()) as DebtorPeriod;
  },

  async removePeriod(id: string) {
    unwrap(await supabase.from('debtor_periods').delete().eq('id', id));
  },

  /* ---------------- Debtor rows ---------------- */
  async list(params: {
    filters?: DebtorFilters;
    page?: number;
    pageSize?: number;
    sort?: SortSpec[];
    officerId?: string | null;
  }): Promise<{ rows: Debtor[]; count: number }> {
    const { filters, page = 0, pageSize = 25, sort, officerId } = params;
    let q = supabase.from('debtors').select(SELECT, { count: 'exact' });
    q = applyFilters(q, filters);
    if (officerId) q = q.eq('officer_id', officerId);
    q = applySort(q, sort);
    const from = page * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) throw toAppError(error);
    return { rows: ((data ?? []) as Debtor[]).map(numeric), count: count ?? 0 };
  },

  async listAll(filters: DebtorFilters, sort?: SortSpec[], max = 20000): Promise<Debtor[]> {
    const batch = 1000;
    const out: Debtor[] = [];
    for (let from = 0; from < max; from += batch) {
      let q = supabase.from('debtors').select(SELECT);
      q = applySort(applyFilters(q, filters), sort);
      const { data, error } = await q.range(from, from + batch - 1);
      if (error) throw toAppError(error);
      out.push(...((data ?? []) as Debtor[]).map(numeric));
      if (!data || data.length < batch) break;
    }
    return out;
  },

  async get(id: string): Promise<Debtor> {
    const row = unwrap(await supabase.from('debtors').select(SELECT).eq('id', id).maybeSingle());
    if (!row) throw new AppError('Debtor record not found, or you do not have access to it.', 'PGRST116');
    return numeric(row as Debtor);
  },

  async createMany(rows: DebtorInsert[]): Promise<number> {
    const batch = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batch) {
      const data = unwrap(
        await supabase.from('debtors').insert(rows.slice(i, i + batch)).select('id'),
      ) as { id: string }[];
      inserted += data.length;
    }
    return inserted;
  },

  async update(id: string, values: DebtorUpdate): Promise<Debtor> {
    return numeric(unwrap(await supabase.from('debtors').update(values).eq('id', id).select(SELECT).single()) as Debtor);
  },

  async assign(ids: string[], officerId: string | null): Promise<number> {
    if (ids.length === 0) return 0;
    const data = unwrap(
      await supabase.from('debtors').update({ officer_id: officerId }).in('id', ids).select('id'),
    ) as { id: string }[];
    return data.length;
  },

  async remove(ids: string[]) {
    if (ids.length === 0) return;
    unwrap(await supabase.from('debtors').delete().in('id', ids));
  },

  /** Tell officers they have a new call list (one notification each) */
  async notifyAssignment(periodId: string, officerIds?: string[]): Promise<number> {
    const n = unwrap(
      await supabase.rpc('notify_debtor_assignment', {
        p_period: periodId,
        p_officers: officerIds && officerIds.length > 0 ? officerIds : null,
      }),
    ) as number | null;
    return n ?? 0;
  },

  /* ---------------- Reporting ---------------- */
  async summary(f: DebtorFilters): Promise<DebtorSummary> {
    const d = (unwrap(await supabase.rpc('debtor_summary', rpcParams(f))) ?? {}) as Record<string, unknown>;
    return {
      customers: toNumber(d.customers),
      outstanding: toNumber(d.outstanding),
      collected: toNumber(d.collected),
      promised: toNumber(d.promised),
      worked: toNumber(d.worked),
      pending: toNumber(d.pending),
      collected_count: toNumber(d.collected_count),
      unassigned: toNumber(d.unassigned),
      contact_rate: toNumber(d.contact_rate),
      collection_rate: toNumber(d.collection_rate),
    };
  },

  async officerSummary(periodId?: string | null, officerId?: string | null): Promise<OfficerDebtorSummary> {
    const d = (unwrap(
      await supabase.rpc('officer_debtor_summary', { p_period: periodId || null, p_officer: officerId || null }),
    ) ?? {}) as Record<string, unknown>;
    return {
      customers: toNumber(d.customers),
      pending: toNumber(d.pending),
      worked: toNumber(d.worked),
      collected_count: toNumber(d.collected_count),
      outstanding: toNumber(d.outstanding),
      collected: toNumber(d.collected),
      promised: toNumber(d.promised),
      collection_rate: toNumber(d.collection_rate),
      due_promises: toNumber(d.due_promises),
    };
  },

  async byOfficer(f: DebtorFilters): Promise<DebtorOfficerRow[]> {
    const rows = (unwrap(await supabase.rpc('report_debtor_officers', rpcParams(f))) ?? []) as DebtorOfficerRow[];
    return rows.map((r) => ({
      ...r,
      customers: toNumber(r.customers),
      outstanding: toNumber(r.outstanding),
      collected: toNumber(r.collected),
      promised: toNumber(r.promised),
      worked: toNumber(r.worked),
      pending: toNumber(r.pending),
      collected_count: toNumber(r.collected_count),
      contact_rate: toNumber(r.contact_rate),
      collection_rate: toNumber(r.collection_rate),
      by_feedback: Object.fromEntries(Object.entries(r.by_feedback ?? {}).map(([k, v]) => [k, toNumber(v)])),
    }));
  },

  async breakdown(dimension: DebtorDimension, f: DebtorFilters, limit = 50): Promise<DebtorBreakdownRow[]> {
    const rows = (unwrap(
      await supabase.rpc('report_debtor_breakdown', { p_dimension: dimension, ...rpcParams(f), p_limit: limit }),
    ) ?? []) as DebtorBreakdownRow[];
    return rows.map((r) => ({
      label: r.label,
      customers: toNumber(r.customers),
      outstanding: toNumber(r.outstanding),
      collected: toNumber(r.collected),
      worked: toNumber(r.worked),
    }));
  },

  async trend(months = 12): Promise<DebtorTrendRow[]> {
    const rows = (unwrap(await supabase.rpc('report_debtor_trend', { p_months: months })) ?? []) as DebtorTrendRow[];
    return rows.map((r) => ({
      period_month: r.period_month,
      customers: toNumber(r.customers),
      outstanding: toNumber(r.outstanding),
      collected: toNumber(r.collected),
      worked: toNumber(r.worked),
      collection_rate: toNumber(r.collection_rate),
    }));
  },
};

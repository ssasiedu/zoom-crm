import { supabase } from '@/lib/supabase';
import type {
  BreakdownItem,
  IssueByRegionRow,
  Kpis,
  OfficerPerformanceRow,
  PaymentRow,
  ReportFilters,
  SlaAgingReport,
  StatusByRegionRow,
  TrendPoint,
  TurnaroundGroupRow,
  TurnaroundReport,
  TurnaroundTotals,
} from '@/types';
import { exclusiveEndISO, startOfDayISO } from '@/utils/dateRange';
import { toNumber } from '@/utils/format';
import { unwrap } from './errors';

export type BreakdownDimension = 'status' | 'contact_type' | 'community' | 'region' | 'issue_type' | 'priority';

function params(f: ReportFilters) {
  return {
    p_from: f.from ? startOfDayISO(f.from) : null,
    p_to: f.to ? exclusiveEndISO(f.to) : null,
    p_region: f.region || null,
    p_officer: f.officer || null,
    p_issue_type: f.issueType || null,
    p_contact_type: f.contactType || null,
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return unwrap(await supabase.rpc(fn, args)) as T;
}

const num = <T extends object>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  keys.forEach((k) => {
    (out as Record<keyof T, unknown>)[k] = toNumber(row[k]);
  });
  return out;
};

const groupRow = (r: TurnaroundGroupRow): TurnaroundGroupRow => ({
  label: r.label,
  resolved: toNumber(r.resolved),
  avg_resolution_minutes: r.avg_resolution_minutes === null ? null : toNumber(r.avg_resolution_minutes),
  median_resolution_minutes:
    r.median_resolution_minutes === null || r.median_resolution_minutes === undefined
      ? null
      : toNumber(r.median_resolution_minutes),
  avg_response_minutes: r.avg_response_minutes === null ? null : toNumber(r.avg_response_minutes),
  within_sla: r.within_sla === undefined ? undefined : toNumber(r.within_sla),
});

export const reportsService = {
  async kpis(f: ReportFilters): Promise<Kpis> {
    const d = await rpc<Record<string, unknown>>('dashboard_kpis', params(f));
    return {
      total: toNumber(d.total),
      open: toNumber(d.open),
      in_progress: toNumber(d.in_progress),
      resolved: toNumber(d.resolved),
      closed: toNumber(d.closed),
      overdue: toNumber(d.overdue),
      unassigned: toNumber(d.unassigned),
      resolution_rate: toNumber(d.resolution_rate),
      avg_resolution_hours: d.avg_resolution_hours === null ? null : toNumber(d.avg_resolution_hours),
      total_payments: toNumber(d.total_payments),
      sla_compliance: toNumber(d.sla_compliance),
    };
  },

  async trend(f: ReportFilters, bucket: 'day' | 'week' | 'month'): Promise<TrendPoint[]> {
    const rows = await rpc<TrendPoint[]>('dashboard_trend', { ...params(f), p_bucket: bucket });
    return (rows ?? []).map((r) => num(r, ['opened', 'resolved']));
  },

  async breakdown(dimension: BreakdownDimension, f: ReportFilters, limit = 50): Promise<BreakdownItem[]> {
    const rows = await rpc<BreakdownItem[]>('dashboard_breakdown', {
      p_dimension: dimension,
      ...params(f),
      p_limit: limit,
    });
    return (rows ?? []).map((r) => num(r, ['count']));
  },

  async statusByRegion(f: ReportFilters): Promise<StatusByRegionRow[]> {
    const rows = await rpc<StatusByRegionRow[]>('report_status_by_region', params(f));
    return (rows ?? []).map((r) =>
      num(r, ['total', 'open', 'in_progress', 'resolved', 'closed', 'overdue', 'resolution_rate', 'payments']),
    );
  },

  async issueTypeByRegion(f: ReportFilters): Promise<IssueByRegionRow[]> {
    const rows = await rpc<IssueByRegionRow[]>('report_issue_type_by_region', params(f));
    return (rows ?? []).map((r) => num(r, ['count']));
  },

  async paymentsByRegion(f: ReportFilters): Promise<PaymentRow[]> {
    const rows = await rpc<PaymentRow[]>('report_payments_by_region', params(f));
    return (rows ?? []).map((r) => num(r, ['total', 'count']));
  },

  async officerPerformance(f: ReportFilters): Promise<OfficerPerformanceRow[]> {
    const rows = await rpc<OfficerPerformanceRow[]>('report_officer_performance', params(f));
    return (rows ?? []).map((r) => ({
      ...num(r, ['total_assigned', 'resolved', 'active', 'resolution_rate', 'overdue', 'payments']),
      avg_resolution_hours: r.avg_resolution_hours === null ? null : toNumber(r.avg_resolution_hours),
      by_contact_type: Object.fromEntries(
        Object.entries(r.by_contact_type ?? {}).map(([k, v]) => [k, toNumber(v)]),
      ),
    }));
  },

  /** Turnaround (raised → resolved) and waiting time (raised → first worked on) */
  async turnaround(f: ReportFilters): Promise<TurnaroundReport> {
    const d = await rpc<TurnaroundReport>('report_turnaround', params(f));
    const minutes = (v: unknown) => (v === null || v === undefined ? null : toNumber(v));
    const t = (d?.totals ?? {}) as Partial<TurnaroundTotals>;
    return {
      totals: {
        tickets: toNumber(t.tickets),
        resolved: toNumber(t.resolved),
        avg_resolution_minutes: minutes(t.avg_resolution_minutes),
        median_resolution_minutes: minutes(t.median_resolution_minutes),
        p90_resolution_minutes: minutes(t.p90_resolution_minutes),
        fastest_minutes: minutes(t.fastest_minutes),
        slowest_minutes: minutes(t.slowest_minutes),
        avg_response_minutes: minutes(t.avg_response_minutes),
        median_response_minutes: minutes(t.median_response_minutes),
        total_minutes: toNumber(t.total_minutes),
        within_sla: toNumber(t.within_sla),
      },
      buckets: (d?.buckets ?? []).map((b) => ({ label: b.label, count: toNumber(b.count) })),
      by_officer: (d?.by_officer ?? []).map((r) => ({
        ...r,
        resolved: toNumber(r.resolved),
        avg_resolution_minutes: minutes(r.avg_resolution_minutes),
        median_resolution_minutes: minutes(r.median_resolution_minutes),
        avg_response_minutes: minutes(r.avg_response_minutes),
        fastest_minutes: minutes(r.fastest_minutes),
        slowest_minutes: minutes(r.slowest_minutes),
        total_minutes: toNumber(r.total_minutes),
        within_sla: toNumber(r.within_sla),
      })),
      by_issue_type: (d?.by_issue_type ?? []).map(groupRow),
      by_region: (d?.by_region ?? []).map(groupRow),
      by_contact_type: (d?.by_contact_type ?? []).map(groupRow),
      trend: (d?.trend ?? []).map((r) => ({
        bucket: r.bucket,
        resolved: toNumber(r.resolved),
        avg_resolution_minutes: minutes(r.avg_resolution_minutes),
        avg_response_minutes: minutes(r.avg_response_minutes),
      })),
    };
  },

  async slaAging(f: ReportFilters): Promise<SlaAgingReport> {
    const d = await rpc<SlaAgingReport>('report_sla_aging', params(f));
    const keys = ['d0_2', 'd3_7', 'd8_14', 'd15_plus', 'total'] as const;
    return {
      totals: num(d?.totals ?? { d0_2: 0, d3_7: 0, d8_14: 0, d15_plus: 0, total: 0 }, [...keys]),
      by_region: (d?.by_region ?? []).map((r) => num(r, [...keys, 'max_days'])),
      by_officer: (d?.by_officer ?? []).map((r) => num(r, [...keys])),
    };
  },
};

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { ReportFilters } from '@/types';
import { parsePreset, resolveRange, type DateRangeValue, type RangePreset } from '@/utils/dateRange';

/** Global dashboard/report filters, kept in the URL so views are shareable */
export function useReportFilters(defaultPreset: RangePreset = 'month') {
  const [params, setParams] = useSearchParams();

  const range: DateRangeValue = useMemo(
    () => ({
      preset: parsePreset(params.get('range'), defaultPreset),
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    }),
    [params, defaultPreset],
  );

  const filters: ReportFilters = useMemo(() => {
    const r = resolveRange(range);
    return {
      from: r.from,
      to: r.to,
      region: params.get('region') ?? undefined,
      officer: params.get('officer') ?? undefined,
      issueType: params.get('issue_type') ?? undefined,
      contactType: params.get('contact_type') ?? undefined,
    };
  }, [params, range]);

  const set = useCallback(
    (patch: Record<string, string | null | undefined>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const setRange = useCallback(
    (v: DateRangeValue) =>
      set({
        range: v.preset,
        from: v.preset === 'custom' ? v.from : null,
        to: v.preset === 'custom' ? v.to : null,
      }),
    [set],
  );

  const reset = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        const tab = prev.get('report');
        if (tab) next.set('report', tab);
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  /** Params to carry into /tickets drill-down links (officer filter must be an id there too) */
  const ticketParams = useMemo(
    () => ({
      range: range.preset === 'all' ? undefined : range.preset,
      from: range.preset === 'custom' ? range.from : undefined,
      to: range.preset === 'custom' ? range.to : undefined,
      region: filters.region,
      officer: filters.officer,
      issue_type: filters.issueType,
      contact_type: filters.contactType,
    }),
    [range, filters],
  );

  const activeCount = ['region', 'officer', 'issue_type', 'contact_type'].filter((k) => params.get(k)).length;

  return { params, filters, range, set, setRange, reset, ticketParams, activeCount };
}

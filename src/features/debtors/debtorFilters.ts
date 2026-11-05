import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { SortingState } from '@tanstack/react-table';
import type { DebtorFilters, DebtorWorkStatus } from '@/types';

const WORK_STATUSES: DebtorWorkStatus[] = ['Pending', 'Worked', 'Collected'];

/** Filters for the debtor list, kept in the URL so views can be shared */
export function useDebtorUrlState(defaultPeriod?: string) {
  const [params, setParams] = useSearchParams();

  const filters: DebtorFilters = useMemo(() => {
    const workStatus = params.get('work') as DebtorWorkStatus | null;
    return {
      period: params.get('period') ?? defaultPeriod ?? undefined,
      officer: params.get('officer') ?? undefined,
      provider: params.get('provider') ?? undefined,
      customerType: params.get('customer_type') ?? undefined,
      community: params.get('community') ?? undefined,
      region: params.get('region') ?? undefined,
      feedback: params.get('feedback') ?? undefined,
      workStatus: workStatus && WORK_STATUSES.includes(workStatus) ? workStatus : undefined,
      search: params.get('q') ?? undefined,
    };
  }, [params, defaultPeriod]);

  const sorting: SortingState = useMemo(() => {
    const s = params.get('sort');
    if (!s) return [{ id: 'outstanding_balance', desc: true }];
    return s.split(',').map((part) => ({ id: part.replace(/^-/, ''), desc: part.startsWith('-') }));
  }, [params]);

  const page = Math.max(0, Number(params.get('page') ?? 0) || 0);
  const pageSize = [10, 25, 50, 100].includes(Number(params.get('size'))) ? Number(params.get('size')) : 25;

  const update = useCallback(
    (patch: Record<string, string | null | undefined>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          });
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setSorting = useCallback(
    (s: SortingState) => update({ sort: s.map((x) => `${x.desc ? '-' : ''}${x.id}`).join(',') || null }),
    [update],
  );

  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        const period = prev.get('period');
        const size = prev.get('size');
        const tab = prev.get('tab');
        if (period) next.set('period', period);
        if (size) next.set('size', size);
        if (tab) next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const activeCount = ['officer', 'provider', 'customer_type', 'community', 'region', 'feedback', 'work', 'q'].filter(
    (k) => params.get(k),
  ).length;

  return { params, filters, sorting, page, pageSize, update, setSorting, clear, activeCount };
}

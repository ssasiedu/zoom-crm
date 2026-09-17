import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { SortingState } from '@tanstack/react-table';
import { STATUSES } from '@/lib/constants';
import type { Priority, TicketFilters, TicketStatus } from '@/types';
import { parsePreset, resolveRange, type DateRangeValue } from '@/utils/dateRange';

/** URL keys that describe filters (saved in saved views) */
export const FILTER_KEYS = [
  'q',
  'status',
  'region',
  'issue_type',
  'contact_type',
  'payment_source',
  'payment_type',
  'payment_status',
  'priority',
  'officer',
  'community',
  'range',
  'from',
  'to',
  'dueFrom',
  'dueTo',
  'overdue',
  'sort',
] as const;

export function useTicketUrlState() {
  const [params, setParams] = useSearchParams();

  const range: DateRangeValue = useMemo(
    () => ({
      preset: parsePreset(params.get('range'), 'all'),
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    }),
    [params],
  );

  const filters: TicketFilters = useMemo(() => {
    const statusParam = params.get('status');
    const statuses = statusParam
      ? (statusParam.split(',').filter((s) => STATUSES.includes(s as TicketStatus)) as TicketStatus[])
      : [];
    const r = resolveRange(range);
    return {
      search: params.get('q') ?? undefined,
      status: statuses.length ? statuses : undefined,
      region: params.get('region') ?? undefined,
      issue_type: params.get('issue_type') ?? undefined,
      contact_type: params.get('contact_type') ?? undefined,
      payment_source: params.get('payment_source') ?? undefined,
      payment_type: params.get('payment_type') ?? undefined,
      payment_status: params.get('payment_status') ?? undefined,
      priority: (params.get('priority') as Priority | null) ?? undefined,
      officer: params.get('officer') ?? undefined,
      community: params.get('community') ?? undefined,
      from: r.from,
      to: r.to,
      dueFrom: params.get('dueFrom') ?? undefined,
      dueTo: params.get('dueTo') ?? undefined,
      overdue: params.get('overdue') === '1' || undefined,
    };
  }, [params, range]);

  const sorting: SortingState = useMemo(() => {
    const s = params.get('sort');
    if (!s) return [{ id: 'date_opened', desc: true }];
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

  const setRange = useCallback(
    (v: DateRangeValue) =>
      update({
        range: v.preset === 'all' ? null : v.preset,
        from: v.preset === 'custom' ? (v.from ?? null) : null,
        to: v.preset === 'custom' ? (v.to ?? null) : null,
      }),
    [update],
  );

  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        const size = prev.get('size');
        if (size) next.set('size', size);
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const snapshot = useCallback((): Record<string, string> => {
    const out: Record<string, string> = {};
    FILTER_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) out[k] = v;
    });
    return out;
  }, [params]);

  const applySnapshot = useCallback(
    (snap: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams();
          Object.entries(snap).forEach(([k, v]) => {
            if ((FILTER_KEYS as readonly string[]).includes(k) && v) next.set(k, v);
          });
          const size = prev.get('size');
          if (size) next.set('size', size);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const activeCount = FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'from' && k !== 'to' && params.get(k)).length;

  return { params, filters, range, sorting, page, pageSize, update, setSorting, setRange, clear, snapshot, applySnapshot, activeCount };
}

/** Build a /tickets URL for drill-down links */
export function ticketsUrl(p: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `/tickets?${s}` : '/tickets';
}

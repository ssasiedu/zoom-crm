import { MapPin } from 'lucide-react';
import type { StatusByRegionRow } from '@/types';
import { Card, CardHeader, Skeleton } from '@/components/ui';
import { STATUS_COLORS } from '@/lib/constants';
import { cn } from '@/utils/cn';
import { formatGHS, formatNumber } from '@/utils/format';

/** Clickable tiles for Ghana's regions with a stacked status bar */
export function RegionBreakdown({
  rows,
  loading,
  selected,
  onSelect,
}: {
  rows: StatusByRegionRow[];
  loading?: boolean;
  selected?: string;
  onSelect: (region: string | null) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Card>
      <CardHeader
        icon={<MapPin />}
        title="Tickets by region"
        description={selected ? `Filtered to ${selected} — click again to clear` : 'Click a region to filter the whole dashboard'}
      />
      <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          : rows.map((r) => {
              const isSel = selected === r.region;
              const segments = [
                { key: 'Open' as const, v: r.open },
                { key: 'In-Progress' as const, v: r.in_progress },
                { key: 'Resolved' as const, v: r.resolved },
                { key: 'Closed' as const, v: r.closed },
              ];
              return (
                <button
                  key={r.region}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => onSelect(isSel ? null : r.region)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition hover:border-brand-400 hover:shadow-sm',
                    isSel ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800',
                    r.total === 0 && 'opacity-60',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.region}</span>
                    <span className="text-lg font-bold tabular-nums">{formatNumber(r.total)}</span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ width: `${Math.max(8, (r.total / max) * 100)}%` }}>
                    {segments.map((s) =>
                      s.v ? (
                        <span key={s.key} title={`${s.key}: ${s.v}`} style={{ width: `${(s.v / Math.max(r.total, 1)) * 100}%`, background: STATUS_COLORS[s.key] }} />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    <span>{r.resolution_rate}% resolved</span>
                    {r.overdue > 0 && <span className="font-semibold text-rose-600">{r.overdue} overdue</span>}
                    {r.payments > 0 && <span>{formatGHS(r.payments)}</span>}
                  </div>
                </button>
              );
            })}
      </div>
    </Card>
  );
}

import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { formatNumber } from '@/utils/format';

export function useChartTheme() {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return {
    grid: dark ? '#1e293b' : '#e2e8f0',
    axis: dark ? '#94a3b8' : '#64748b',
    cursor: dark ? 'rgba(148,163,184,0.08)' : 'rgba(100,116,139,0.08)',
    brand: dark ? '#45bb7c' : '#16804b',
    gold: '#e5a50a',
    tick: { fontSize: 11, fill: dark ? '#94a3b8' : '#64748b' },
  };
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (v) => formatNumber(v),
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueFormatter?: (v: number) => string;
  labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      {label !== undefined && label !== '' && (
        <p className="mb-1 font-semibold text-slate-900 dark:text-white">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="size-2 rounded-full" style={{ background: p.color ?? (p.payload?.fill as string) }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-slate-900 tabular-nums dark:text-white">{valueFormatter(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  loading,
  empty,
  actions,
  children,
  height = 280,
  className,
}: {
  title: string;
  description?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} actions={actions} />
      <div className="p-3 sm:p-4" style={{ minHeight: height }}>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : empty ? (
          <EmptyState compact icon={<BarChart3 />} title="No data for this selection" />
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </Card>
  );
}

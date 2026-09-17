import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface ReportColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Simple, printable report table with sticky header and totals row */
export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  caption: string;
}) {
  const hasFooter = columns.some((c) => c.footer !== undefined);
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 dark:bg-slate-900">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'border-b px-3 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase',
                  c.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn(onRowClick && 'cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-500/5')}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('px-3 py-2 whitespace-nowrap', c.align === 'right' && 'text-right tabular-nums', c.className)}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasFooter && (
          <tfoot className="border-t-2 bg-slate-50 font-semibold dark:bg-slate-900">
            <tr>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-2.5 whitespace-nowrap', c.align === 'right' && 'text-right tabular-nums')}>
                  {c.footer}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + (pick(r) || 0), 0);

/** Heat-map cell tint for pivot tables */
export function heat(value: number, max: number): string | undefined {
  if (!value || !max) return undefined;
  const r = value / max;
  if (r > 0.75) return 'bg-brand-200/70 dark:bg-brand-500/30 font-semibold';
  if (r > 0.5) return 'bg-brand-100/80 dark:bg-brand-500/20';
  if (r > 0.25) return 'bg-brand-50 dark:bg-brand-500/10';
  return undefined;
}

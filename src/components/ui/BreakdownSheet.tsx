import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Search, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, EmptyState, ErrorState, Input, Modal, TableSkeleton } from '@/components/ui';
import { errorMessage } from '@/services/errors';
import { cn } from '@/utils/cn';
import { exportToExcel, exportToPdf, type Cell } from '@/utils/export';
import { formatGHS, formatNumber } from '@/utils/format';

export interface SheetColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  /** what the reader sees */
  render: (row: T) => React.ReactNode;
  /** what goes in the Excel/PDF cell, and what gets searched */
  value: (row: T) => Cell;
  /** sum this column and show the total in the footer */
  total?: 'money' | 'count';
}

/**
 * The rows behind a headline figure. A total on a card is only as
 * trustworthy as the lines under it, so every money card opens one of
 * these: the same filters, every row, and a footer that adds up to the
 * number on the card.
 */
export function BreakdownSheet<T>({
  open,
  onClose,
  title,
  description,
  columns,
  rows,
  loading,
  error,
  onRetry,
  filename,
  emptyText = 'Nothing to show for these filters',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  columns: SheetColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  filename: string;
  emptyText?: string;
}) {
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => columns.some((c) => String(c.value(r) ?? '').toLowerCase().includes(term)));
  }, [rows, q, columns]);

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    columns.forEach((c) => {
      if (!c.total) return;
      out[c.key] = shown.reduce((sum, r) => sum + (Number(c.value(r)) || 0), 0);
    });
    return out;
  }, [shown, columns]);

  const sheet = () => ({
    name: title.slice(0, 28),
    head: columns.map((c) => c.header),
    rows: shown.map((r) => columns.map((c) => c.value(r))),
    foot: columns.map((c, i) =>
      i === 0 ? `${shown.length} rows` : c.total ? Number(totals[c.key].toFixed(2)) : '',
    ),
  });

  const download = (kind: 'xlsx' | 'pdf') => {
    try {
      const options = { filename, title, subtitle: description, sheets: [sheet()] };
      if (kind === 'xlsx') exportToExcel(options);
      else exportToPdf({ ...options, orientation: 'landscape' as const });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      description={description}
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">
            {formatNumber(shown.length)} row{shown.length === 1 ? '' : 's'}
            {q && rows.length !== shown.length ? ` of ${formatNumber(rows.length)}` : ''}
          </span>
          <Button
            variant="secondary"
            leftIcon={<FileSpreadsheet className="size-4" />}
            disabled={shown.length === 0}
            onClick={() => download('xlsx')}
          >
            Excel
          </Button>
          <Button
            variant="secondary"
            leftIcon={<FileText className="size-4" />}
            disabled={shown.length === 0}
            onClick={() => download('pdf')}
          >
            PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {rows.length > 8 && (
          <Input
            aria-label="Search these rows"
            leftIcon={<Search />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, officer, reference…"
          />
        )}

        {loading ? (
          <TableSkeleton rows={8} cols={Math.min(columns.length, 6)} />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={onRetry} />
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon={<Table2 />}
            title={q ? 'Nothing matches that search' : emptyText}
            action={q ? <Button variant="secondary" onClick={() => setQ('')}>Clear search</Button> : undefined}
          />
        ) : (
          <div className="scrollbar-thin max-h-[55vh] overflow-auto rounded-lg border dark:border-slate-800">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={cn(
                        'border-b px-3 py-2 text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase',
                        c.align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('px-3 py-2 align-top', c.align === 'right' && 'text-right tabular-nums')}
                      >
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 bg-slate-50 font-semibold dark:bg-slate-900">
                <tr>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn('px-3 py-2.5 whitespace-nowrap', c.align === 'right' && 'text-right tabular-nums')}>
                      {i === 0
                        ? 'Total'
                        : c.total === 'money'
                          ? formatGHS(totals[c.key])
                          : c.total === 'count'
                            ? formatNumber(totals[c.key])
                            : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

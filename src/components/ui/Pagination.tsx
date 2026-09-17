import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PAGE_SIZES } from '@/lib/constants';
import { formatNumber } from '@/utils/format';
import { Button } from './Button';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-600 dark:text-slate-400"
    >
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {formatNumber(from)}–{formatNumber(to)} of <strong className="text-slate-900 dark:text-white">{formatNumber(total)}</strong>
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(0)} disabled={page === 0} aria-label="First page">
          <ChevronsLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={page === 0} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 tabular-nums">
          Page {page + 1} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page + 1 >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(pageCount - 1)}
          disabled={page + 1 >= pageCount}
          aria-label="Last page"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

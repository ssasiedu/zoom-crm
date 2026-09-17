import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Menu } from './Menu';
import { Pagination } from './Pagination';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId?: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Server-side mode: provide total + page state */
  manual?: {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** rendered on the left of the table toolbar */
  toolbar?: ReactNode;
  showColumnToggle?: boolean;
  /** client mode page size (0 = no pagination) */
  clientPageSize?: number;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
  caption?: string;
  dense?: boolean;
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading,
  empty,
  onRowClick,
  manual,
  sorting: sortingProp,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  columnVisibility: visibilityProp,
  onColumnVisibilityChange,
  toolbar,
  showColumnToggle,
  clientPageSize = 0,
  rowClassName,
  footer,
  caption,
  dense,
}: DataTableProps<T>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [localVisibility, setLocalVisibility] = useState<VisibilityState>({});
  const sorting = sortingProp ?? localSorting;
  const columnVisibility = visibilityProp ?? localVisibility;
  const selectable = Boolean(onRowSelectionChange);

  const table = useReactTable<T>({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnVisibility,
      rowSelection: rowSelection ?? {},
      ...(manual ? { pagination: { pageIndex: manual.page, pageSize: manual.pageSize } } : {}),
    },
    manualSorting: Boolean(manual),
    manualPagination: Boolean(manual),
    rowCount: manual?.total,
    enableRowSelection: selectable,
    onSortingChange: onSortingChange ?? setLocalSorting,
    onColumnVisibilityChange: onColumnVisibilityChange ?? setLocalVisibility,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manual ? undefined : getSortedRowModel(),
    getPaginationRowModel: !manual && clientPageSize > 0 ? getPaginationRowModel() : undefined,
    initialState: !manual && clientPageSize > 0 ? { pagination: { pageIndex: 0, pageSize: clientPageSize } } : undefined,
  });

  const rows = table.getRowModel().rows;
  const allSelected = table.getIsAllPageRowsSelected();
  const someSelected = table.getIsSomePageRowsSelected();

  return (
    <div className="min-w-0">
      {(toolbar || showColumnToggle) && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {showColumnToggle && (
            <Menu
              label="Show or hide columns"
              trigger={({ toggle, ref, open }) => (
                <Button
                  ref={ref}
                  variant="secondary"
                  size="sm"
                  onClick={toggle}
                  aria-expanded={open}
                  leftIcon={<Columns3 className="size-4" />}
                >
                  Columns
                </Button>
              )}
            >
              <div className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto p-1.5">
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <div key={c.id} className="rounded px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Checkbox
                        label={String(c.columnDef.meta?.label ?? c.columnDef.header ?? c.id)}
                        checked={c.getIsVisible()}
                        onChange={c.getToggleVisibilityHandler()}
                      />
                    </div>
                  ))}
              </div>
            </Menu>
          )}
        </div>
      )}

      <div className="scrollbar-thin relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {selectable && (
                  <th className="w-10 border-b px-3 py-2.5 text-left">
                    <Checkbox
                      aria-label="Select all rows on this page"
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={table.getToggleAllPageRowsSelectedHandler()}
                    />
                  </th>
                )}
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn(
                        'border-b px-3 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase dark:text-slate-400',
                        align === 'right' ? 'text-right' : 'text-left',
                      )}
                      style={{ width: header.column.columnDef.size !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white',
                            align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {!loading && rows.length > 0 && (
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row.original);
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-brand-50/50 focus-visible:bg-brand-50 dark:hover:bg-brand-500/5',
                    row.getIsSelected() && 'bg-brand-50/70 dark:bg-brand-500/10',
                    rowClassName?.(row.original),
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label="Select row"
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 align-middle text-slate-700 dark:text-slate-300',
                        dense ? 'py-1.5' : 'py-2.5',
                        cell.column.columnDef.meta?.align === 'right' && 'text-right tabular-nums',
                        cell.column.columnDef.meta?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
          {footer}
        </table>
        {loading && <TableSkeleton rows={Math.min(manual?.pageSize ?? 8, 10)} cols={Math.min(columns.length, 7)} />}
        {!loading && rows.length === 0 && (empty ?? <EmptyState title="Nothing to show" description="No records match." />)}
      </div>

      {manual ? (
        <Pagination
          page={manual.page}
          pageSize={manual.pageSize}
          total={manual.total}
          onPageChange={manual.onPageChange}
          onPageSizeChange={manual.onPageSizeChange}
        />
      ) : clientPageSize > 0 && data.length > clientPageSize ? (
        <Pagination
          page={table.getState().pagination.pageIndex}
          pageSize={table.getState().pagination.pageSize}
          total={data.length}
          onPageChange={(p) => table.setPageIndex(p)}
          onPageSizeChange={(s) => table.setPageSize(s)}
        />
      ) : null}
    </div>
  );
}

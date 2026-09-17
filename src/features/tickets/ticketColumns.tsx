import type { ColumnDef } from '@tanstack/react-table';
import { FIELD_LABELS } from '@/lib/constants';
import type { TicketRow } from '@/types';
import { Avatar, DueBadge, PriorityBadge, StatusBadge } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatGHS } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { getDueState } from '@/utils/tickets';

const L = FIELD_LABELS;
const col = (id: keyof TicketRow, extra: Partial<ColumnDef<TicketRow, unknown>> = {}): ColumnDef<TicketRow, unknown> => ({
  id,
  accessorKey: id,
  header: L[id] ?? id,
  meta: { label: L[id] ?? id },
  cell: (info) => {
    const v = info.getValue();
    return v === null || v === undefined || v === '' ? <span className="text-slate-400">—</span> : String(v);
  },
  ...extra,
});

export const ticketColumns: ColumnDef<TicketRow, unknown>[] = [
  col('ticket_number', {
    enableHiding: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold whitespace-nowrap text-brand-700 dark:text-brand-400">
        {row.original.ticket_number}
      </span>
    ),
  }),
  col('date_opened', { cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date_opened)}</span> }),
  col('client_name', {
    cell: ({ row }) => <span className="block max-w-48 truncate font-medium text-slate-900 dark:text-white">{row.original.client_name}</span>,
  }),
  col('client_id', { cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap">{row.original.client_id}</span> }),
  col('contact_number', { cell: ({ row }) => <span className="whitespace-nowrap">{formatPhone(row.original.contact_number)}</span> }),
  col('contact_type', { cell: ({ row }) => <span className="whitespace-nowrap">{row.original.contact_type}</span> }),
  col('community'),
  col('description', {
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-64 truncate" title={row.original.description}>
        {row.original.description}
      </span>
    ),
  }),
  col('issue_type', { cell: ({ row }) => <span className="whitespace-nowrap">{row.original.issue_type}</span> }),
  col('responsible_party'),
  col('due_date', {
    cell: ({ row }) => (
      <span className="flex flex-col gap-0.5 whitespace-nowrap">
        <span className={cn(getDueState(row.original) === 'overdue' && 'font-semibold text-rose-600')}>{formatDate(row.original.due_date)}</span>
        <DueBadge ticket={row.original} className="w-fit" />
      </span>
    ),
  }),
  col('completion_date', { cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.completion_date)}</span> }),
  col('payment_amount', {
    meta: { label: L.payment_amount, align: 'right' },
    cell: ({ row }) =>
      row.original.payment_amount === null ? <span className="text-slate-400">—</span> : <span className="whitespace-nowrap">{formatGHS(row.original.payment_amount)}</span>,
  }),
  col('payment_source'),
  col('payment_type'),
  col('payment_status'),
  col('status', { cell: ({ row }) => <StatusBadge status={row.original.status} /> }),
  col('remarks', {
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-56 truncate" title={row.original.remarks ?? ''}>
        {row.original.remarks ?? <span className="text-slate-400">—</span>}
      </span>
    ),
  }),
  col('region', { cell: ({ row }) => <span className="whitespace-nowrap">{row.original.region}</span> }),
  col('officer_name', {
    cell: ({ row }) =>
      row.original.officer_name ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Avatar name={row.original.officer_name} size="xs" />
          {row.original.officer_name}
        </span>
      ) : (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Unassigned</span>
      ),
  }),
  col('reason_for_open_status', {
    enableSorting: false,
    cell: ({ row }) => <span className="block max-w-48 truncate">{row.original.reason_for_open_status ?? '—'}</span>,
  }),
  col('priority', { cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> }),
  col('updated_at', { cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.updated_at)}</span> }),
];

export const DEFAULT_HIDDEN_COLUMNS: Record<string, boolean> = {
  responsible_party: false,
  completion_date: false,
  payment_source: false,
  payment_type: false,
  payment_status: false,
  remarks: false,
  reason_for_open_status: false,
  updated_at: false,
  contact_type: false,
};

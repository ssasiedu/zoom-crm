import type { ColumnDef } from '@tanstack/react-table';
import { DEBTOR_FIELD_LABELS, DEBTOR_STATUS_TONE } from '@/lib/constants';
import type { Debtor } from '@/types';
import { Badge } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatGHS } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

const L = DEBTOR_FIELD_LABELS;

export function WorkStatusBadge({ status }: { status: string }) {
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', DEBTOR_STATUS_TONE[status])}>{status}</span>;
}

const dash = <span className="text-slate-400">—</span>;

export const debtorColumns: ColumnDef<Debtor, unknown>[] = [
  {
    id: 'customer_name',
    accessorKey: 'customer_name',
    header: L.customer_name,
    meta: { label: L.customer_name },
    enableHiding: false,
    cell: ({ row }) => (
      <span className="block max-w-56 truncate font-medium text-slate-900 dark:text-white">{row.original.customer_name}</span>
    ),
  },
  {
    id: 'customer_id',
    accessorKey: 'customer_id',
    header: L.customer_id,
    meta: { label: L.customer_id },
    cell: ({ row }) =>
      row.original.customer_id ? <span className="font-mono text-xs">{row.original.customer_id}</span> : dash,
  },
  {
    id: 'contact_number',
    accessorKey: 'contact_number',
    header: L.contact_number,
    meta: { label: L.contact_number },
    cell: ({ row }) => (row.original.contact_number ? formatPhone(row.original.contact_number) : dash),
  },
  {
    id: 'customer_type',
    accessorKey: 'customer_type',
    header: L.customer_type,
    meta: { label: L.customer_type },
    cell: ({ row }) => row.original.customer_type ?? dash,
  },
  {
    id: 'provider',
    accessorKey: 'provider',
    header: L.provider,
    meta: { label: L.provider },
    cell: ({ row }) => row.original.provider ?? dash,
  },
  {
    id: 'community',
    accessorKey: 'community',
    header: L.community,
    meta: { label: L.community },
    cell: ({ row }) => row.original.community ?? dash,
  },
  {
    id: 'region',
    accessorKey: 'region',
    header: L.region,
    meta: { label: L.region },
    cell: ({ row }) => row.original.region ?? dash,
  },
  {
    id: 'outstanding_balance',
    accessorKey: 'outstanding_balance',
    header: L.outstanding_balance,
    meta: { label: L.outstanding_balance, align: 'right' },
    cell: ({ row }) => <span className="font-semibold whitespace-nowrap">{formatGHS(row.original.outstanding_balance)}</span>,
  },
  {
    id: 'officer_name',
    accessorKey: 'officer_id',
    header: L.officer_name,
    meta: { label: L.officer_name },
    enableSorting: false,
    cell: ({ row }) =>
      row.original.officer?.full_name ?? <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Unassigned</span>,
  },
  {
    id: 'amount_collected',
    accessorKey: 'amount_collected',
    header: L.amount_collected,
    meta: { label: L.amount_collected, align: 'right' },
    cell: ({ row }) =>
      row.original.amount_collected === null ? (
        dash
      ) : (
        <span className="font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-400">
          {formatGHS(row.original.amount_collected)}
        </span>
      ),
  },
  {
    id: 'feedback',
    accessorKey: 'feedback',
    header: L.feedback,
    meta: { label: L.feedback },
    cell: ({ row }) => (row.original.feedback ? <Badge tone="blue">{row.original.feedback}</Badge> : dash),
  },
  {
    id: 'work_status',
    accessorKey: 'work_status',
    header: L.work_status,
    meta: { label: L.work_status },
    cell: ({ row }) => <WorkStatusBadge status={row.original.work_status} />,
  },
  {
    id: 'comment',
    accessorKey: 'comment',
    header: L.comment,
    meta: { label: L.comment },
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-64 truncate" title={row.original.comment ?? ''}>
        {row.original.comment ?? dash}
      </span>
    ),
  },
  {
    id: 'promised_date',
    accessorKey: 'promised_date',
    header: L.promised_date,
    meta: { label: L.promised_date },
    cell: ({ row }) => (row.original.promised_date ? formatDate(row.original.promised_date) : dash),
  },
  {
    id: 'promised_amount',
    accessorKey: 'promised_amount',
    header: L.promised_amount,
    meta: { label: L.promised_amount, align: 'right' },
    cell: ({ row }) => (row.original.promised_amount === null ? dash : formatGHS(row.original.promised_amount)),
  },
  {
    id: 'contacted_at',
    accessorKey: 'contacted_at',
    header: L.contacted_at,
    meta: { label: L.contacted_at },
    cell: ({ row }) => (row.original.contacted_at ? formatDateTime(row.original.contacted_at) : dash),
  },
];

export const DEBTOR_HIDDEN_COLUMNS: Record<string, boolean> = {
  region: false,
  promised_date: false,
  promised_amount: false,
  contacted_at: false,
  comment: false,
};

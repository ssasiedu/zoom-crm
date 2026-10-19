import type { SheetColumn } from '@/components/ui';
import type { DebtorLine, DebtorLineKind } from '@/types';
import { formatDateTime, formatGHS } from '@/utils/format';

/** Titles for each drill-down, shared by the dashboard and the debtor page */
export const DEBTOR_SHEETS: Record<DebtorLineKind, { title: string; description: string }> = {
  outstanding: {
    title: 'Outstanding by account',
    description: 'Every account in this selection, what it owes and what has come in',
  },
  collected: {
    title: 'Payments received',
    description: 'Every individual payment that makes up the collected figure',
  },
  paid: {
    title: 'Customers who have paid',
    description: 'One row per customer with money against their account',
  },
};

const text = (v: string | null | undefined) => v ?? '';

/** One row per account: what it owes, what came in, what is left */
export const DEBTOR_ACCOUNT_COLUMNS: SheetColumn<DebtorLine>[] = [
  { key: 'name', header: 'Customer', render: (r) => <span className="font-medium">{r.customer_name}</span>, value: (r) => r.customer_name },
  {
    key: 'cid',
    header: 'Customer ID',
    render: (r) => <span className="font-mono text-xs">{text(r.customer_id)}</span>,
    value: (r) => text(r.customer_id),
  },
  { key: 'phone', header: 'Contact', render: (r) => text(r.contact_number), value: (r) => text(r.contact_number) },
  { key: 'community', header: 'Community', render: (r) => text(r.community), value: (r) => text(r.community) },
  { key: 'officer', header: 'Officer', render: (r) => text(r.officer), value: (r) => text(r.officer) },
  { key: 'outstanding', header: 'Outstanding', align: 'right', total: 'money', render: (r) => formatGHS(r.outstanding ?? 0), value: (r) => r.outstanding ?? 0 },
  { key: 'collected', header: 'Collected', align: 'right', total: 'money', render: (r) => formatGHS(r.collected ?? 0), value: (r) => r.collected ?? 0 },
  { key: 'owing', header: 'Still owing', align: 'right', total: 'money', render: (r) => formatGHS(r.still_owing ?? 0), value: (r) => r.still_owing ?? 0 },
  { key: 'feedback', header: 'Last outcome', render: (r) => text(r.feedback), value: (r) => text(r.feedback) },
  { key: 'calls', header: 'Calls', align: 'right', total: 'count', render: (r) => r.calls ?? 0, value: (r) => r.calls ?? 0 },
];

/** One row per payment, so part payments show separately */
export const DEBTOR_PAYMENT_COLUMNS: SheetColumn<DebtorLine>[] = [
  { key: 'paid_at', header: 'Paid on', render: (r) => formatDateTime(r.paid_at), value: (r) => formatDateTime(r.paid_at, '') },
  { key: 'name', header: 'Customer', render: (r) => <span className="font-medium">{r.customer_name}</span>, value: (r) => r.customer_name },
  {
    key: 'cid',
    header: 'Customer ID',
    render: (r) => <span className="font-mono text-xs">{text(r.customer_id)}</span>,
    value: (r) => text(r.customer_id),
  },
  { key: 'community', header: 'Community', render: (r) => text(r.community), value: (r) => text(r.community) },
  { key: 'officer', header: 'Officer', render: (r) => text(r.officer), value: (r) => text(r.officer) },
  { key: 'amount', header: 'Amount paid', align: 'right', total: 'money', render: (r) => <strong>{formatGHS(r.amount ?? 0)}</strong>, value: (r) => r.amount ?? 0 },
  { key: 'reference', header: 'Reference', render: (r) => text(r.reference), value: (r) => text(r.reference) },
  { key: 'feedback', header: 'Outcome', render: (r) => text(r.feedback), value: (r) => text(r.feedback) },
];

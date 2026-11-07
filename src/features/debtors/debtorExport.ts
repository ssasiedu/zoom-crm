import { DEBTOR_FIELD_LABELS } from '@/lib/constants';
import type { Debtor } from '@/types';
import { exportToCsv, exportToExcel, exportToPdf, type Cell, type ExportSheet } from '@/utils/export';
import { formatDate, formatDateTime, formatGHS } from '@/utils/format';
import { toLocalPhone } from '@/utils/phone';

const L = DEBTOR_FIELD_LABELS;

/** The eight columns of the monthly upload, in the order the business uses */
export const UPLOAD_COLUMNS = [
  'customer_id',
  'customer_name',
  'customer_type',
  'provider',
  'community',
  'contact_number',
  'outstanding_balance',
  'officer_name',
] as const;

const EXPORT_COLUMNS: { key: string; label: string; pdf?: boolean }[] = [
  { key: 'customer_id', label: L.customer_id, pdf: true },
  { key: 'customer_name', label: L.customer_name, pdf: true },
  { key: 'customer_type', label: L.customer_type },
  { key: 'provider', label: L.provider, pdf: true },
  { key: 'community', label: L.community, pdf: true },
  { key: 'region', label: L.region },
  { key: 'contact_number', label: L.contact_number, pdf: true },
  { key: 'outstanding_balance', label: L.outstanding_balance, pdf: true },
  { key: 'officer_name', label: L.officer_name, pdf: true },
  { key: 'amount_collected', label: L.amount_collected, pdf: true },
  { key: 'feedback', label: L.feedback, pdf: true },
  { key: 'comment', label: L.comment },
  { key: 'promised_amount', label: L.promised_amount },
  { key: 'promised_date', label: L.promised_date },
  { key: 'work_status', label: L.work_status },
  { key: 'contacted_at', label: L.contacted_at },
  { key: 'call_attempts', label: L.call_attempts },
];

function cell(d: Debtor, key: string, forPdf: boolean): Cell {
  switch (key) {
    case 'officer_name':
      return d.officer?.full_name ?? '';
    case 'contact_number':
      return d.contact_number ? toLocalPhone(d.contact_number) : '';
    case 'outstanding_balance':
      return forPdf ? formatGHS(d.outstanding_balance, { plain: true }) : Number(d.outstanding_balance);
    case 'amount_collected':
      return d.amount_collected === null ? '' : forPdf ? formatGHS(d.amount_collected, { plain: true }) : Number(d.amount_collected);
    case 'promised_amount':
      return d.promised_amount === null ? '' : forPdf ? formatGHS(d.promised_amount, { plain: true }) : Number(d.promised_amount);
    case 'promised_date':
      return d.promised_date ? formatDate(d.promised_date) : '';
    case 'contacted_at':
      return d.contacted_at ? formatDateTime(d.contacted_at) : '';
    default: {
      const v = (d as unknown as Record<string, unknown>)[key];
      return v === null || v === undefined ? '' : String(v);
    }
  }
}

export function debtorSheet(rows: Debtor[], forPdf: boolean): ExportSheet {
  const cols = forPdf ? EXPORT_COLUMNS.filter((c) => c.pdf) : EXPORT_COLUMNS;
  const outstanding = rows.reduce((s, r) => s + Number(r.outstanding_balance ?? 0), 0);
  const collected = rows.reduce((s, r) => s + Number(r.amount_collected ?? 0), 0);
  return {
    name: 'Debtors',
    head: cols.map((c) => c.label),
    rows: rows.map((r) => cols.map((c) => cell(r, c.key, forPdf))),
    foot: cols.map((c, i) => {
      if (i === 0) return `${rows.length} customers`;
      if (c.key === 'outstanding_balance') return forPdf ? formatGHS(outstanding, { plain: true }) : outstanding;
      if (c.key === 'amount_collected') return forPdf ? formatGHS(collected, { plain: true }) : collected;
      return '';
    }),
  };
}

export function exportDebtors(rows: Debtor[], fmt: 'xlsx' | 'csv' | 'pdf', subtitle?: string) {
  const options = {
    filename: 'debtor-list',
    title: 'Debtor call list',
    subtitle,
    sheets: [debtorSheet(rows, fmt === 'pdf')],
    orientation: 'landscape' as const,
  };
  if (fmt === 'xlsx') exportToExcel(options);
  else if (fmt === 'csv') exportToCsv(options);
  else exportToPdf(options);
}

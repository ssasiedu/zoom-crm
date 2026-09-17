import { FIELD_LABELS } from '@/lib/constants';
import type { TicketRow } from '@/types';
import { exportToCsv, exportToExcel, exportToPdf, type Cell } from '@/utils/export';
import { formatDate, formatDateTime, formatGHS } from '@/utils/format';
import { toLocalPhone } from '@/utils/phone';

/** Column order matches the business spreadsheet */
export const EXPORT_COLUMNS: { key: keyof TicketRow; label: string; pdf?: boolean }[] = [
  { key: 'ticket_number', label: FIELD_LABELS.ticket_number, pdf: true },
  { key: 'date_opened', label: FIELD_LABELS.date_opened, pdf: true },
  { key: 'client_name', label: FIELD_LABELS.client_name, pdf: true },
  { key: 'client_id', label: FIELD_LABELS.client_id, pdf: true },
  { key: 'contact_number', label: FIELD_LABELS.contact_number, pdf: true },
  { key: 'contact_type', label: FIELD_LABELS.contact_type },
  { key: 'community', label: FIELD_LABELS.community, pdf: true },
  { key: 'description', label: FIELD_LABELS.description },
  { key: 'issue_type', label: FIELD_LABELS.issue_type, pdf: true },
  { key: 'responsible_party', label: FIELD_LABELS.responsible_party },
  { key: 'due_date', label: FIELD_LABELS.due_date, pdf: true },
  { key: 'completion_date', label: FIELD_LABELS.completion_date },
  { key: 'payment_amount', label: FIELD_LABELS.payment_amount, pdf: true },
  { key: 'payment_source', label: FIELD_LABELS.payment_source },
  { key: 'payment_type', label: FIELD_LABELS.payment_type },
  { key: 'payment_status', label: FIELD_LABELS.payment_status },
  { key: 'status', label: FIELD_LABELS.status, pdf: true },
  { key: 'remarks', label: FIELD_LABELS.remarks },
  { key: 'region', label: FIELD_LABELS.region, pdf: true },
  { key: 'officer_name', label: FIELD_LABELS.officer_name, pdf: true },
  { key: 'reason_for_open_status', label: FIELD_LABELS.reason_for_open_status },
  { key: 'priority', label: FIELD_LABELS.priority },
];

function cell(t: TicketRow, key: keyof TicketRow, forPdf: boolean): Cell {
  const v = t[key];
  if (v === null || v === undefined) return '';
  switch (key) {
    case 'date_opened':
    case 'due_date':
      return formatDate(v as string);
    case 'completion_date':
      return formatDateTime(v as string, '');
    case 'contact_number':
      return toLocalPhone(v as string);
    case 'payment_amount':
      return forPdf ? formatGHS(v, { plain: true }) : Number(v);
    default:
      return String(v);
  }
}

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

export function exportTickets(rows: TicketRow[], fmt: ExportFormat, subtitle?: string) {
  const cols = fmt === 'pdf' ? EXPORT_COLUMNS.filter((c) => c.pdf) : EXPORT_COLUMNS;
  const total = rows.reduce((s, r) => s + (r.payment_amount ? Number(r.payment_amount) : 0), 0);
  const sheet = {
    name: 'Tickets',
    head: cols.map((c) => c.label),
    rows: rows.map((r) => cols.map((c) => cell(r, c.key, fmt === 'pdf'))),
    foot: cols.map((c, i) =>
      i === 0 ? `${rows.length} tickets` : c.key === 'payment_amount' ? (fmt === 'pdf' ? formatGHS(total, { plain: true }) : total) : '',
    ),
  };
  const options = {
    filename: 'tickets',
    title: 'DM CRM — Tickets',
    subtitle,
    sheets: [sheet],
  };
  if (fmt === 'xlsx') exportToExcel(options);
  else if (fmt === 'csv') exportToCsv(options);
  else exportToPdf(options);
}

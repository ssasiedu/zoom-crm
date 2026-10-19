import type { Priority, Role, TicketStatus } from '@/types';

export const APP_NAME = 'Zoomlion CRM';
export const APP_TAGLINE = 'Service & Debt Management';

export const STATUSES: TicketStatus[] = ['Open', 'In-Progress', 'Resolved', 'Closed'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export const ACTIVE_STATUSES: TicketStatus[] = ['Open', 'In-Progress'];
export const DONE_STATUSES: TicketStatus[] = ['Resolved', 'Closed'];

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full access, including users and settings' },
  { value: 'supervisor', label: 'Supervisor', description: 'All tickets, assignment, closing and reports' },
  { value: 'agent', label: 'Agent', description: 'Creates and assigns tickets' },
  { value: 'dm_officer', label: 'DM Officer', description: 'Works tickets assigned to them' },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agent',
  dm_officer: 'DM Officer',
};

/** Fallback when issue_types.requires_payment is unavailable */
export const PAYMENT_ISSUE_TYPES = ['PAYMENT ISSUE', 'PAYMENT ASSIST', 'UNREFLECTED PAYMENTS'];

/** Database column -> display label, exactly as the business uses them */
export const FIELD_LABELS: Record<string, string> = {
  ticket_number: 'Ticket No.',
  date_opened: 'DATE OPENED',
  client_name: 'CLIENT',
  client_id: 'CUSTOMER ID',
  contact_number: 'CONTACT NUMBER',
  contact_type: 'TYPE OF CONTACT',
  community: 'COMMUNITY',
  description: 'DESCRIPTION',
  issue_type: 'ISSUE TYPE',
  responsible_party: 'RESPONSIBLE PARTY',
  due_date: 'DUE DATE',
  completion_date: 'COMPLETION DATE',
  payment_amount: 'PAYMENT',
  payment_source: 'PAYMENT SOURCE',
  payment_type: 'PAYMENT TYPE',
  payment_status: 'PAYMENT STATUS',
  status: 'STATUS',
  remarks: 'REMARKS',
  region: 'Region',
  assigned_officer_id: 'OFFICER',
  officer_name: 'OFFICER',
  reason_for_open_status: 'REASON FOR OPEN STATUS',
  priority: 'Priority',
  reopen_reason: 'Reopen reason',
  created_by_name: 'Created by',
  created_at: 'Created',
  updated_at: 'Last updated',
  resolution_minutes: 'Resolution time',
  response_minutes: 'Waiting time',
  first_response_at: 'First worked on',
  sla_met: 'Within SLA',
};

/** Debtor list columns, named as they appear in the monthly spreadsheet */
export const DEBTOR_FIELD_LABELS: Record<string, string> = {
  customer_id: 'CUSTOMER ID',
  customer_name: 'CUSTOMER NAME',
  customer_type: 'CUSTOMER TYPE',
  provider: 'PROVIDER',
  community: 'COMMUNITY',
  contact_number: 'CONTACT NUMBER',
  outstanding_balance: 'OUTSTANDING BALANCE',
  officer_name: 'OFFICER',
  amount_collected: 'AMOUNT COLLECTED',
  feedback: 'FEEDBACK',
  comment: 'COMMENT',
  region: 'Region',
  promised_amount: 'Promised amount',
  promised_date: 'Promised date',
  work_status: 'Status',
  contacted_at: 'Last contacted',
  call_attempts: 'Call attempts',
};

export const DEBTOR_STATUS_TONE: Record<string, string> = {
  Pending: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/30',
  Worked: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  Collected:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
};

export const DEBTOR_STATUS_COLORS: Record<string, string> = {
  Pending: '#94a3b8',
  Worked: '#0ea5e9',
  Collected: '#10b981',
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  Open: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  'In-Progress':
    'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  Resolved:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  Closed: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/30',
};

export const STATUS_DOT: Record<TicketStatus, string> = {
  Open: 'bg-sky-500',
  'In-Progress': 'bg-amber-500',
  Resolved: 'bg-emerald-500',
  Closed: 'bg-slate-400',
};

/** Chart colours (hex so Recharts can use them) */
export const STATUS_COLORS: Record<TicketStatus, string> = {
  Open: '#0ea5e9',
  'In-Progress': '#f59e0b',
  Resolved: '#10b981',
  Closed: '#94a3b8',
};

export const PRIORITY_TONE: Record<Priority, string> = {
  Low: 'bg-slate-50 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25',
  Medium: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/30',
  High: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30',
  Urgent: 'bg-rose-50 text-rose-700 ring-rose-600/25 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/40',
};

export const CHART_PALETTE = [
  '#16804b',
  '#e5a50a',
  '#0ea5e9',
  '#e11d48',
  '#7c3aed',
  '#0d9488',
  '#f97316',
  '#64748b',
  '#84cc16',
  '#db2777',
  '#2563eb',
  '#a16207',
];

export const PAGE_SIZES = [10, 25, 50, 100];

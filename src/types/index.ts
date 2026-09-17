export type Role = 'admin' | 'supervisor' | 'agent' | 'dm_officer';
export type TicketStatus = 'Open' | 'In-Progress' | 'Resolved' | 'Closed';
export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  region: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Officer {
  id: string;
  full_name: string;
  profile_id: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfficerWorkload {
  id: string;
  full_name: string;
  region: string | null;
  is_active: boolean;
  profile_id: string | null;
  open_count: number;
  in_progress_count: number;
  overdue_count: number;
}

export interface LookupItem {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface IssueTypeItem extends LookupItem {
  sla_days: number;
  requires_payment: boolean;
}

export type LookupTable =
  | 'contact_types'
  | 'issue_types'
  | 'payment_sources'
  | 'payment_types'
  | 'payment_statuses'
  | 'regions';

export interface Lookups {
  contact_types: LookupItem[];
  issue_types: IssueTypeItem[];
  payment_sources: LookupItem[];
  payment_types: LookupItem[];
  payment_statuses: LookupItem[];
  regions: LookupItem[];
}

export interface Ticket {
  id: string;
  ticket_number: string;
  date_opened: string;
  client_name: string;
  client_id: string;
  contact_number: string;
  contact_type: string;
  community: string;
  description: string;
  issue_type: string;
  responsible_party: string | null;
  due_date: string;
  completion_date: string | null;
  payment_amount: number | null;
  payment_source: string | null;
  payment_type: string | null;
  payment_status: string | null;
  status: TicketStatus;
  remarks: string | null;
  region: string;
  assigned_officer_id: string | null;
  reason_for_open_status: string | null;
  priority: Priority;
  assignment_note: string | null;
  reopen_reason: string | null;
  reopened_at: string | null;
  reopen_count: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  assigned_at: string | null;
  assigned_by: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

/** Row from tickets_view */
export interface TicketRow extends Ticket {
  officer_name: string | null;
  officer_region: string | null;
  created_by_name: string | null;
  is_overdue: boolean;
  days_to_due: number;
}

export type TicketInsert = Partial<
  Omit<Ticket, 'id' | 'ticket_number' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>
> & {
  client_name: string;
  client_id: string;
  contact_number: string;
  contact_type: string;
  community: string;
  description: string;
  issue_type: string;
  region: string;
};

export type TicketUpdate = Partial<Omit<Ticket, 'id' | 'ticket_number' | 'created_at' | 'created_by'>>;

export interface TicketFilters {
  search?: string;
  status?: TicketStatus | TicketStatus[];
  region?: string;
  issue_type?: string;
  contact_type?: string;
  payment_source?: string;
  payment_type?: string;
  payment_status?: string;
  priority?: Priority;
  /** officer uuid or "unassigned" */
  officer?: string;
  community?: string;
  /** yyyy-MM-dd inclusive, applied to date_opened */
  from?: string;
  to?: string;
  /** yyyy-MM-dd inclusive, applied to due_date */
  dueFrom?: string;
  dueTo?: string;
  overdue?: boolean;
}

export interface SortSpec {
  id: string;
  desc: boolean;
}

export interface ActivityEntry {
  id: number;
  ticket_id: string;
  actor_id: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor?: { full_name: string } | null;
  ticket?: { ticket_number: string; client_name: string } | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: { full_name: string } | null;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  uploader?: { full_name: string } | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  ticket_id: string | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, string>;
  created_at: string;
}

export interface ClientLookupResult {
  id: string;
  ticket_number: string;
  client_name: string;
  client_id: string;
  contact_number: string;
  community: string;
  region: string;
  contact_type: string;
  issue_type: string;
  status: TicketStatus;
  date_opened: string;
  due_date: string;
}

/* ---------- Reporting ---------- */
export interface ReportFilters {
  /** yyyy-MM-dd inclusive */
  from?: string;
  /** yyyy-MM-dd inclusive */
  to?: string;
  region?: string;
  officer?: string;
  issueType?: string;
  contactType?: string;
}

export interface Kpis {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  overdue: number;
  unassigned: number;
  resolution_rate: number;
  avg_resolution_hours: number | null;
  total_payments: number;
  sla_compliance: number;
}

export interface TrendPoint {
  bucket: string;
  opened: number;
  resolved: number;
}

export interface BreakdownItem {
  label: string;
  count: number;
}

export interface StatusByRegionRow {
  region: string;
  sort_order: number;
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  overdue: number;
  resolution_rate: number;
  payments: number;
}

export interface IssueByRegionRow {
  region: string;
  issue_type: string;
  count: number;
}

export interface PaymentRow {
  region: string;
  payment_type: string;
  payment_source: string;
  payment_status: string;
  total: number;
  count: number;
}

export interface OfficerPerformanceRow {
  officer_id: string;
  officer_name: string;
  region: string | null;
  is_active: boolean;
  by_contact_type: Record<string, number>;
  total_assigned: number;
  resolved: number;
  active: number;
  resolution_rate: number;
  avg_resolution_hours: number | null;
  overdue: number;
  payments: number;
}

export interface AgingBuckets {
  d0_2: number;
  d3_7: number;
  d8_14: number;
  d15_plus: number;
  total: number;
}

export interface SlaAgingReport {
  totals: AgingBuckets;
  by_region: (AgingBuckets & { region: string; max_days: number })[];
  by_officer: (AgingBuckets & { officer_name: string })[];
}

export interface OfficerSummary {
  assigned: number;
  active: number;
  open: number;
  in_progress: number;
  overdue: number;
  due_today: number;
  resolved: number;
  resolved_this_month: number;
}

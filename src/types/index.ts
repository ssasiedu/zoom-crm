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

export interface DebtorFeedbackItem extends LookupItem {
  /** feedback that means money was or will be collected */
  is_positive: boolean;
}

export type LookupTable =
  | 'contact_types'
  | 'issue_types'
  | 'payment_sources'
  | 'payment_types'
  | 'payment_statuses'
  | 'regions'
  | 'customer_types'
  | 'providers'
  | 'debtor_feedback';

export interface Lookups {
  contact_types: LookupItem[];
  issue_types: IssueTypeItem[];
  payment_sources: LookupItem[];
  payment_types: LookupItem[];
  payment_statuses: LookupItem[];
  regions: LookupItem[];
  customer_types: LookupItem[];
  providers: LookupItem[];
  debtor_feedback: DebtorFeedbackItem[];
}

export interface Ticket {
  id: string;
  ticket_number: string;
  date_opened: string;
  client_name: string;
  /** CUSTOMER ID — optional */
  client_id: string | null;
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
  /** first time the ticket was worked on */
  first_response_at: string | null;
  /** raised → first worked on, in minutes (waiting time) */
  response_minutes: number | null;
  /** raised → completed, in minutes (turnaround time) */
  resolution_minutes: number | null;
}

/** Row from tickets_view */
export interface TicketRow extends Ticket {
  officer_name: string | null;
  officer_region: string | null;
  created_by_name: string | null;
  is_overdue: boolean;
  days_to_due: number;
  /** null while the ticket is still open */
  sla_met: boolean | null;
}

export type TicketInsert = Partial<
  Omit<Ticket, 'id' | 'ticket_number' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>
> & {
  client_name: string;
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
  client_id: string | null;
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

/* ---------- Settings and branding ---------- */
export interface Branding {
  app_name: string;
  tagline: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

export interface SmsSettings {
  enabled: boolean;
  provider: string;
  endpoint: string;
  /** masked in the UI; only admins can read it at all */
  api_key: string;
  sender_id: string;
  auto_send: boolean;
  is_schedule: boolean;
  schedule_date: string;
  daily_limit: number;
}

export interface AiSettings {
  enabled: boolean;
  provider: string;
  api_key: string;
  model: string;
  max_similar: number;
}

export type SettingsKey = 'branding' | 'sms' | 'ai';

/* ---------- SMS ---------- */
export type SmsEvent =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_in_progress'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ticket_reopened';

export interface SmsTemplate {
  id: number;
  code: string;
  name: string;
  body: string;
  event: SmsEvent | null;
  auto_send: boolean;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SmsStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface SmsMessage {
  id: string;
  ticket_id: string | null;
  debtor_id: string | null;
  recipient: string;
  recipient_name: string | null;
  message: string;
  template_code: string | null;
  trigger_event: string;
  status: SmsStatus;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  attempts: number;
  segments: number;
  requested_by: string | null;
  created_at: string;
  sent_at: string | null;
  ticket?: { ticket_number: string; client_name: string } | null;
}

export interface SmsStats {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  segments: number;
  today: number;
}

/* ---------- Debtor management ---------- */
export interface DebtorPeriod {
  id: string;
  /** first day of the month, yyyy-MM-dd */
  period_month: string;
  notes: string | null;
  status: 'open' | 'closed';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DebtorWorkStatus = 'Pending' | 'Worked' | 'Collected';

/** One recorded call on a debtor, which may carry a payment */
export interface DebtorCall {
  id: string;
  debtor_id: string;
  period_id: string;
  officer_id: string | null;
  called_at: string;
  feedback: string;
  amount_collected: number | null;
  payment_reference: string | null;
  promised_amount: number | null;
  promised_date: string | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  author?: { full_name: string } | null;
  officer?: { full_name: string } | null;
}

export type DebtorCallInsert = Pick<DebtorCall, 'debtor_id' | 'feedback'> &
  Partial<Pick<DebtorCall, 'called_at' | 'amount_collected' | 'payment_reference' | 'promised_amount' | 'promised_date' | 'comment'>>;

export type DebtorCallUpdate = Partial<
  Pick<DebtorCall, 'called_at' | 'feedback' | 'amount_collected' | 'payment_reference' | 'promised_amount' | 'promised_date' | 'comment'>
>;

export interface Debtor {
  id: string;
  period_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_type: string | null;
  provider: string | null;
  community: string | null;
  region: string | null;
  contact_number: string | null;
  outstanding_balance: number;
  officer_id: string | null;
  amount_collected: number | null;
  feedback: string | null;
  comment: string | null;
  promised_amount: number | null;
  promised_date: string | null;
  call_attempts: number;
  contacted_at: string | null;
  contacted_by: string | null;
  created_at: string;
  updated_at: string;
  work_status: DebtorWorkStatus;
  officer?: { full_name: string } | null;
  period?: { period_month: string } | null;
}

export type DebtorInsert = Omit<
  Debtor,
  'id' | 'created_at' | 'updated_at' | 'work_status' | 'call_attempts' | 'contacted_at' | 'contacted_by' | 'officer' | 'period'
> & { call_attempts?: number };

export type DebtorUpdate = Partial<
  Pick<
    Debtor,
    | 'customer_id'
    | 'customer_name'
    | 'customer_type'
    | 'provider'
    | 'community'
    | 'region'
    | 'contact_number'
    | 'outstanding_balance'
    | 'officer_id'
    | 'amount_collected'
    | 'feedback'
    | 'comment'
    | 'promised_amount'
    | 'promised_date'
  >
>;

export interface DebtorFilters {
  period?: string;
  officer?: string;
  provider?: string;
  customerType?: string;
  community?: string;
  region?: string;
  feedback?: string;
  workStatus?: DebtorWorkStatus;
  search?: string;
}

export interface DebtorSummary {
  customers: number;
  outstanding: number;
  collected: number;
  promised: number;
  worked: number;
  pending: number;
  collected_count: number;
  unassigned: number;
  contact_rate: number;
  collection_rate: number;
}

export interface OfficerDebtorSummary {
  customers: number;
  pending: number;
  worked: number;
  collected_count: number;
  outstanding: number;
  collected: number;
  promised: number;
  collection_rate: number;
  due_promises: number;
}

export interface DebtorOfficerRow {
  officer_id: string;
  officer_name: string;
  region: string | null;
  customers: number;
  outstanding: number;
  collected: number;
  promised: number;
  worked: number;
  pending: number;
  collected_count: number;
  contact_rate: number;
  collection_rate: number;
  by_feedback: Record<string, number>;
}

export type DebtorDimension = 'provider' | 'customer_type' | 'community' | 'region' | 'feedback' | 'work_status';

export interface DebtorBreakdownRow {
  label: string;
  customers: number;
  outstanding: number;
  collected: number;
  worked: number;
}

export interface DebtorTrendRow {
  period_month: string;
  customers: number;
  outstanding: number;
  collected: number;
  worked: number;
  collection_rate: number;
}

/* ---------- Turnaround ---------- */
export interface TurnaroundTotals {
  tickets: number;
  resolved: number;
  avg_resolution_minutes: number | null;
  median_resolution_minutes: number | null;
  p90_resolution_minutes: number | null;
  fastest_minutes: number | null;
  slowest_minutes: number | null;
  avg_response_minutes: number | null;
  median_response_minutes: number | null;
  total_minutes: number;
  within_sla: number;
}

export interface TurnaroundOfficerRow {
  officer_name: string;
  region: string | null;
  resolved: number;
  avg_resolution_minutes: number | null;
  median_resolution_minutes: number | null;
  avg_response_minutes: number | null;
  fastest_minutes: number | null;
  slowest_minutes: number | null;
  total_minutes: number;
  within_sla: number;
}

export interface TurnaroundGroupRow {
  label: string;
  resolved: number;
  avg_resolution_minutes: number | null;
  median_resolution_minutes?: number | null;
  avg_response_minutes: number | null;
  within_sla?: number;
}

export interface TurnaroundTrendRow {
  bucket: string;
  resolved: number;
  avg_resolution_minutes: number | null;
  avg_response_minutes: number | null;
}

export interface TurnaroundReport {
  totals: TurnaroundTotals;
  buckets: BreakdownItem[];
  by_officer: TurnaroundOfficerRow[];
  by_issue_type: TurnaroundGroupRow[];
  by_region: TurnaroundGroupRow[];
  by_contact_type: TurnaroundGroupRow[];
  trend: TurnaroundTrendRow[];
}

/* ---------- Resolution assistant ---------- */
export interface SimilarTicket {
  ticket_number: string;
  issue_type: string;
  community: string | null;
  region: string | null;
  contact_type: string | null;
  description: string;
  remarks: string | null;
  responsible_party: string | null;
  payment_type: string | null;
  payment_status: string | null;
  resolution_minutes: number | null;
  date_opened: string;
  score: number;
}

export interface IssuePlaybook {
  issue_type: string;
  tickets: number;
  resolved: number;
  sla_days: number | null;
  median_resolution_minutes: number | null;
  avg_resolution_minutes: number | null;
  within_sla: number;
  responsible_parties: BreakdownItem[];
  payment_types: BreakdownItem[];
  recent_resolutions: {
    ticket_number: string;
    remarks: string;
    resolution_minutes: number | null;
    date_opened: string;
  }[];
}

export interface AiSuggestion {
  summary: string;
  steps: string[];
  draft_response: string;
  watch_out: string;
  based_on: number;
  model: string | null;
}


/* ---------- Tickets and debtor calls together ---------- */
export interface CombinedTotals {
  ticket_outbound_calls: number;
  ticket_calls: number;
  debtor_calls: number;
  outbound_calls_total: number;
  calls_total: number;
  ticket_payments: number;
  debtor_collected: number;
  payments_total: number;
  debtor_payments_count: number;
}

export interface ContactMixItem {
  label: string;
  count: number;
  /** how many of those came from debtor calls rather than tickets */
  from_debtors: number;
}

export interface StaffWorkloadRow {
  officer_id: string;
  officer_name: string;
  region: string | null;
  is_active: boolean;
  tickets_assigned: number;
  tickets_resolved: number;
  tickets_active: number;
  tickets_overdue: number;
  ticket_calls: number;
  debtor_calls: number;
  debtors_contacted: number;
  total_calls: number;
  ticket_payments: number;
  debtor_collected: number;
  debtor_payments: number;
  total_collected: number;
  avg_resolution_minutes: number | null;
}

export interface StaffWorkloadTrendRow {
  bucket: string;
  ticket_calls: number;
  debtor_calls: number;
  total_calls: number;
  ticket_payments: number;
  debtor_collected: number;
  total_collected: number;
}

/* ---------- Drill-downs: the rows behind a total ---------- */
export interface PaymentLine {
  source: 'Ticket' | 'Debtor';
  reference: string | null;
  name: string;
  customer_id: string | null;
  contact_number: string | null;
  region: string | null;
  officer: string | null;
  at: string;
  amount: number;
  detail: string | null;
}

export type DebtorLineKind = 'outstanding' | 'collected' | 'paid';

export interface DebtorLine {
  customer_id: string | null;
  customer_name: string;
  customer_type: string | null;
  provider: string | null;
  community: string | null;
  region: string | null;
  contact_number: string | null;
  officer: string | null;
  /** outstanding / paid */
  outstanding?: number;
  collected?: number;
  still_owing?: number;
  work_status?: string;
  calls?: number;
  /** collected */
  amount?: number;
  reference?: string | null;
  paid_at?: string;
  comment?: string | null;
  feedback?: string | null;
}

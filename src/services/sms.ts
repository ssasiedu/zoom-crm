import { supabase } from '@/lib/supabase';
import type { SmsMessage, SmsStats, SmsTemplate, TicketRow } from '@/types';
import { formatDate, formatGHS, toNumber } from '@/utils/format';
import { toAppError, unwrap } from './errors';

export interface SendSmsInput {
  recipient: string;
  message: string;
  ticket_id?: string | null;
  debtor_id?: string | null;
  recipient_name?: string | null;
  template_code?: string | null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('send-sms', { body });
  if (error) {
    // the function answers with a JSON body carrying a friendly message
    let message = error.message || 'The SMS service could not be reached';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (payload?.error) message = payload.error;
    }
    throw toAppError({ message });
  }
  const payload = data as { error?: string } & T;
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    throw toAppError({ message: String(payload.error) });
  }
  return payload as T;
}

/** Characters per SMS part: 160 for plain GSM text, 70 when it contains unicode */
export function smsSegments(message: string): { segments: number; limit: number; unicode: boolean } {
  const unicode = /[^\x20-\x7E\n\r]/.test(message);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = message.length === 0 ? 0 : message.length <= single ? 1 : Math.ceil(message.length / multi);
  return { segments, limit: single, unicode };
}

/** Same placeholders as the database function, for live previews */
export function ticketSmsVars(ticket: TicketRow, companyName: string): Record<string, string> {
  return {
    ticket_number: ticket.ticket_number,
    client_name: ticket.client_name,
    first_name: ticket.client_name.trim().split(/\s+/)[0] ?? '',
    customer_id: ticket.client_id ?? '',
    contact_number: ticket.contact_number,
    issue_type: ticket.issue_type,
    status: ticket.status,
    community: ticket.community,
    region: ticket.region,
    description: ticket.description,
    remarks: ticket.remarks ?? '',
    responsible_party: ticket.responsible_party ?? '',
    due_date: formatDate(ticket.due_date),
    date_opened: formatDate(ticket.date_opened),
    completion_date: ticket.completion_date ? formatDate(ticket.completion_date) : '',
    payment_amount: ticket.payment_amount === null ? '' : formatGHS(ticket.payment_amount, { plain: true }),
    officer: ticket.officer_name ?? '',
    company: companyName,
  };
}

export function applyPlaceholders(body: string, vars: Record<string, string>): string {
  return Object.entries(vars)
    .reduce((text, [key, value]) => text.split(`{${key}}`).join(value ?? ''), body ?? '')
    .replace(/\{[a-z_]+\}/g, '')
    .trim();
}

export const PLACEHOLDERS = [
  'first_name',
  'client_name',
  'ticket_number',
  'customer_id',
  'issue_type',
  'status',
  'community',
  'region',
  'due_date',
  'completion_date',
  'payment_amount',
  'officer',
  'remarks',
  'company',
] as const;

const numeric = (m: SmsMessage): SmsMessage => ({
  ...m,
  attempts: toNumber(m.attempts),
  segments: toNumber(m.segments),
});

export const smsService = {
  async templates(): Promise<SmsTemplate[]> {
    return (unwrap(
      await supabase.from('sms_templates').select('*').order('sort_order').order('name'),
    ) ?? []) as SmsTemplate[];
  },

  async saveTemplate(values: Partial<SmsTemplate> & { id?: number }): Promise<SmsTemplate> {
    const { id, ...rest } = values;
    if (id) {
      return unwrap(await supabase.from('sms_templates').update(rest).eq('id', id).select().single()) as SmsTemplate;
    }
    return unwrap(await supabase.from('sms_templates').insert(rest).select().single()) as SmsTemplate;
  },

  async removeTemplate(id: number) {
    unwrap(await supabase.from('sms_templates').delete().eq('id', id));
  },

  async forTicket(ticketId: string): Promise<SmsMessage[]> {
    const rows = (unwrap(
      await supabase
        .from('sms_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false }),
    ) ?? []) as SmsMessage[];
    return rows.map(numeric);
  },

  async log(filters: { status?: string; search?: string; from?: string; to?: string } = {}, limit = 200) {
    let query = supabase
      .from('sms_messages')
      .select('*, ticket:tickets(ticket_number, client_name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.search) query = query.or(`recipient.ilike.%${filters.search}%,message.ilike.%${filters.search}%`);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    const rows = (unwrap(await query) ?? []) as SmsMessage[];
    return rows.map(numeric);
  },

  async stats(days = 30): Promise<SmsStats> {
    const d = (unwrap(await supabase.rpc('sms_stats', { p_days: days })) ?? {}) as Record<string, unknown>;
    return {
      total: toNumber(d.total),
      sent: toNumber(d.sent),
      pending: toNumber(d.pending),
      failed: toNumber(d.failed),
      segments: toNumber(d.segments),
      today: toNumber(d.today),
    };
  },

  /** Whether an admin has switched SMS on and saved an API key */
  async isEnabled(): Promise<boolean> {
    const { data, error } = await supabase.rpc('sms_enabled');
    if (error) return false;
    return Boolean(data);
  },

  send(input: SendSmsInput) {
    return invoke<{ id: string; recipient: string; segments: number }>({ action: 'send', ...input });
  },

  sendTest(recipient: string, message: string) {
    return invoke<{ id: string }>({ action: 'test', recipient, message });
  },

  /** Push everything the database triggers queued through the provider */
  dispatch(limit = 25) {
    return invoke<{ dispatched: number; sent: number; failed: number }>({ action: 'dispatch', limit });
  },

  /** Fire-and-forget: used after ticket mutations so auto-SMS leave promptly */
  dispatchQuietly() {
    void supabase.functions.invoke('send-sms', { body: { action: 'dispatch', limit: 25 } }).catch(() => undefined);
  },
};

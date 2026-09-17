import { supabase } from '@/lib/supabase';
import type { ActivityEntry } from '@/types';
import { exclusiveEndISO, startOfDayISO } from '@/utils/dateRange';
import { toAppError, unwrap } from './errors';

export interface AuditFilters {
  action?: string;
  actorId?: string;
  ticketNumber?: string;
  from?: string;
  to?: string;
}

const SELECT = '*, actor:profiles!ticket_activity_actor_id_fkey(full_name), ticket:tickets!inner(ticket_number, client_name)';

export const activityService = {
  async forTicket(ticketId: string): Promise<ActivityEntry[]> {
    return unwrap(
      await supabase
        .from('ticket_activity')
        .select('*, actor:profiles!ticket_activity_actor_id_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    ) as ActivityEntry[];
  },

  async recent(limit = 12): Promise<ActivityEntry[]> {
    return unwrap(
      await supabase.from('ticket_activity').select(SELECT).order('created_at', { ascending: false }).limit(limit),
    ) as ActivityEntry[];
  },

  async audit(filters: AuditFilters, page: number, pageSize: number): Promise<{ rows: ActivityEntry[]; count: number }> {
    let q = supabase.from('ticket_activity').select(SELECT, { count: 'exact' });
    if (filters.action) q = q.eq('action', filters.action);
    if (filters.actorId) q = q.eq('actor_id', filters.actorId);
    if (filters.ticketNumber?.trim()) {
      q = q.ilike('ticket.ticket_number', `%${filters.ticketNumber.trim().replace(/[%_]/g, '')}%`);
    }
    if (filters.from) q = q.gte('created_at', startOfDayISO(filters.from));
    if (filters.to) q = q.lt('created_at', exclusiveEndISO(filters.to));
    const from = page * pageSize;
    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw toAppError(error);
    return { rows: (data ?? []) as ActivityEntry[], count: count ?? 0 };
  },
};

export const ACTIVITY_ACTIONS = [
  'created',
  'assigned',
  'reassigned',
  'unassigned',
  'status_changed',
  'reopened',
  'updated',
  'commented',
  'attachment_added',
  'attachment_removed',
];

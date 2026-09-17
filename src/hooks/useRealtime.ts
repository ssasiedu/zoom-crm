import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { AppNotification } from '@/types';
import { useAuth } from './useAuth';

/**
 * One app-wide realtime subscription. Ticket changes invalidate lists,
 * dashboards and reports (debounced); new notifications show a toast.
 */
export function useRealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const timer = useRef<number | undefined>(undefined);
  const pendingTickets = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;

    const flush = () => {
      queryClient.invalidateQueries({ queryKey: qk.tickets });
      queryClient.invalidateQueries({ queryKey: qk.myTickets });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      queryClient.invalidateQueries({ queryKey: qk.reports });
      queryClient.invalidateQueries({ queryKey: qk.workload });
      pendingTickets.current.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: qk.ticket(id) });
        queryClient.invalidateQueries({ queryKey: qk.activity(id) });
      });
      pendingTickets.current.clear();
    };
    const schedule = (ticketId?: string) => {
      if (ticketId) pendingTickets.current.add(ticketId);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 600);
    };

    const channel = supabase
      .channel(`app-sync-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
        const row = (payload.new && 'id' in payload.new ? payload.new : payload.old) as { id?: string };
        schedule(row?.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments' }, (payload) => {
        const row = (payload.new && 'ticket_id' in payload.new ? payload.new : payload.old) as { ticket_id?: string };
        if (row?.ticket_id) {
          queryClient.invalidateQueries({ queryKey: qk.comments(row.ticket_id) });
          queryClient.invalidateQueries({ queryKey: qk.activity(row.ticket_id) });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_attachments' }, (payload) => {
        const row = (payload.new && 'ticket_id' in payload.new ? payload.new : payload.old) as { ticket_id?: string };
        if (row?.ticket_id) {
          queryClient.invalidateQueries({ queryKey: qk.attachments(row.ticket_id) });
          queryClient.invalidateQueries({ queryKey: qk.activity(row.ticket_id) });
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: qk.notifications });
          if (payload.eventType === 'INSERT') {
            const n = payload.new as AppNotification;
            toast(n.message, { description: 'New notification' });
            // a new assignment means the officer's queue changed
            schedule(n.ticket_id ?? undefined);
          }
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}

import { supabase } from '@/lib/supabase';
import type { TicketComment } from '@/types';
import { unwrap } from './errors';

export const commentsService = {
  async list(ticketId: string): Promise<TicketComment[]> {
    return unwrap(
      await supabase
        .from('ticket_comments')
        .select('*, author:profiles!ticket_comments_author_id_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
    ) as TicketComment[];
  },

  async add(ticketId: string, body: string, authorId: string): Promise<TicketComment> {
    return unwrap(
      await supabase
        .from('ticket_comments')
        .insert({ ticket_id: ticketId, body: body.trim(), author_id: authorId })
        .select('*, author:profiles!ticket_comments_author_id_fkey(full_name)')
        .single(),
    ) as TicketComment;
  },

  async remove(id: string): Promise<void> {
    unwrap(await supabase.from('ticket_comments').delete().eq('id', id));
  },
};

import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/types';
import { toAppError, unwrap } from './errors';

export const notificationsService = {
  async list(userId: string, limit = 30): Promise<AppNotification[]> {
    return unwrap(
      await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
    ) as AppNotification[];
  },

  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw toAppError(error);
    return count ?? 0;
  },

  async markRead(id: string): Promise<void> {
    unwrap(await supabase.from('notifications').update({ is_read: true }).eq('id', id));
  },

  async markAllRead(userId: string): Promise<void> {
    unwrap(
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false),
    );
  },

  async remove(id: string): Promise<void> {
    unwrap(await supabase.from('notifications').delete().eq('id', id));
  },

  async clearRead(userId: string): Promise<void> {
    unwrap(await supabase.from('notifications').delete().eq('user_id', userId).eq('is_read', true));
  },
};

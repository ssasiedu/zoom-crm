import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { notificationsService } from '@/services/notifications';

export function useNotifications(limit = 30) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const uid = user?.id ?? '';

  const list = useQuery({
    queryKey: [...qk.notifications, 'list', uid, limit],
    queryFn: () => notificationsService.list(uid, limit),
    enabled: Boolean(uid),
    refetchInterval: 120_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.notifications });
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const markRead = useMutation({ mutationFn: notificationsService.markRead, onSuccess: invalidate, onError });
  const markAllRead = useMutation({
    mutationFn: () => notificationsService.markAllRead(uid),
    onSuccess: invalidate,
    onError,
  });
  const remove = useMutation({ mutationFn: notificationsService.remove, onSuccess: invalidate, onError });
  const clearRead = useMutation({
    mutationFn: () => notificationsService.clearRead(uid),
    onSuccess: invalidate,
    onError,
  });

  const items = list.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;
  return { ...list, items, unread, markRead, markAllRead, remove, clearRead };
}

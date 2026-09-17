import { useNavigate } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { Button, EmptyState, Menu, Spinner } from '@/components/ui';
import type { AppNotification } from '@/types';
import { NotificationItem } from './NotificationItem';
import { useNotifications } from './useNotifications';

export function NotificationBell() {
  const navigate = useNavigate();
  const { items, unread, isLoading, markRead, markAllRead } = useNotifications(15);

  const open = (n: AppNotification, close: () => void) => {
    if (!n.is_read) markRead.mutate(n.id);
    close();
    if (n.ticket_id) navigate(`/tickets/${n.ticket_id}`);
  };

  return (
    <Menu
      label="Notifications"
      trigger={({ toggle, ref, open: isOpen }) => (
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-950">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      )}
    >
      {(close) => (
        <div className="w-[min(22rem,calc(100vw-1.5rem))]">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <Button variant="ghost" size="xs" onClick={() => markAllRead.mutate()} leftIcon={<CheckCheck className="size-3.5" />}>
                Mark all read
              </Button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto p-1">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <EmptyState compact icon={<Bell />} title="You're all caught up" description="New assignments will appear here." />
            ) : (
              items.map((n) => <NotificationItem key={n.id} n={n} onOpen={(x) => open(x, close)} />)
            )}
          </div>
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                close();
                navigate('/notifications');
              }}
              className="w-full rounded-md py-2 text-center text-sm font-medium text-brand-700 hover:bg-slate-50 dark:text-brand-400 dark:hover:bg-slate-800"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </Menu>
  );
}

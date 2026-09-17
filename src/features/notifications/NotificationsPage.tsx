import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Tabs, TableSkeleton } from '@/components/ui';
import { errorMessage } from '@/services/errors';
import { NotificationItem } from './NotificationItem';
import { useNotifications } from './useNotifications';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const { items, unread, isLoading, error, refetch, markRead, markAllRead, remove, clearRead } = useNotifications(200);
  const shown = tab === 'unread' ? items.filter((n) => !n.is_read) : items;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, comments and status changes on your tickets."
        actions={
          <>
            <Button variant="secondary" leftIcon={<CheckCheck className="size-4" />} disabled={!unread} onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
            <Button
              variant="ghost"
              leftIcon={<Trash2 className="size-4" />}
              disabled={!items.some((n) => n.is_read)}
              onClick={() => clearRead.mutate()}
            >
              Clear read
            </Button>
          </>
        }
      />
      <Card>
        <Tabs
          className="px-3"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All', count: items.length },
            { value: 'unread', label: 'Unread', count: unread },
          ]}
        />
        {isLoading ? (
          <TableSkeleton rows={6} cols={2} />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<Bell />} title="No notifications" description="You're all caught up." />
        ) : (
          <ul className="divide-y p-2 dark:divide-slate-800">
            {shown.map((n) => (
              <li key={n.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <NotificationItem
                    n={n}
                    onOpen={(x) => {
                      if (!x.is_read) markRead.mutate(x.id);
                      if (x.ticket_id) navigate(`/tickets/${x.ticket_id}`);
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete notification"
                  className="opacity-60 group-hover:opacity-100"
                  onClick={() => remove.mutate(n.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

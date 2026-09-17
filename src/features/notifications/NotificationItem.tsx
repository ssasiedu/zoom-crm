import { Bell, MessageSquare, RotateCcw, UserPlus, UserMinus, CheckCircle2 } from 'lucide-react';
import type { AppNotification } from '@/types';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

const ICONS: Record<string, typeof Bell> = {
  assignment: UserPlus,
  reassignment: UserPlus,
  unassignment: UserMinus,
  comment: MessageSquare,
  reopened: RotateCcw,
  resolved: CheckCircle2,
};

export function NotificationItem({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const Icon = ICONS[n.type] ?? Bell;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60',
        !n.is_read && 'bg-brand-50/60 dark:bg-brand-500/5',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          n.is_read
            ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            : 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', !n.is_read && 'font-medium text-slate-900 dark:text-white')}>{n.message}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{formatRelative(n.created_at)}</span>
      </span>
      {!n.is_read && <span className="mt-2 size-2 shrink-0 rounded-full bg-gold-500" aria-label="Unread" />}
    </button>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CirclePlus,
  MessageSquare,
  Paperclip,
  Pencil,
  RotateCcw,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { qk } from '@/lib/queryClient';
import { activityService } from '@/services/activity';
import { errorMessage } from '@/services/errors';
import type { ActivityEntry } from '@/types';
import { FIELD_LABELS } from '@/lib/constants';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { formatDateTime, formatGHS, formatDate, formatRelative } from '@/utils/format';

const ICONS: Record<string, typeof Pencil> = {
  created: CirclePlus,
  assigned: UserCheck,
  reassigned: ArrowRightLeft,
  unassigned: UserMinus,
  status_changed: ArrowRightLeft,
  reopened: RotateCcw,
  updated: Pencil,
  commented: MessageSquare,
  attachment_added: Paperclip,
  attachment_removed: Paperclip,
};

function fmtValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'payment_amount') return formatGHS(value);
  if (key === 'due_date') return formatDate(String(value));
  if (key.endsWith('_date') || key.endsWith('_at') || key === 'date_opened') return formatDateTime(String(value));
  return String(value);
}

export function describeActivity(a: ActivityEntry): { title: string; details?: string[] } {
  const nv = (a.new_value ?? {}) as Record<string, unknown>;
  const ov = (a.old_value ?? {}) as Record<string, unknown>;
  switch (a.action) {
    case 'created':
      return { title: `created ticket ${nv.ticket_number ?? ''}` };
    case 'assigned':
      return { title: `assigned to ${nv.officer ?? 'an officer'}` };
    case 'reassigned':
      return { title: `reassigned from ${ov.officer ?? '—'} to ${nv.officer ?? '—'}` };
    case 'unassigned':
      return { title: `unassigned ${ov.officer ?? ''}` };
    case 'status_changed':
      return { title: `changed status from ${ov.status} to ${nv.status}` };
    case 'reopened':
      return { title: `reopened the ticket (${ov.status} → ${nv.status})` };
    case 'commented':
      return { title: 'commented', details: nv.excerpt ? [String(nv.excerpt)] : undefined };
    case 'attachment_added':
      return { title: `attached ${nv.file_name ?? 'a file'}` };
    case 'attachment_removed':
      return { title: `removed attachment ${ov.file_name ?? ''}` };
    case 'updated':
      return {
        title: `updated ${Object.keys(nv).length} field${Object.keys(nv).length === 1 ? '' : 's'}`,
        details: Object.keys(nv).map(
          (k) => `${FIELD_LABELS[k] ?? k}: ${fmtValue(k, ov[k])} → ${fmtValue(k, nv[k])}`,
        ),
      };
    default:
      return { title: a.action.replace(/_/g, ' ') };
  }
}

export function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.activity(ticketId),
    queryFn: () => activityService.forTicket(ticketId),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (data.length === 0) return <EmptyState compact title="No history yet" />;

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
      {data.map((a) => {
        const Icon = ICONS[a.action] ?? Pencil;
        const { title, details } = describeActivity(a);
        return (
          <li key={a.id} className="relative">
            <span className="absolute top-0 -left-[31px] flex size-6 items-center justify-center rounded-full border-2 border-white bg-brand-100 text-brand-700 dark:border-slate-950 dark:bg-brand-500/20 dark:text-brand-300">
              <Icon className="size-3" aria-hidden />
            </span>
            <p className="text-sm">
              <span className="font-semibold">{a.actor?.full_name ?? 'System'}</span> {title}
            </p>
            {a.note && <p className="mt-0.5 text-sm text-slate-600 italic dark:text-slate-400">“{a.note}”</p>}
            {details && (
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                {details.map((d, i) => (
                  <li key={i} className="break-words">
                    {d}
                  </li>
                ))}
              </ul>
            )}
            <time dateTime={a.created_at} title={formatDateTime(a.created_at)} className="text-xs text-slate-400">
              {formatDateTime(a.created_at)} · {formatRelative(a.created_at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

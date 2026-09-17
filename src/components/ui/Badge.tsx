import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { PRIORITY_TONE, STATUS_DOT, STATUS_TONE } from '@/lib/constants';
import type { Priority, Ticket, TicketStatus } from '@/types';
import { cn } from '@/utils/cn';
import { dueLabel, getDueState } from '@/utils/tickets';

export type BadgeTone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'gold' | 'violet';

const TONES: Record<BadgeTone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  gold: 'bg-yellow-50 text-yellow-800 ring-yellow-600/25 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-400/30',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30',
};

const BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset';

export function Badge({ tone = 'gray', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn(BASE, TONES[tone], className)}>{children}</span>;
}

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span className={cn(BASE, STATUS_TONE[status], className)}>
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn(BASE, PRIORITY_TONE[priority], className)}>
      {priority === 'Urgent' && <AlertTriangle className="size-3" aria-hidden />}
      {priority}
    </span>
  );
}

/** Overdue = red, due within 48h = amber, on track = green */
export function DueBadge({ ticket, className }: { ticket: Pick<Ticket, 'status' | 'due_date'>; className?: string }) {
  const state = getDueState(ticket);
  const tone: BadgeTone =
    state === 'overdue' ? 'red' : state === 'today' || state === 'soon' ? 'amber' : state === 'ok' ? 'green' : 'gray';
  const Icon = state === 'overdue' ? AlertTriangle : state === 'done' ? CheckCircle2 : Clock;
  return (
    <Badge tone={tone} className={className}>
      <Icon className="size-3" aria-hidden />
      {dueLabel(ticket)}
    </Badge>
  );
}

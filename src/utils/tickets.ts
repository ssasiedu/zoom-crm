import { differenceInCalendarDays, parseISO, startOfToday } from 'date-fns';
import type { Lookups, Ticket, TicketStatus } from '@/types';
import { DONE_STATUSES, PAYMENT_ISSUE_TYPES } from '@/lib/constants';

export type DueState = 'overdue' | 'today' | 'soon' | 'ok' | 'done';

export function daysUntilDue(dueDate: string): number {
  return differenceInCalendarDays(parseISO(dueDate), startOfToday());
}

/** Overdue = due date has passed; soon = due within 48h (red / amber / green badges) */
export function getDueState(t: Pick<Ticket, 'status' | 'due_date'>): DueState {
  if (DONE_STATUSES.includes(t.status)) return 'done';
  const days = daysUntilDue(t.due_date);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 2) return 'soon';
  return 'ok';
}

export function isOverdue(t: Pick<Ticket, 'status' | 'due_date'>): boolean {
  return getDueState(t) === 'overdue';
}

export function dueLabel(t: Pick<Ticket, 'status' | 'due_date'>): string {
  const days = daysUntilDue(t.due_date);
  switch (getDueState(t)) {
    case 'overdue':
      return `Overdue ${Math.abs(days)}d`;
    case 'today':
      return 'Due today';
    case 'soon':
      return days === 1 ? 'Due tomorrow' : `Due in ${days}d`;
    case 'ok':
      return `Due in ${days}d`;
    default:
      return 'Done';
  }
}

export function requiresPayment(issueType: string | null | undefined, lookups?: Lookups | null): boolean {
  if (!issueType) return false;
  const match = lookups?.issue_types.find((i) => i.name === issueType);
  if (match) return match.requires_payment;
  return PAYMENT_ISSUE_TYPES.includes(issueType);
}

/** Forward transitions the current user may make from a status */
export function nextStatuses(current: TicketStatus, canClose: boolean): TicketStatus[] {
  switch (current) {
    case 'Open':
      return ['In-Progress'];
    case 'In-Progress':
      return ['Resolved'];
    case 'Resolved':
      return canClose ? ['Closed'] : [];
    default:
      return [];
  }
}

export function slaDaysFor(issueType: string | null | undefined, lookups?: Lookups | null): number {
  return lookups?.issue_types.find((i) => i.name === issueType)?.sla_days ?? 3;
}

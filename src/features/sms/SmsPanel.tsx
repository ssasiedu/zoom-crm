import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Clock, MessageSquare, Send, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranding, useSmsEnabled } from '@/hooks/useSettings';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { smsService, ticketSmsVars, PLACEHOLDERS } from '@/services/sms';
import type { SmsMessage, TicketRow } from '@/types';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { SendSmsDialog } from './SendSmsDialog';

const STATUS_ICON = {
  sent: CheckCheck,
  pending: Clock,
  failed: TriangleAlert,
  cancelled: TriangleAlert,
} as const;

const STATUS_TONE = {
  sent: 'green',
  pending: 'amber',
  failed: 'red',
  cancelled: 'gray',
} as const;

export function SmsMessageItem({ m }: { m: SmsMessage }) {
  const Icon = STATUS_ICON[m.status] ?? Clock;
  return (
    <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone={STATUS_TONE[m.status]}>
          <Icon className="mr-1 inline size-3" />
          {m.status}
        </Badge>
        <span>{formatDateTime(m.sent_at ?? m.created_at)}</span>
        {m.trigger_event !== 'manual' && <Badge>{m.trigger_event.replace(/_/g, ' ')}</Badge>}
        {m.segments > 1 && <span>{m.segments} parts</span>}
      </div>
      <p className="mt-1.5 text-sm whitespace-pre-wrap">{m.message}</p>
      {m.error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{m.error}</p>}
    </li>
  );
}

/** Message history plus the Send SMS button, shown on a ticket */
export function SmsPanel({ ticket }: { ticket: TicketRow }) {
  const { can } = useAuth();
  const branding = useBranding();
  const smsEnabled = useSmsEnabled();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.smsForTicket(ticket.id),
    queryFn: () => smsService.forTicket(ticket.id),
  });

  return (
    <div className="space-y-3">
      {can('sms:send') && smsEnabled && (
        <Button
          className="w-full"
          variant="secondary"
          leftIcon={<Send className="size-4" />}
          onClick={() => setOpen(true)}
          disabled={!ticket.contact_number}
        >
          Send SMS to {ticket.client_name.split(' ')[0]}
        </Button>
      )}

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          compact
          icon={<MessageSquare />}
          title="No messages yet"
          description={
            smsEnabled
              ? 'Messages sent to this customer appear here.'
              : 'SMS is switched off. An administrator can turn it on under Administration → SMS.'
          }
        />
      ) : (
        <ul className={cn('space-y-2')}>
          {data.map((m) => (
            <SmsMessageItem key={m.id} m={m} />
          ))}
        </ul>
      )}

      <SendSmsDialog
        open={open}
        onClose={() => setOpen(false)}
        recipient={ticket.contact_number}
        recipientName={ticket.client_name}
        ticketId={ticket.id}
        vars={ticketSmsVars(ticket, branding.app_name)}
        placeholders={[...PLACEHOLDERS]}
      />
    </div>
  );
}

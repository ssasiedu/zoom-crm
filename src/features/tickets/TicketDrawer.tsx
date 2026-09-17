import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { useTicket } from '@/hooks/useTickets';
import { errorMessage } from '@/services/errors';
import { Drawer, ErrorState, PageSkeleton } from '@/components/ui';
import { TicketDetail } from './TicketDetail';

/** Quick-view panel used by ticket lists */
export function TicketDrawer({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const { data: ticket, isLoading, error, refetch } = useTicket(ticketId);
  return (
    <Drawer
      open={Boolean(ticketId)}
      onClose={onClose}
      width="lg"
      title={ticket ? `${ticket.ticket_number} · ${ticket.client_name}` : 'Ticket'}
      subtitle={ticket ? `${ticket.issue_type} · ${ticket.community}, ${ticket.region}` : undefined}
      actions={
        ticketId && (
          <Link
            to={`/tickets/${ticketId}`}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Open full page"
            title="Open full page"
          >
            <ExternalLink className="size-5" />
          </Link>
        )
      }
    >
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <PageSkeleton />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : ticket ? (
          <TicketDetail ticket={ticket} variant="drawer" />
        ) : null}
      </div>
    </Drawer>
  );
}

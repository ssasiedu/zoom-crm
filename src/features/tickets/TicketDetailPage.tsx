import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTicket } from '@/hooks/useTickets';
import { useBranding } from '@/hooks/useSettings';
import { errorMessage } from '@/services/errors';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui';
import { homePathFor } from '@/lib/permissions';
import { formatDateTime } from '@/utils/format';
import { TicketDetail } from './TicketDetail';

export default function TicketDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { role, can } = useAuth();
  const branding = useBranding();
  const { data: ticket, isLoading, error, refetch } = useTicket(id);
  const back = can('tickets:list') ? '/tickets' : homePathFor(role);

  useEffect(() => {
    if (ticket) document.title = `${ticket.ticket_number} · ${branding.app_name}`;
    return () => {
      document.title = branding.app_name;
    };
  }, [ticket, branding.app_name]);

  useEffect(() => {
    if (ticket && params.get('print') === '1') {
      const t = window.setTimeout(() => window.print(), 600);
      return () => window.clearTimeout(t);
    }
  }, [ticket, params]);

  if (isLoading) return <PageSkeleton />;
  if (error) {
    const notFound = (error as { code?: string }).code === 'PGRST116';
    return notFound ? (
      <EmptyState
        icon={<FileQuestion />}
        title="Ticket not found"
        description="It may have been deleted, or it isn't assigned to you."
        action={
          <Link to={back} className="text-sm font-medium text-brand-700 hover:underline">
            Back to tickets
          </Link>
        }
      />
    ) : (
      <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
    );
  }
  if (!ticket) return null;

  return (
    <div>
      <Link to={back} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div className="mb-4 hidden border-b pb-3 print:block">
        <p className="text-lg font-bold">{branding.app_name} — Ticket record</p>
        <p className="text-xs">Printed {formatDateTime(new Date())}</p>
      </div>
      <TicketDetail ticket={ticket} />
    </div>
  );
}

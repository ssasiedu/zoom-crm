import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { MessageCircle, Pencil, Phone, Printer, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useInvalidateTickets } from '@/hooks/useTickets';
import { FIELD_LABELS } from '@/lib/constants';
import { errorMessage } from '@/services/errors';
import { ticketsService } from '@/services/tickets';
import type { TicketRow } from '@/types';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DueBadge,
  PriorityBadge,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { formatDate, formatDateTime, formatGHS } from '@/utils/format';
import { formatPhone, telLink, whatsappLink } from '@/utils/phone';
import { ActivityTimeline } from './ActivityTimeline';
import { AssignDialog } from './AssignDialog';
import { AttachmentsPanel } from './AttachmentsPanel';
import { CommentsPanel } from './CommentsPanel';
import { EditTicketDrawer } from './EditTicketModal';
import { WorkPanel } from './WorkPanel';

const L = FIELD_LABELS;

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-slate-900 dark:text-slate-100">{children ?? '—'}</dd>
    </div>
  );
}

export function ContactActions({ ticket, size = 'sm' }: { ticket: TicketRow; size?: 'xs' | 'sm' }) {
  const msg = `Hello ${ticket.client_name}, this is regarding your ticket ${ticket.ticket_number}.`;
  return (
    <div className="no-print flex gap-1.5">
      <a
        href={telLink(ticket.contact_number)}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 items-center gap-1.5 rounded-control bg-brand-700 px-2.5 text-sm font-medium text-white hover:bg-brand-800"
        aria-label={`Call ${ticket.client_name}`}
      >
        <Phone className="size-4" /> {size === 'sm' && 'Call'}
      </a>
      <a
        href={whatsappLink(ticket.contact_number, msg)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 items-center gap-1.5 rounded-control bg-[#25D366] px-2.5 text-sm font-medium text-white hover:bg-[#1eb457]"
        aria-label={`WhatsApp ${ticket.client_name}`}
      >
        <MessageCircle className="size-4" /> {size === 'sm' && 'WhatsApp'}
      </a>
    </div>
  );
}

export function TicketDetail({ ticket, variant = 'page' }: { ticket: TicketRow; variant?: 'page' | 'drawer' }) {
  const { can, role, user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateTickets();
  const [tab, setTab] = useState<'activity' | 'comments' | 'files'>('activity');
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwnAgentTicket = role === 'agent' && ticket.created_by === user?.id;
  const canEdit = can('tickets:editCore') || isOwnAgentTicket;
  const canAssign = can('tickets:assign') && (role !== 'agent' || isOwnAgentTicket);
  const isDone = ticket.status === 'Resolved' || ticket.status === 'Closed';

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={ticket.status} />
      <PriorityBadge priority={ticket.priority} />
      <DueBadge ticket={ticket} />
      {ticket.reopen_count > 0 && (
        <span className="text-xs text-slate-500">Reopened {ticket.reopen_count}×</span>
      )}
    </div>
  );

  const actions = (
    <div className="no-print flex flex-wrap gap-2">
      <ContactActions ticket={ticket} />
      {canAssign && !isDone && (
        <Button variant="secondary" size="sm" leftIcon={<UserCheck className="size-4" />} onClick={() => setAssignOpen(true)}>
          {ticket.assigned_officer_id ? 'Reassign' : 'Assign'}
        </Button>
      )}
      {canEdit && ticket.status !== 'Closed' && (
        <Button variant="secondary" size="sm" leftIcon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      )}
      <Button variant="ghost" size="sm" leftIcon={<Printer className="size-4" />} onClick={() => (variant === 'page' ? window.print() : window.open(`/tickets/${ticket.id}?print=1`, '_blank'))}>
        Print
      </Button>
      {can('tickets:delete') && (
        <Button variant="ghost" size="sm" className="text-rose-600" leftIcon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {variant === 'page' ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-semibold text-brand-700 dark:text-brand-400">{ticket.ticket_number}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{ticket.client_name}</h1>
            <div className="mt-2">{header}</div>
          </div>
          {actions}
        </div>
      ) : (
        <div className="space-y-3">
          {header}
          {actions}
        </div>
      )}

      <div className={variant === 'page' ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]' : 'space-y-5'}>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Ticket details" description={`Opened ${formatDateTime(ticket.date_opened)} by ${ticket.created_by_name ?? 'import / system'}`} />
            <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              <Item label={L.ticket_number}>
                <span className="font-mono">{ticket.ticket_number}</span>
              </Item>
              <Item label={L.date_opened}>{formatDate(ticket.date_opened)}</Item>
              <Item label={L.due_date}>{formatDate(ticket.due_date)}</Item>
              <Item label={L.client_name}>{ticket.client_name}</Item>
              <Item label={L.client_id}>
                <span className="font-mono">{ticket.client_id}</span>
              </Item>
              <Item label={L.contact_number}>{formatPhone(ticket.contact_number)}</Item>
              <Item label={L.contact_type}>{ticket.contact_type}</Item>
              <Item label={L.community}>{ticket.community}</Item>
              <Item label={L.region}>{ticket.region}</Item>
              <Item label={L.issue_type}>{ticket.issue_type}</Item>
              <Item label={L.responsible_party}>{ticket.responsible_party}</Item>
              <Item label={L.officer_name}>
                {ticket.officer_name ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={ticket.officer_name} size="xs" />
                    {ticket.officer_name}
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">Unassigned</span>
                )}
              </Item>
              <Item label={L.description} wide>
                <span className="whitespace-pre-wrap">{ticket.description}</span>
              </Item>
              {(ticket.payment_amount !== null || ticket.payment_type) && (
                <>
                  <Item label={L.payment_amount}>
                    <span className="font-semibold tabular-nums">{ticket.payment_amount !== null ? formatGHS(ticket.payment_amount) : '—'}</span>
                  </Item>
                  <Item label={L.payment_source}>{ticket.payment_source}</Item>
                  <Item label={L.payment_type}>{ticket.payment_type}</Item>
                  <Item label={L.payment_status}>{ticket.payment_status}</Item>
                </>
              )}
              <Item label={L.status}>{ticket.status}</Item>
              <Item label={L.completion_date}>{formatDateTime(ticket.completion_date)}</Item>
              {ticket.reason_for_open_status && <Item label={L.reason_for_open_status}>{ticket.reason_for_open_status}</Item>}
              {ticket.reopen_reason && <Item label="Last reopen reason">{ticket.reopen_reason}</Item>}
              <Item label={L.remarks} wide>
                <span className="whitespace-pre-wrap">{ticket.remarks}</span>
              </Item>
            </dl>
          </Card>

          <Card className="no-print">
            <CardHeader title="Progress" description="Update status, resolution and payment details." />
            <div className="p-4 sm:p-5">
              <WorkPanel ticket={ticket} />
            </div>
          </Card>
        </div>

        <Card className="no-print h-fit">
          <Tabs
            className="px-3"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'activity', label: 'History' },
              { value: 'comments', label: 'Comments' },
              { value: 'files', label: 'Attachments' },
            ]}
          />
          <div className="p-4">
            {tab === 'activity' && <ActivityTimeline ticketId={ticket.id} />}
            {tab === 'comments' && <CommentsPanel ticketId={ticket.id} />}
            {tab === 'files' && <AttachmentsPanel ticketId={ticket.id} />}
          </div>
        </Card>
      </div>

      {/* print-only history */}
      <div className="hidden print:block">
        <h2 className="mb-2 text-base font-semibold">History</h2>
        <ActivityTimeline ticketId={ticket.id} />
      </div>

      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        ticketIds={[ticket.id]}
        currentOfficerId={ticket.assigned_officer_id}
        region={ticket.region}
      />
      {canEdit && <EditTicketDrawer ticket={ticket} open={editOpen} onClose={() => setEditOpen(false)} />}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${ticket.ticket_number}?`}
        message="This permanently deletes the ticket, its comments, attachments records and history. This cannot be undone."
        confirmLabel="Delete ticket"
        reasonLabel={undefined}
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await ticketsService.remove(ticket.id);
            toast.success(`${ticket.ticket_number} deleted`);
            invalidate();
            setDeleteOpen(false);
            navigate('/tickets');
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}

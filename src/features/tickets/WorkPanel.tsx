import { useEffect, useState } from 'react';
import { CheckCircle2, Lock, PlayCircle, RotateCcw, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toOptions, useLookups } from '@/hooks/useLookups';
import { useUpdateTicket } from '@/hooks/useTickets';
import { FIELD_LABELS } from '@/lib/constants';
import type { TicketRow, TicketStatus, TicketUpdate } from '@/types';
import { Button, ConfirmDialog, Field, Input, Select, Textarea } from '@/components/ui';
import { emptyToNull, fromInputDateTime, toInputDateTime } from '@/utils/format';
import { getDueState, requiresPayment } from '@/utils/tickets';

const L = FIELD_LABELS;

interface WorkValues {
  completion_date: string;
  remarks: string;
  reason_for_open_status: string;
  payment_amount: string;
  payment_source: string;
  payment_type: string;
  payment_status: string;
}

function fromTicket(t: TicketRow): WorkValues {
  return {
    completion_date: toInputDateTime(t.completion_date),
    remarks: t.remarks ?? '',
    reason_for_open_status: t.reason_for_open_status ?? '',
    payment_amount: t.payment_amount === null ? '' : String(t.payment_amount),
    payment_source: t.payment_source ?? '',
    payment_type: t.payment_type ?? '',
    payment_status: t.payment_status ?? '',
  };
}

/**
 * Resolution workflow: officers move Open → In-Progress → Resolved;
 * managers close and reopen. Validation mirrors the database trigger.
 */
export function WorkPanel({ ticket }: { ticket: TicketRow }) {
  const { can, role, officerId } = useAuth();
  const { active, lookups } = useLookups();
  const update = useUpdateTicket();
  const [v, setV] = useState<WorkValues>(() => fromTicket(ticket));
  const [errors, setErrors] = useState<Partial<Record<keyof WorkValues, string>>>({});
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null);

  useEffect(() => {
    setV(fromTicket(ticket));
    setErrors({});
  }, [ticket]);

  const isAssignedToMe = Boolean(officerId && ticket.assigned_officer_id === officerId);
  const canWork = can('tickets:close') || (role === 'dm_officer' && isAssignedToMe);
  const canClose = can('tickets:close');
  const isDone = ticket.status === 'Resolved' || ticket.status === 'Closed';
  const overdue = getDueState(ticket) === 'overdue';
  const needsPayment = requiresPayment(ticket.issue_type, lookups);

  if (!canWork) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900">
        <Lock className="size-4" />
        {role === 'agent'
          ? 'Agents can edit and assign tickets they created. The assigned officer updates progress.'
          : 'Only the assigned officer, supervisors and admins can update progress.'}
      </p>
    );
  }

  const set = (k: keyof WorkValues) => (e: { target: { value: string } }) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const validate = (target: TicketStatus): boolean => {
    const err: Partial<Record<keyof WorkValues, string>> = {};
    if (target === 'Resolved' || target === 'Closed') {
      if (!v.remarks.trim()) err.remarks = 'REMARKS are required to resolve a ticket';
      if (v.completion_date && new Date(v.completion_date) < new Date(ticket.date_opened)) {
        err.completion_date = 'Cannot be before DATE OPENED';
      }
      if (v.completion_date && new Date(v.completion_date) > new Date(Date.now() + 5 * 60_000)) {
        err.completion_date = 'Cannot be in the future';
      }
    } else if (overdue && !v.reason_for_open_status.trim()) {
      err.reason_for_open_status = 'Required because this ticket is overdue';
    }
    if (needsPayment) {
      if (!v.payment_amount.trim()) err.payment_amount = 'Required';
      if (!v.payment_source) err.payment_source = 'Required';
      if (!v.payment_type) err.payment_type = 'Required';
      if (!v.payment_status) err.payment_status = 'Required';
    }
    if (v.payment_amount.trim() && !(Number(v.payment_amount.replace(/,/g, '')) >= 0)) err.payment_amount = 'Invalid amount';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const buildPatch = (status: TicketStatus, extra: TicketUpdate = {}): TicketUpdate => {
    const patch: TicketUpdate = { ...extra };
    const remarks = emptyToNull(v.remarks);
    if (remarks !== (ticket.remarks ?? null)) patch.remarks = remarks;
    const reason = emptyToNull(v.reason_for_open_status);
    if (reason !== (ticket.reason_for_open_status ?? null)) patch.reason_for_open_status = reason;
    const completion = status === 'Resolved' || status === 'Closed' ? fromInputDateTime(v.completion_date) : null;
    if (status === 'Resolved' && ticket.status !== 'Resolved') patch.completion_date = completion ?? new Date().toISOString();
    else if ((status === 'Resolved' || status === 'Closed') && completion && completion !== ticket.completion_date) {
      patch.completion_date = completion;
    }
    const amount = v.payment_amount.trim() === '' ? null : Math.round(Number(v.payment_amount.replace(/,/g, '')) * 100) / 100;
    if (amount !== (ticket.payment_amount === null ? null : Number(ticket.payment_amount))) patch.payment_amount = amount;
    (['payment_source', 'payment_type', 'payment_status'] as const).forEach((k) => {
      const nv = emptyToNull(v[k]);
      if (nv !== (ticket[k] ?? null)) patch[k] = nv;
    });
    if (status !== ticket.status) patch.status = status;
    return patch;
  };

  const run = (status: TicketStatus, extra?: TicketUpdate) => {
    if (!validate(status)) return;
    const patch = buildPatch(status, extra);
    if (Object.keys(patch).length === 0) return;
    update.mutate(
      { id: ticket.id, values: patch },
      { onSuccess: () => setConfirm(null) },
    );
  };

  const target = ticket.status;
  const showCompletion = ticket.status === 'In-Progress' || isDone;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {showCompletion && (
          <Field
            label={L.completion_date}
            htmlFor="completion_date"
            error={errors.completion_date}
            hint={isDone ? undefined : 'Leave empty to use the time you mark it resolved'}
          >
            <Input
              id="completion_date"
              type="datetime-local"
              value={v.completion_date}
              onChange={set('completion_date')}
              invalid={!!errors.completion_date}
              disabled={ticket.status === 'Closed' && !canClose}
            />
          </Field>
        )}
        {!isDone && (
          <Field
            label={L.reason_for_open_status}
            htmlFor="reason_for_open_status"
            required={overdue}
            highlight={overdue}
            error={errors.reason_for_open_status}
            hint={overdue ? 'This ticket is overdue — explain why it is still open.' : undefined}
            className={showCompletion ? '' : 'sm:col-span-2'}
          >
            <Input id="reason_for_open_status" value={v.reason_for_open_status} onChange={set('reason_for_open_status')} invalid={!!errors.reason_for_open_status} />
          </Field>
        )}
        <Field label={L.remarks} htmlFor="remarks" error={errors.remarks} className="sm:col-span-2" hint="Required to resolve. Describe the action taken.">
          <Textarea id="remarks" rows={3} value={v.remarks} onChange={set('remarks')} invalid={!!errors.remarks} />
        </Field>
      </div>

      {(needsPayment || ticket.payment_amount !== null) && (
        <div className="grid gap-4 rounded-lg border border-gold-400/50 p-3 sm:grid-cols-2">
          <Field label={`${L.payment_amount} (GH₵)`} htmlFor="w-payment_amount" required={needsPayment} error={errors.payment_amount}>
            <Input id="w-payment_amount" inputMode="decimal" value={v.payment_amount} onChange={set('payment_amount')} invalid={!!errors.payment_amount} />
          </Field>
          <Field label={L.payment_source} htmlFor="w-payment_source" required={needsPayment} error={errors.payment_source}>
            <Select id="w-payment_source" placeholder="Select" value={v.payment_source} onChange={set('payment_source')} options={toOptions(active.payment_sources)} invalid={!!errors.payment_source} />
          </Field>
          <Field label={L.payment_type} htmlFor="w-payment_type" required={needsPayment} error={errors.payment_type}>
            <Select id="w-payment_type" placeholder="Select" value={v.payment_type} onChange={set('payment_type')} options={toOptions(active.payment_types)} invalid={!!errors.payment_type} />
          </Field>
          <Field label={L.payment_status} htmlFor="w-payment_status" required={needsPayment} error={errors.payment_status}>
            <Select id="w-payment_status" placeholder="Select" value={v.payment_status} onChange={set('payment_status')} options={toOptions(active.payment_statuses)} invalid={!!errors.payment_status} />
          </Field>
        </div>
      )}

      <div className="no-print flex flex-wrap gap-2">
        {ticket.status !== 'Closed' && (
          <Button variant="secondary" leftIcon={<Save className="size-4" />} loading={update.isPending} onClick={() => run(target)}>
            Save changes
          </Button>
        )}
        {ticket.status === 'Open' && (
          <Button leftIcon={<PlayCircle className="size-4" />} loading={update.isPending} onClick={() => run('In-Progress')}>
            Start work
          </Button>
        )}
        {ticket.status === 'In-Progress' && (
          <Button variant="success" leftIcon={<CheckCircle2 className="size-4" />} loading={update.isPending} onClick={() => run('Resolved')}>
            Mark resolved
          </Button>
        )}
        {ticket.status === 'Resolved' && canClose && (
          <Button leftIcon={<Lock className="size-4" />} onClick={() => validate('Closed') && setConfirm('close')}>
            Close ticket
          </Button>
        )}
        {isDone && can('tickets:reopen') && (
          <Button variant="outline" leftIcon={<RotateCcw className="size-4" />} onClick={() => setConfirm('reopen')}>
            Reopen
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'close'}
        onClose={() => setConfirm(null)}
        tone="primary"
        title={`Close ${ticket.ticket_number}?`}
        message="Closed tickets are final. Only supervisors and admins can reopen them."
        confirmLabel="Close ticket"
        loading={update.isPending}
        onConfirm={() => run('Closed')}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        onClose={() => setConfirm(null)}
        tone="primary"
        title={`Reopen ${ticket.ticket_number}?`}
        message="The completion date will be cleared and the officer notified."
        reasonLabel="Reason for reopening"
        confirmLabel="Reopen"
        loading={update.isPending}
        onConfirm={(reason) =>
          update.mutate(
            { id: ticket.id, values: { status: 'Open', reopen_reason: reason ?? '', completion_date: null } },
            { onSuccess: () => setConfirm(null) },
          )
        }
      />
    </div>
  );
}

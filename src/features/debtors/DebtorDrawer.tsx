import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  HandCoins,
  History,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Receipt,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAddDebtorCall, useDebtorCalls, useRemoveDebtorCall } from '@/hooks/useDebtors';
import { useLookups } from '@/hooks/useLookups';
import { useBranding, useSmsEnabled } from '@/hooks/useSettings';
import { DEBTOR_FIELD_LABELS } from '@/lib/constants';
import { errorMessage } from '@/services/errors';
import type { Debtor, DebtorCall, DebtorCallInsert } from '@/types';
import { Badge, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatGHS } from '@/utils/format';
import { formatPhone, telLink, whatsappLink } from '@/utils/phone';
import { SendSmsDialog } from '@/features/sms/SendSmsDialog';
import { WorkStatusBadge } from './debtorColumns';

const L = DEBTOR_FIELD_LABELS;

interface FormValues {
  feedback: string;
  amount_collected: string;
  payment_reference: string;
  comment: string;
  promised_amount: string;
  promised_date: string;
}

const EMPTY_FORM: FormValues = {
  feedback: '',
  amount_collected: '',
  payment_reference: '',
  comment: '',
  promised_amount: '',
  promised_date: '',
};

const money = (v: string): number | null => {
  const t = v.trim().replace(/,/g, '');
  return t === '' ? null : Math.round(Number(t) * 100) / 100;
};

/** One entry in the call history */
function CallEntry({
  call,
  canRemove,
  onRemove,
}: {
  call: DebtorCall;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const paid = call.amount_collected !== null && call.amount_collected > 0;
  return (
    <li className="group relative pl-6">
      <span
        aria-hidden
        className={cn(
          'absolute top-1.5 left-0 flex size-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900',
          paid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
        )}
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-semibold">{call.feedback}</span>
        {paid && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <Receipt className="size-3.5" />
            {formatGHS(call.amount_collected)}
          </span>
        )}
        <time className="text-xs text-slate-500">{formatDateTime(call.called_at)}</time>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this call"
            className="ml-auto text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 focus:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {call.payment_reference && (
        <p className="text-xs text-slate-500">Reference {call.payment_reference}</p>
      )}
      {call.promised_date && (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <CalendarClock className="size-3" />
          Promised {call.promised_amount ? formatGHS(call.promised_amount) : 'payment'} by {formatDate(call.promised_date)}
        </p>
      )}
      {call.comment && <p className="mt-0.5 text-sm break-words text-slate-600 dark:text-slate-300">{call.comment}</p>}
      <p className="text-xs text-slate-400">{call.author?.full_name ?? call.officer?.full_name ?? 'Unknown'}</p>
    </li>
  );
}

/** Open a debtor record: see every call so far, and add the latest one */
export function DebtorDrawer({
  debtor,
  open,
  onClose,
  onSaved,
}: {
  debtor: Debtor | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { can, officerId, role } = useAuth();
  const { active } = useLookups();
  const branding = useBranding();
  const smsEnabled = useSmsEnabled();
  const debtorId = debtor?.id ?? '';
  const calls = useDebtorCalls(open ? debtorId : null);
  const addCall = useAddDebtorCall(debtorId);
  const removeCall = useRemoveDebtorCall(debtorId);
  const [v, setV] = useState<FormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<DebtorCall | null>(null);

  useEffect(() => {
    setV(EMPTY_FORM);
    setError(null);
    setAdding(false);
  }, [debtorId, open]);

  const history = useMemo(() => calls.data ?? [], [calls.data]);
  const collected = useMemo(
    () => history.reduce((sum, c) => sum + (c.amount_collected ?? 0), 0),
    [history],
  );

  if (!debtor) return null;

  const isMine = Boolean(officerId && debtor.officer_id === officerId);
  const canEdit = role === 'admin' || role === 'supervisor' || isMine;
  const isManager = role === 'admin' || role === 'supervisor';
  const positiveFeedback = active.debtor_feedback.find((f) => f.name === v.feedback)?.is_positive ?? false;
  const remaining = Math.max(0, debtor.outstanding_balance - collected);

  const save = () => {
    const amount = money(v.amount_collected);
    if (!v.feedback) {
      setError('Choose a feedback reason');
      return;
    }
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setError('Enter a valid amount collected');
      return;
    }
    const input: DebtorCallInsert = {
      debtor_id: debtor.id,
      feedback: v.feedback,
      amount_collected: amount,
      payment_reference: v.payment_reference.trim() || null,
      comment: v.comment.trim() || null,
      promised_amount: money(v.promised_amount),
      promised_date: v.promised_date || null,
    };
    addCall.mutate(input, {
      onSuccess: () => {
        setV(EMPTY_FORM);
        setAdding(false);
        onSaved?.();
      },
    });
  };

  const smsVars = {
    first_name: debtor.customer_name.split(' ')[0] ?? '',
    client_name: debtor.customer_name,
    customer_id: debtor.customer_id ?? '',
    community: debtor.community ?? '',
    region: debtor.region ?? '',
    outstanding: formatGHS(remaining, { plain: true }),
    officer: debtor.officer?.full_name ?? '',
    company: branding.app_name,
  };

  const showForm = canEdit && (adding || history.length === 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={debtor.customer_name}
      subtitle={`${formatGHS(debtor.outstanding_balance)} outstanding${debtor.customer_id ? ` · ${debtor.customer_id}` : ''}`}
      footer={
        canEdit && showForm ? (
          /* Left-aligned: hosting badges and chat widgets sit in the
             bottom-right corner and used to cover the save button. */
          <div className="flex flex-wrap justify-start gap-2 pr-40 sm:pr-48">
            <Button leftIcon={<Save className="size-4" />} loading={addCall.isPending} onClick={save}>
              Save call result
            </Button>
            <Button variant="secondary" onClick={history.length ? () => setAdding(false) : onClose}>
              Cancel
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <WorkStatusBadge status={debtor.work_status} />
          {debtor.customer_type && <Badge>{debtor.customer_type}</Badge>}
          {debtor.provider && <Badge tone="violet">{debtor.provider}</Badge>}
          {history.length > 0 && (
            <Badge tone="gray">
              {history.length} call{history.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>

        {/* Where the balance stands after everything collected so far */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border bg-slate-200 dark:bg-slate-800">
          {[
            { label: 'Outstanding', value: formatGHS(debtor.outstanding_balance), tone: '' },
            { label: 'Collected', value: formatGHS(collected), tone: 'text-emerald-700 dark:text-emerald-400' },
            {
              label: 'Still owing',
              value: formatGHS(remaining),
              tone: remaining === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
            },
          ].map((s) => (
            <div key={s.label} className="bg-white px-3 py-2.5 text-center dark:bg-slate-900">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{s.label}</p>
              <p className={cn('text-sm font-bold tabular-nums', s.tone)}>{s.value}</p>
            </div>
          ))}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">{L.contact_number}</dt>
            <dd>{debtor.contact_number ? formatPhone(debtor.contact_number) : <span className="text-slate-400">no number</span>}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">{L.community}</dt>
            <dd className="flex items-center gap-1">
              <MapPin className="size-3.5 text-slate-400" />
              {debtor.community ?? '—'}
              {debtor.region ? `, ${debtor.region}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">{L.officer_name}</dt>
            <dd className="flex items-center gap-1">
              <User className="size-3.5 text-slate-400" />
              {debtor.officer?.full_name ?? 'Unassigned'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">{L.contacted_at}</dt>
            <dd>{debtor.contacted_at ? formatDateTime(debtor.contacted_at) : '—'}</dd>
          </div>
        </dl>

        {debtor.contact_number && (
          <div className="flex flex-wrap gap-2">
            <a
              href={telLink(debtor.contact_number)}
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800"
            >
              <Phone className="size-4" /> Call
            </a>
            <a
              href={whatsappLink(
                debtor.contact_number,
                `Hello ${debtor.customer_name}, this is ${branding.app_name} regarding your outstanding balance of ${formatGHS(remaining, { plain: true })}.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-[#25D366] px-3 text-sm font-medium text-white hover:bg-[#1eb457]"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            {can('sms:send') && smsEnabled && (
              <Button variant="secondary" leftIcon={<MessageSquare className="size-4" />} onClick={() => setSmsOpen(true)}>
                SMS
              </Button>
            )}
          </div>
        )}

        {/* Add a call. Each one is kept, so a promise followed by two part
            payments leaves all three on the record. */}
        {showForm && (
          <div className="space-y-4 rounded-panel border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-500/5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <HandCoins className="size-4" /> {history.length ? 'Record another call' : 'Call result'}
            </p>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L.feedback} htmlFor="d-feedback" required>
                <Select
                  id="d-feedback"
                  placeholder="Select feedback"
                  value={v.feedback}
                  onChange={(e) => setV({ ...v, feedback: e.target.value })}
                  options={active.debtor_feedback.map((f) => ({ value: f.name, label: f.name }))}
                />
              </Field>
              <Field
                label={`${L.amount_collected} (GH₵)`}
                htmlFor="d-amount"
                hint={remaining > 0 ? `${formatGHS(remaining)} still owing` : undefined}
              >
                <Input
                  id="d-amount"
                  inputMode="decimal"
                  value={v.amount_collected}
                  onChange={(e) => setV({ ...v, amount_collected: e.target.value })}
                  placeholder="0.00"
                />
              </Field>
              {money(v.amount_collected) !== null && (
                <Field label="Payment reference" htmlFor="d-reference" hint="Momo or bank reference, if there is one">
                  <Input
                    id="d-reference"
                    value={v.payment_reference}
                    onChange={(e) => setV({ ...v, payment_reference: e.target.value })}
                    placeholder="e.g. MOMO-884213"
                  />
                </Field>
              )}
              {(positiveFeedback || v.promised_amount || v.promised_date) && (
                <>
                  <Field label="Promised amount (GH₵)" htmlFor="d-promised">
                    <Input
                      id="d-promised"
                      inputMode="decimal"
                      value={v.promised_amount}
                      onChange={(e) => setV({ ...v, promised_amount: e.target.value })}
                    />
                  </Field>
                  <Field label="Promised date" htmlFor="d-promised-date">
                    <Input
                      id="d-promised-date"
                      type="date"
                      value={v.promised_date}
                      onChange={(e) => setV({ ...v, promised_date: e.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label={L.comment} htmlFor="d-comment" className="sm:col-span-2">
                <Textarea
                  id="d-comment"
                  rows={3}
                  value={v.comment}
                  onChange={(e) => setV({ ...v, comment: e.target.value })}
                  placeholder="What did the customer say?"
                />
              </Field>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" /> Call history
            </p>
            {canEdit && !showForm && (
              <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Record a call
              </Button>
            )}
          </div>

          {calls.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : calls.error ? (
            <ErrorState message={errorMessage(calls.error)} onRetry={() => calls.refetch()} />
          ) : history.length === 0 ? (
            <EmptyState compact title="No calls recorded yet" description="Every call you log is kept here with its payment." />
          ) : (
            <ol className="space-y-4 border-l border-slate-200 pl-2 dark:border-slate-800">
              {history.map((c) => (
                <CallEntry
                  key={c.id}
                  call={c}
                  canRemove={isManager}
                  onRemove={() => setToRemove(c)}
                />
              ))}
            </ol>
          )}
        </div>

        {!canEdit && <p className="text-xs text-slate-500">This record is assigned to another officer.</p>}
      </div>

      <ConfirmDialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        loading={removeCall.isPending}
        title="Remove this call?"
        message="The call and any payment recorded on it are deleted, and the customer's totals are worked out again."
        confirmLabel="Remove"
        onConfirm={() =>
          toRemove &&
          removeCall.mutate(toRemove.id, {
            onSuccess: () => {
              setToRemove(null);
              onSaved?.();
            },
          })
        }
      />

      <SendSmsDialog
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        recipient={debtor.contact_number}
        recipientName={debtor.customer_name}
        debtorId={debtor.id}
        vars={smsVars}
        placeholders={['first_name', 'client_name', 'customer_id', 'outstanding', 'community', 'officer', 'company']}
      />
    </Drawer>
  );
}

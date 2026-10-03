import { useEffect, useState } from 'react';
import { CalendarClock, HandCoins, MapPin, MessageCircle, MessageSquare, Phone, Save, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateDebtor } from '@/hooks/useDebtors';
import { useLookups } from '@/hooks/useLookups';
import { useBranding, useSmsEnabled } from '@/hooks/useSettings';
import { DEBTOR_FIELD_LABELS } from '@/lib/constants';
import type { Debtor, DebtorUpdate } from '@/types';
import { Badge, Button, Drawer, Field, Input, Select, Textarea } from '@/components/ui';
import { formatDate, formatDateTime, formatGHS, toInputDate } from '@/utils/format';
import { formatPhone, telLink, whatsappLink } from '@/utils/phone';
import { SendSmsDialog } from '@/features/sms/SendSmsDialog';
import { WorkStatusBadge } from './debtorColumns';

const L = DEBTOR_FIELD_LABELS;

interface FormValues {
  amount_collected: string;
  feedback: string;
  comment: string;
  promised_amount: string;
  promised_date: string;
}

const EMPTY_FORM: FormValues = {
  amount_collected: '',
  feedback: '',
  comment: '',
  promised_amount: '',
  promised_date: '',
};

const fromDebtor = (d: Debtor): FormValues => ({
  amount_collected: d.amount_collected === null ? '' : String(d.amount_collected),
  feedback: d.feedback ?? '',
  comment: d.comment ?? '',
  promised_amount: d.promised_amount === null ? '' : String(d.promised_amount),
  promised_date: toInputDate(d.promised_date),
});

const money = (v: string): number | null => {
  const t = v.trim().replace(/,/g, '');
  return t === '' ? null : Math.round(Number(t) * 100) / 100;
};

/** Open a debtor record and log the outcome of the call */
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
  const update = useUpdateDebtor();
  const [v, setV] = useState<FormValues>(() => (debtor ? fromDebtor(debtor) : EMPTY_FORM));
  const [error, setError] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);

  useEffect(() => {
    if (debtor) setV(fromDebtor(debtor));
    setError(null);
  }, [debtor]);

  if (!debtor) return null;

  const isMine = Boolean(officerId && debtor.officer_id === officerId);
  const canEdit = role === 'admin' || role === 'supervisor' || isMine;
  const positiveFeedback = active.debtor_feedback.find((f) => f.name === v.feedback)?.is_positive ?? false;
  const amount = money(v.amount_collected);

  const save = () => {
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setError('Enter a valid amount collected');
      return;
    }
    if (amount !== null && amount > 0 && !v.feedback) {
      setError('Choose a feedback reason to go with the amount collected');
      return;
    }
    const values: DebtorUpdate = {
      amount_collected: amount,
      feedback: v.feedback || null,
      comment: v.comment.trim() || null,
      promised_amount: money(v.promised_amount),
      promised_date: v.promised_date || null,
    };
    update.mutate(
      { id: debtor.id, values },
      {
        onSuccess: () => {
          onSaved?.();
          onClose();
        },
      },
    );
  };

  const smsVars = {
    first_name: debtor.customer_name.split(' ')[0] ?? '',
    client_name: debtor.customer_name,
    customer_id: debtor.customer_id ?? '',
    community: debtor.community ?? '',
    region: debtor.region ?? '',
    outstanding: formatGHS(debtor.outstanding_balance, { plain: true }),
    officer: debtor.officer?.full_name ?? '',
    company: branding.app_name,
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={debtor.customer_name}
      subtitle={`${formatGHS(debtor.outstanding_balance)} outstanding${debtor.customer_id ? ` · ${debtor.customer_id}` : ''}`}
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button leftIcon={<Save className="size-4" />} loading={update.isPending} onClick={save}>
              Save call result
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
          {debtor.call_attempts > 0 && <Badge tone="gray">{debtor.call_attempts} attempts</Badge>}
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
                `Hello ${debtor.customer_name}, this is ${branding.app_name} regarding your outstanding balance of ${formatGHS(debtor.outstanding_balance, { plain: true })}.`,
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

        <div className="space-y-4 rounded-panel border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-500/5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <HandCoins className="size-4" /> Call result
          </p>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L.feedback} htmlFor="d-feedback" required>
              <Select
                id="d-feedback"
                placeholder="Select feedback"
                value={v.feedback}
                disabled={!canEdit}
                onChange={(e) => setV({ ...v, feedback: e.target.value })}
                options={active.debtor_feedback.map((f) => ({ value: f.name, label: f.name }))}
              />
            </Field>
            <Field label={`${L.amount_collected} (GH₵)`} htmlFor="d-amount">
              <Input
                id="d-amount"
                inputMode="decimal"
                value={v.amount_collected}
                disabled={!canEdit}
                onChange={(e) => setV({ ...v, amount_collected: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            {(positiveFeedback || v.promised_amount || v.promised_date) && (
              <>
                <Field label="Promised amount (GH₵)" htmlFor="d-promised">
                  <Input
                    id="d-promised"
                    inputMode="decimal"
                    value={v.promised_amount}
                    disabled={!canEdit}
                    onChange={(e) => setV({ ...v, promised_amount: e.target.value })}
                  />
                </Field>
                <Field label="Promised date" htmlFor="d-promised-date">
                  <Input
                    id="d-promised-date"
                    type="date"
                    value={v.promised_date}
                    disabled={!canEdit}
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
                disabled={!canEdit}
                onChange={(e) => setV({ ...v, comment: e.target.value })}
                placeholder="What did the customer say?"
              />
            </Field>
          </div>
          {debtor.promised_date && (
            <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <CalendarClock className="size-3.5" /> Last promise: {formatGHS(debtor.promised_amount ?? 0)} by{' '}
              {formatDate(debtor.promised_date)}
            </p>
          )}
          {!canEdit && <p className="text-xs text-slate-500">This record is assigned to another officer.</p>}
        </div>
      </div>

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

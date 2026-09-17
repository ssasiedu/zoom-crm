import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { addDays, format } from 'date-fns';
import { AlertTriangle, Banknote, ClipboardList, History, UserCheck, UserRound } from 'lucide-react';
import { toOptions, useLookups } from '@/hooks/useLookups';
import { FIELD_LABELS, PRIORITIES } from '@/lib/constants';
import type { ClientLookupResult } from '@/types';
import { Badge, Button, Card, Combobox, Field, Input, Select, StatusBadge, Textarea } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { formatPhone, toLocalPhone } from '@/utils/phone';
import { requiresPayment, slaDaysFor } from '@/utils/tickets';
import { OfficerPicker } from './OfficerPicker';
import type { TicketFormValues } from './ticketSchema';
import { useClientLookup, useCommunitySuggestions } from './useClientLookup';

const L = FIELD_LABELS;

function Section({ icon, title, description, children, accent }: { icon: ReactNode; title: string; description?: string; children: ReactNode; accent?: boolean }) {
  return (
    <Card className={cn(accent && 'border-gold-400/60 dark:border-gold-500/40')}>
      <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4',
            accent ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
          )}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">{children}</div>
    </Card>
  );
}

export interface TicketFormProps {
  form: UseFormReturn<TicketFormValues>;
  mode: 'create' | 'edit';
  isAdmin: boolean;
  canEditDueDate: boolean;
  canAssign: boolean;
  /** ticket being edited (excluded from duplicate warnings) */
  ticketId?: string;
}

export function TicketForm({ form, mode, isAdmin, canEditDueDate, canAssign, ticketId }: TicketFormProps) {
  const { active, lookups } = useLookups();
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const [issueType, clientId, phone, region, dateOpened, dueDate] = watch([
    'issue_type',
    'client_id',
    'contact_number',
    'region',
    'date_opened',
    'due_date',
  ]);
  const needsPayment = requiresPayment(issueType, lookups);
  const [communityQuery, setCommunityQuery] = useState('');
  const { data: communities = [], isFetching: loadingCommunities } = useCommunitySuggestions(communityQuery, region);
  const { data: history = [], isFetching: lookingUp } = useClientLookup(clientId, phone, mode === 'create');

  const sla = slaDaysFor(issueType, lookups);
  const baseDate = dateOpened ? new Date(dateOpened) : new Date();
  const autoDue = issueType ? format(addDays(baseDate, sla), 'yyyy-MM-dd') : '';

  // Keep auto due date in sync for new tickets unless the user overrode it
  const [dueTouched, setDueTouched] = useState(mode === 'edit');
  useEffect(() => {
    if (!dueTouched && autoDue && autoDue !== dueDate) setValue('due_date', autoDue);
  }, [autoDue, dueTouched, dueDate, setValue]);

  const duplicates = useMemo(
    () =>
      history.filter(
        (h) => h.id !== ticketId && (h.status === 'Open' || h.status === 'In-Progress') && (!issueType || h.issue_type === issueType),
      ),
    [history, issueType, ticketId],
  );

  const applyClient = (c: ClientLookupResult) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue('client_name', c.client_name, opts);
    setValue('client_id', c.client_id, opts);
    setValue('contact_number', toLocalPhone(c.contact_number), opts);
    setValue('community', c.community, opts);
    setValue('region', c.region, opts);
  };

  const e = errors;

  return (
    <div className="space-y-5">
      <Section icon={<UserRound />} title="Client" description="Look up an existing client by ID or phone to reuse their details.">
        <Field label={L.client_id} htmlFor="client_id" required error={e.client_id?.message}>
          <Input id="client_id" autoComplete="off" invalid={!!e.client_id} {...register('client_id')} placeholder="e.g. GHA-123456789-0" />
        </Field>
        <Field label={L.contact_number} htmlFor="contact_number" required error={e.contact_number?.message} hint="0XXXXXXXXX or +233XXXXXXXXX">
          <Input id="contact_number" type="tel" inputMode="tel" autoComplete="off" invalid={!!e.contact_number} {...register('contact_number')} placeholder="024 123 4567" />
        </Field>
        <Field label={L.client_name} htmlFor="client_name" required error={e.client_name?.message}>
          <Input id="client_name" autoComplete="off" invalid={!!e.client_name} {...register('client_name')} />
        </Field>

        {mode === 'create' && (history.length > 0 || lookingUp) && (
          <div className="sm:col-span-2 lg:col-span-3">
            <div
              className={cn(
                'rounded-lg border p-3',
                duplicates.length
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60',
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                {duplicates.length ? <AlertTriangle className="size-4 text-amber-600" /> : <History className="size-4 text-slate-500" />}
                {lookingUp
                  ? 'Looking up client history…'
                  : duplicates.length
                    ? `Possible duplicate: this client has ${duplicates.length} active ${issueType ? `"${issueType}" ` : ''}ticket${duplicates.length > 1 ? 's' : ''}`
                    : `Client history: ${history.length} previous ticket${history.length > 1 ? 's' : ''}`}
              </p>
              {history.length > 0 && (
                <ul className="mt-2 divide-y text-sm dark:divide-slate-800">
                  {history.slice(0, 5).map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      <a href={`/tickets/${h.id}`} target="_blank" rel="noreferrer" className="font-mono text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400">
                        {h.ticket_number}
                      </a>
                      <span className="font-medium">{h.client_name}</span>
                      <span className="text-slate-500">{h.issue_type}</span>
                      <span className="text-slate-500">{formatDate(h.date_opened)}</span>
                      <StatusBadge status={h.status} />
                      <span className="text-xs text-slate-500">
                        {formatPhone(h.contact_number)} · {h.community}, {h.region}
                      </span>
                      <Button variant="ghost" size="xs" className="ml-auto" onClick={() => applyClient(h)}>
                        Use these details
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <Field label={L.region} htmlFor="region" required error={e.region?.message}>
          <Select id="region" placeholder="Select region" invalid={!!e.region} options={toOptions(active.regions)} {...register('region')} />
        </Field>
        <Field label={L.community} htmlFor="community" required error={e.community?.message}>
          <Controller
            control={control}
            name="community"
            render={({ field }) => (
              <Combobox
                id="community"
                freeSolo
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                onQueryChange={setCommunityQuery}
                loading={loadingCommunities}
                invalid={!!e.community}
                placeholder="Type or pick a community"
                options={communities.map((c) => ({ value: c, label: c }))}
              />
            )}
          />
        </Field>
        <Field label={L.contact_type} htmlFor="contact_type" required error={e.contact_type?.message}>
          <Select id="contact_type" placeholder="Select type" invalid={!!e.contact_type} options={toOptions(active.contact_types)} {...register('contact_type')} />
        </Field>
      </Section>

      <Section icon={<ClipboardList />} title="Issue" description="Due date is set automatically from the issue type's SLA.">
        <Field label={L.issue_type} htmlFor="issue_type" required error={e.issue_type?.message}>
          <Select
            id="issue_type"
            placeholder="Select issue type"
            invalid={!!e.issue_type}
            options={active.issue_types.map((i) => ({ value: i.name, label: `${i.name}  ·  ${i.sla_days}d SLA` }))}
            {...register('issue_type')}
          />
        </Field>
        <Field label={L.priority} htmlFor="priority">
          <Select id="priority" clearable={false} options={PRIORITIES.map((p) => ({ value: p, label: p }))} {...register('priority')} />
        </Field>
        <Field label={L.responsible_party} htmlFor="responsible_party" error={e.responsible_party?.message} hint="Department or person accountable">
          <Input id="responsible_party" {...register('responsible_party')} placeholder="e.g. Finance, Field Ops" />
        </Field>
        <Field label={L.description} htmlFor="description" required error={e.description?.message} className="sm:col-span-2 lg:col-span-3">
          <Textarea id="description" rows={4} invalid={!!e.description} {...register('description')} placeholder="What did the client report?" />
        </Field>
        {isAdmin && (
          <Field label={L.date_opened} htmlFor="date_opened" hint="Admin only. Leave empty to use the current time.">
            <Input id="date_opened" type="datetime-local" {...register('date_opened')} />
          </Field>
        )}
        <Field
          label={L.due_date}
          htmlFor="due_date"
          error={e.due_date?.message}
          hint={issueType ? `SLA ${sla} day${sla === 1 ? '' : 's'} → ${formatDate(autoDue)}` : 'Pick an issue type first'}
        >
          <Input
            id="due_date"
            type="date"
            disabled={!canEditDueDate}
            invalid={!!e.due_date}
            {...register('due_date', { onChange: () => setDueTouched(true) })}
          />
        </Field>
      </Section>

      {(needsPayment || form.getValues('payment_amount')) && (
        <Section
          accent
          icon={<Banknote />}
          title="Payment"
          description={needsPayment ? `Required for ${issueType}.` : 'Optional payment details.'}
        >
          <Field label={`${L.payment_amount} (GH₵)`} htmlFor="payment_amount" required={needsPayment} error={e.payment_amount?.message}>
            <Input
              id="payment_amount"
              inputMode="decimal"
              leftIcon={<span className="text-xs font-semibold">GH₵</span>}
              className="pl-12"
              invalid={!!e.payment_amount}
              {...register('payment_amount')}
              placeholder="0.00"
            />
          </Field>
          <Field label={L.payment_source} htmlFor="payment_source" required={needsPayment} error={e.payment_source?.message}>
            <Select id="payment_source" placeholder="Select source" invalid={!!e.payment_source} options={toOptions(active.payment_sources)} {...register('payment_source')} />
          </Field>
          <Field label={L.payment_type} htmlFor="payment_type" required={needsPayment} error={e.payment_type?.message}>
            <Select id="payment_type" placeholder="Select type" invalid={!!e.payment_type} options={toOptions(active.payment_types)} {...register('payment_type')} />
          </Field>
          <Field label={L.payment_status} htmlFor="payment_status" required={needsPayment} error={e.payment_status?.message}>
            <Select id="payment_status" placeholder="Select status" invalid={!!e.payment_status} options={toOptions(active.payment_statuses)} {...register('payment_status')} />
          </Field>
        </Section>
      )}

      {canAssign && mode === 'create' && (
        <Card>
          <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <UserCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">
                Assignment <Badge className="ml-1">optional</Badge>
              </h2>
              <p className="text-xs text-slate-500">Officers in the client's region are listed first.</p>
            </div>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <Controller
              control={control}
              name="assigned_officer_id"
              render={({ field }) => <OfficerPicker value={field.value} onChange={field.onChange} region={region} />}
            />
            <Field label="Assignment note" htmlFor="assignment_note">
              <Input id="assignment_note" {...register('assignment_note')} placeholder="Optional instructions for the officer" />
            </Field>
          </div>
        </Card>
      )}
    </div>
  );
}

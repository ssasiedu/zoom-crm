import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, MessageSquare, Phone, PhoneCall, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  type SelectOption,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useLookups } from '@/hooks/useLookups';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { validationsService } from '@/services/validations';
import type { ValidationCall, ValidationOutcome } from '@/types';
import { formatDateTime, formatGHS, formatRelative } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

const OUTCOME_TONE: Record<ValidationOutcome, 'green' | 'red' | 'gray' | 'amber'> = {
  active: 'green',
  inactive: 'red',
  unreachable: 'gray',
  other: 'amber',
};

function CallEntry({
  call,
  outcomeOf,
  canRemove,
  onRemove,
}: {
  call: ValidationCall;
  outcomeOf: (response: string) => ValidationOutcome;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="relative pl-6">
      <span className="absolute top-1.5 left-0 flex size-3.5 items-center justify-center rounded-full bg-brand-600">
        <PhoneCall className="size-2 text-white" />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={OUTCOME_TONE[outcomeOf(call.response)]}>{call.response}</Badge>
        {call.amount_collected ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <Banknote className="size-3.5" />
            {formatGHS(call.amount_collected)}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-slate-500" title={formatDateTime(call.called_at)}>
          {formatRelative(call.called_at)}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this call"
            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {call.payment_reference && (
        <p className="mt-0.5 font-mono text-xs text-slate-500">Ref {call.payment_reference}</p>
      )}
      {call.promised_amount ? (
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          Promised {formatGHS(call.promised_amount)}
          {call.promised_date ? ` by ${formatDateTime(call.promised_date)}` : ''}
        </p>
      ) : null}
      {call.comment && <p className="mt-0.5 text-sm whitespace-pre-wrap">{call.comment}</p>}
      <p className="mt-0.5 text-xs text-slate-400">
        {call.author?.full_name ?? 'Unknown'}
        {call.officer?.full_name ? ` · for ${call.officer.full_name}` : ''}
      </p>
    </li>
  );
}

/**
 * One customer on a validation list: who they are, every call made to
 * them, and the form to add the next one. Calls are only ever added, so
 * a customer who first says "will pay" and later says "we have stopped"
 * leaves both answers behind rather than one overwriting the other.
 */
export function ValidationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can, officerId } = useAuth();
  const { active } = useLookups();

  const customer = useQuery({
    queryKey: [...qk.validations, 'one', id],
    queryFn: () => validationsService.get(id!),
    enabled: Boolean(id),
  });
  const calls = useQuery({
    queryKey: [...qk.validations, 'calls', id],
    queryFn: () => validationsService.calls(id!),
    enabled: Boolean(id),
  });

  const [response, setResponse] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    setResponse('');
    setAmount('');
    setReference('');
    setComment('');
  }, [id]);

  const outcomeByName = useMemo(
    () => new Map(active.validation_responses.map((r) => [r.name, r.outcome])),
    [active.validation_responses],
  );
  const outcomeOf = (name: string): ValidationOutcome => outcomeByName.get(name) ?? 'other';
  const responseOptions: SelectOption[] = active.validation_responses.map((r) => ({
    value: r.name,
    label: r.name,
  }));

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.validations }),
      queryClient.invalidateQueries({ queryKey: qk.myValidations }),
    ]);
  };

  const add = useMutation({
    mutationFn: () =>
      validationsService.addCall({
        validation_id: id!,
        response,
        amount_collected: amount.trim() ? Number(amount) : null,
        payment_reference: reference.trim() || null,
        comment: comment.trim() || null,
      }),
    onSuccess: async () => {
      toast.success('Call recorded');
      setResponse('');
      setAmount('');
      setReference('');
      setComment('');
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (callId: string) => validationsService.removeCall(callId),
    onSuccess: async () => {
      toast.success('Call removed');
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const c = customer.data;
  const isMine = Boolean(officerId && c?.officer_id === officerId);
  const canLog = can('validations:manage') || (can('validations:work') && isMine);
  const amountBad = amount.trim() !== '' && !(Number(amount) >= 0);

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width="lg"
      title={c?.customer_name ?? 'Customer'}
      subtitle={c ? [c.customer_id, c.community, c.region].filter(Boolean).join(' · ') : undefined}
    >
      <div className="space-y-5 p-4 sm:p-5">
        {customer.isLoading ? (
          <Skeleton className="h-24" />
        ) : customer.error ? (
          <ErrorState message={errorMessage(customer.error)} onRetry={() => customer.refetch()} />
        ) : c ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">Calls made</p>
                <p className="text-lg font-bold tabular-nums">{c.call_attempts}</p>
              </div>
              <div className="rounded-lg border p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">Collected</p>
                <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatGHS(c.amount_collected ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">Latest answer</p>
                <p className="truncate text-sm font-semibold">{c.response ?? 'Not called yet'}</p>
              </div>
            </div>

            {c.contact_number ? (
              <a
                href={`tel:${c.contact_number}`}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:border-brand-400 dark:border-slate-700"
              >
                <Phone className="size-4 text-brand-600" /> {formatPhone(c.contact_number)}
              </a>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">No phone number on this record.</p>
            )}

            {canLog && (
              <form
                className="space-y-3 rounded-panel border p-3 dark:border-slate-800"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (response) add.mutate();
                }}
              >
                <p className="text-sm font-semibold">Record a call</p>
                <Field label="What did they say?" htmlFor="v-response" required>
                  <Select
                    id="v-response"
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Choose a response…"
                    options={responseOptions}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Amount collected"
                    htmlFor="v-amount"
                    error={amountBad ? 'Enter a positive amount' : undefined}
                    hint="Leave blank if they paid nothing"
                  >
                    <Input
                      id="v-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      invalid={amountBad}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Payment reference" htmlFor="v-ref" hint="Momo or receipt number">
                    <Input id="v-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </div>
                <Field label="Comment" htmlFor="v-comment">
                  <Textarea
                    id="v-comment"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Anything management should know"
                  />
                </Field>
                <Button
                  type="submit"
                  leftIcon={<CheckCircle2 className="size-4" />}
                  loading={add.isPending}
                  disabled={!response || amountBad}
                >
                  Save this call
                </Button>
              </form>
            )}

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <MessageSquare className="size-4 text-slate-400" /> Call history
              </p>
              {calls.isLoading ? (
                <Skeleton className="h-20" />
              ) : (calls.data?.length ?? 0) === 0 ? (
                <EmptyState title="No calls yet" description="The first call recorded will appear here." />
              ) : (
                <ul className="space-y-4 border-l border-slate-200 pl-1 dark:border-slate-800">
                  {calls.data!.map((call) => (
                    <CallEntry
                      key={call.id}
                      call={call}
                      outcomeOf={outcomeOf}
                      canRemove={can('validations:manage')}
                      onRemove={() => remove.mutate(call.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

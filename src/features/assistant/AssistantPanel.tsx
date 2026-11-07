import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Lightbulb, Sparkles, TriangleAlert, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { qk } from '@/lib/queryClient';
import { assistantService } from '@/services/assistant';
import { errorMessage } from '@/services/errors';
import type { AiSuggestion, TicketRow } from '@/types';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { formatDate, formatMinutes, formatPercent } from '@/utils/format';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="xs"
      leftIcon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy to the clipboard');
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

/**
 * Suggests how to handle a ticket. The history half always works; the
 * written suggestion needs the ai-assist function and a key in settings.
 */
export function AssistantPanel({ ticket }: { ticket: TicketRow }) {
  const [ai, setAi] = useState<AiSuggestion | null>(null);

  const similar = useQuery({
    queryKey: [...qk.assistant(ticket.id), 'similar'],
    queryFn: () => assistantService.similar(ticket, 6),
    staleTime: 5 * 60_000,
  });

  const playbook = useQuery({
    queryKey: [...qk.assistant(ticket.id), 'playbook', ticket.issue_type, ticket.region],
    queryFn: () => assistantService.playbook(ticket.issue_type, ticket.region),
    staleTime: 5 * 60_000,
  });

  const suggest = useMutation({
    mutationFn: () => assistantService.suggest(ticket.id),
    onSuccess: setAi,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const p = playbook.data;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-900 dark:bg-brand-500/5">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-900 dark:text-brand-200">
          <Lightbulb className="size-4" /> What usually works for {ticket.issue_type}
        </p>
        {playbook.isLoading ? (
          <Skeleton className="mt-2 h-16" />
        ) : playbook.error ? (
          <ErrorState message={errorMessage(playbook.error)} onRetry={() => playbook.refetch()} />
        ) : p && p.resolved > 0 ? (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Resolved before</dt>
                <dd className="font-semibold tabular-nums">{p.resolved}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Typical time</dt>
                <dd className="font-semibold">{formatMinutes(p.median_resolution_minutes)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Within SLA</dt>
                <dd className="font-semibold">{formatPercent(p.within_sla)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">SLA</dt>
                <dd className="font-semibold">{p.sla_days ?? '—'} days</dd>
              </div>
            </dl>
            {p.responsible_parties.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                Usually handled by:
                {p.responsible_parties.map((r) => (
                  <Badge key={r.label} tone="green">
                    {r.label} ({r.count})
                  </Badge>
                ))}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            No resolved tickets of this type yet — your notes here will teach the assistant.
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Suggested response</p>
          <Button
            size="xs"
            variant="outline"
            leftIcon={<Wand2 className="size-3.5" />}
            loading={suggest.isPending}
            onClick={() => suggest.mutate()}
          >
            {ai ? 'Regenerate' : 'Draft with AI'}
          </Button>
        </div>
        {ai ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {ai.summary && <p className="text-sm">{ai.summary}</p>}
            {ai.steps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
                {ai.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
            {ai.draft_response && (
              <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-900">
                <p className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                  Say to the customer
                  <CopyButton text={ai.draft_response} />
                </p>
                <p className="text-sm italic">“{ai.draft_response}”</p>
              </div>
            )}
            {ai.watch_out && (
              <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {ai.watch_out}
              </p>
            )}
            <p className="text-[11px] text-slate-400">
              Drafted from {ai.based_on} similar ticket{ai.based_on === 1 ? '' : 's'}. Check it before acting.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Writes a short script and next steps from the resolved tickets below. Needs an AI key in Administration → AI.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">How similar issues were resolved</p>
        {similar.isLoading ? (
          <Skeleton className="h-24" />
        ) : similar.error ? (
          <ErrorState message={errorMessage(similar.error)} onRetry={() => similar.refetch()} />
        ) : (similar.data ?? []).length === 0 ? (
          <EmptyState compact icon={<Sparkles />} title="Nothing comparable yet" description="Resolved tickets with remarks show up here." />
        ) : (
          <ul className="space-y-2">
            {similar.data!.map((s) => (
              <li key={s.ticket_number} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-brand-700 dark:text-brand-400">{s.ticket_number}</span>
                  <span>{s.community}</span>
                  <span>{formatDate(s.date_opened)}</span>
                  {s.resolution_minutes !== null && <Badge tone="green">{formatMinutes(s.resolution_minutes)}</Badge>}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{s.description}</p>
                {s.remarks && (
                  <p className="mt-1.5 text-sm">
                    <span className="font-medium text-slate-500">Resolution: </span>
                    {s.remarks}
                  </p>
                )}
                {s.responsible_party && <p className="mt-1 text-xs text-slate-500">Handled by {s.responsible_party}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

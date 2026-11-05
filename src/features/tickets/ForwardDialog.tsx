import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { officersService } from '@/services/officers';
import { ticketsService } from '@/services/tickets';
import type { DistrictOfficerOption } from '@/types';
import { Button, Badge, EmptyState, ErrorState, Field, Input, Modal, Skeleton, Textarea } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatPhone } from '@/utils/phone';

/**
 * Send a ticket down to the District Operation Officer who covers that
 * district. The officers offered are the ones in the ticket's region, so
 * the choice is short; "Everywhere" is there for the odd case where the
 * work belongs to a neighbouring region.
 */
export function ForwardDialog({
  open,
  onClose,
  ticketIds,
  region,
  currentOfficerId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ticketIds: string[];
  region?: string | null;
  currentOfficerId?: string | null;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [inRegionOnly, setInRegionOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const multi = ticketIds.length > 1;
  const scope = region ?? profile?.region ?? null;

  useEffect(() => {
    if (open) {
      setPicked('');
      setNote('');
      setSearch('');
      setInRegionOnly(Boolean(scope));
    }
  }, [open, scope]);

  const q = useQuery({
    queryKey: [...qk.officers, 'district', inRegionOnly ? scope : null],
    queryFn: () => officersService.districtOfficers(inRegionOnly ? scope : null),
    enabled: open,
  });

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = (q.data ?? []).filter(
      (o) =>
        !needle ||
        o.full_name.toLowerCase().includes(needle) ||
        (o.district ?? '').toLowerCase().includes(needle),
    );
    const byDistrict = new Map<string, DistrictOfficerOption[]>();
    for (const o of rows) {
      const key = o.district ?? 'No district';
      byDistrict.set(key, [...(byDistrict.get(key) ?? []), o]);
    }
    return [...byDistrict.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data, search]);

  const chosen = (q.data ?? []).find((o) => o.id === picked);

  const run = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      if (multi) {
        const { forwarded, failed } = await ticketsService.forwardMany(ticketIds, picked, note);
        if (forwarded > 0) {
          toast.success(`${forwarded} ticket${forwarded === 1 ? '' : 's'} forwarded to ${chosen?.full_name}`);
        }
        if (failed.length > 0) {
          toast.error(`${failed.length} could not be forwarded`, { description: failed[0].message });
        }
      } else {
        await ticketsService.forward(ticketIds[0], picked, note);
        toast.success(`Forwarded to ${chosen?.full_name}`, {
          description: chosen?.manager_name ? `${chosen.manager_name} has been alerted too.` : undefined,
        });
      }
      await queryClient.invalidateQueries({ queryKey: qk.tickets });
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={multi ? `Forward ${ticketIds.length} tickets to a district` : 'Forward to a District Operation Officer'}
      description="The ticket stays with you. The district officer does the field work, and both they and their regional manager are alerted by notification and SMS."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={<Send className="size-4" />} loading={busy} disabled={!picked} onClick={run}>
            Forward
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Find an officer" htmlFor="fwd-search" className="flex-1">
          <Input
            id="fwd-search"
            placeholder="Officer or district…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        {scope && (
          <Button variant="ghost" size="sm" onClick={() => setInRegionOnly((v) => !v)}>
            {inRegionOnly ? `Showing ${scope} — show everywhere` : `Showing everywhere — only ${scope}`}
          </Button>
        )}
      </div>

      <div className="mt-4 max-h-80 space-y-4 overflow-y-auto">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No District Operation Officers here"
            description={
              inRegionOnly && scope
                ? `Nobody is loaded for ${scope} yet. An administrator adds them under Administration → District officers.`
                : 'An administrator adds them under Administration → District officers.'
            }
          />
        ) : (
          groups.map(([district, officers]) => (
            <div key={district}>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <MapPin className="size-3" /> {district}
              </p>
              <ul className="space-y-1.5">
                {officers.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(o.id)}
                      aria-pressed={picked === o.id}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition',
                        picked === o.id
                          ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20 dark:border-brand-500 dark:bg-brand-500/10'
                          : 'border-slate-200 hover:border-brand-300 dark:border-slate-800 dark:hover:border-brand-700',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                          {o.full_name}
                          {o.id === currentOfficerId && <span className="ml-2 text-xs text-slate-500">already has it</span>}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {o.phone ? formatPhone(o.phone) : 'No phone — no SMS'}
                          {o.manager_name ? ` · reports to ${o.manager_name}` : ' · no manager set'}
                        </span>
                      </span>
                      <Badge tone={o.active_tickets > 5 ? 'amber' : 'gray'}>{o.active_tickets} active</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <Field
        label="Note for the district (optional)"
        htmlFor="fwd-note"
        className="mt-4"
        hint="Goes into the ticket history and is what the officer reads first."
      >
        <Textarea
          id="fwd-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What the customer reported, directions to the site, anything the field team should know…"
        />
      </Field>

      {chosen && !chosen.manager_name && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {chosen.full_name} has no regional manager set, so only they will be alerted.
        </p>
      )}
    </Modal>
  );
}

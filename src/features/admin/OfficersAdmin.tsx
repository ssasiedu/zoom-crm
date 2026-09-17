import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { toOptions, useLookups, useOfficerWorkload, useOfficers } from '@/hooks/useLookups';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { officersService } from '@/services/officers';
import type { Officer } from '@/types';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, Select, Switch, TableSkeleton } from '@/components/ui';
import { isValidGhanaPhone } from '@/utils/phone';

interface Draft {
  id?: string;
  full_name: string;
  region: string;
  phone: string;
  email: string;
  is_active: boolean;
}

export function OfficersAdmin() {
  const queryClient = useQueryClient();
  const { lookups } = useLookups();
  const { data: officers = [], isLoading, error, refetch } = useOfficers();
  const { data: workload = [] } = useOfficerWorkload();
  const [draft, setDraft] = useState<Draft | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.officers });
    queryClient.invalidateQueries({ queryKey: qk.workload });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const values = {
        full_name: d.full_name,
        region: d.region || null,
        phone: d.phone.trim() || null,
        email: d.email.trim() || null,
        is_active: d.is_active,
      };
      return d.id ? officersService.update(d.id, values) : officersService.create(values);
    },
    onSuccess: (o) => {
      toast.success(`Officer ${o.full_name} saved`);
      setDraft(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: (o: Officer) => officersService.update(o.id, { is_active: !o.is_active }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const phoneError = draft?.phone && !isValidGhanaPhone(draft.phone) ? 'Use a Ghana number' : undefined;

  return (
    <Card>
      <CardHeader
        title="DM officers"
        description="Officers appear in the OFFICER dropdown. Deactivate instead of deleting to keep history. Link user accounts under Users."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setDraft({ full_name: '', region: '', phone: '', email: '', is_active: true })}>
            Add officer
          </Button>
        }
      />
      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : officers.length === 0 ? (
        <EmptyState title="No officers yet" />
      ) : (
        <ul className="divide-y dark:divide-slate-800">
          {officers.map((o) => {
            const w = workload.find((x) => x.id === o.id);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={o.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {o.full_name}
                    {!o.is_active && <Badge>inactive</Badge>}
                    {o.profile_id ? <Badge tone="green">login linked</Badge> : <Badge tone="amber">no login</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[o.region, o.phone, o.email].filter(Boolean).join(' · ') || 'No contact details'}
                  </p>
                </div>
                {w && (
                  <p className="text-xs text-slate-500 tabular-nums">
                    {w.open_count} open · {w.in_progress_count} in progress
                    {w.overdue_count > 0 && <span className="ml-1 font-semibold text-rose-600">· {w.overdue_count} overdue</span>}
                  </p>
                )}
                <Switch label={`${o.is_active ? 'Deactivate' : 'Activate'} ${o.full_name}`} checked={o.is_active} onChange={() => toggle.mutate(o)} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${o.full_name}`}
                  onClick={() =>
                    setDraft({ id: o.id, full_name: o.full_name, region: o.region ?? '', phone: o.phone ?? '', email: o.email ?? '', is_active: o.is_active })
                  }
                >
                  <Pencil className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit officer' : 'Add officer'}
        description="Names are stored in upper case, as used in the business spreadsheets. Renaming updates all existing tickets."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!draft?.full_name.trim() || !!phoneError} onClick={() => draft && save.mutate(draft)}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="o-name" required>
              <Input id="o-name" data-autofocus value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} className="uppercase" />
            </Field>
            <Field label="Region" htmlFor="o-region">
              <Select id="o-region" placeholder="Any region" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} options={toOptions(lookups.regions)} />
            </Field>
            <Field label="Phone" htmlFor="o-phone" error={phoneError}>
              <Input id="o-phone" value={draft.phone} invalid={!!phoneError} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="o-email">
              <Input id="o-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLookups } from '@/hooks/useLookups';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { lookupsService } from '@/services/lookups';
import type { LookupItem, LookupTable } from '@/types';
import { Button, Card, CardHeader, ConfirmDialog, Input, Switch, TableSkeleton } from '@/components/ui';
import { cn } from '@/utils/cn';

export const LOOKUP_LABELS: Record<LookupTable, { title: string; description: string }> = {
  contact_types: { title: 'TYPE OF CONTACT', description: 'Channels a client used to reach us' },
  issue_types: { title: 'ISSUE TYPE', description: 'SLA days and payment rules are set under SLA settings' },
  regions: { title: 'Region', description: "Ghana's administrative regions" },
  payment_sources: { title: 'PAYMENT SOURCE', description: 'New or existing business' },
  payment_types: { title: 'PAYMENT TYPE', description: 'Products or payment categories' },
  payment_statuses: { title: 'PAYMENT STATUS', description: 'Where a payment stands' },
  customer_types: { title: 'CUSTOMER TYPE', description: 'Used by the monthly debtor list' },
  providers: { title: 'PROVIDER', description: 'Service providers on the debtor list' },
  debtor_feedback: { title: 'FEEDBACK', description: 'Outcomes officers can record on a debtor call' },
};

const TICKET_LOOKUPS: LookupTable[] = [
  'contact_types',
  'issue_types',
  'regions',
  'payment_sources',
  'payment_types',
  'payment_statuses',
];

const DEBTOR_LOOKUPS: LookupTable[] = ['customer_types', 'providers', 'debtor_feedback'];

function LookupList({ table }: { table: LookupTable }) {
  const queryClient = useQueryClient();
  const { lookups, isLoading } = useLookups();
  const items = lookups[table] as LookupItem[];
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [toDelete, setToDelete] = useState<LookupItem | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.lookups });
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const add = useMutation({
    mutationFn: () =>
      lookupsService.create(table, {
        name: newName.trim(),
        sort_order: (items.at(-1)?.sort_order ?? 0) + 10,
      }),
    onSuccess: () => {
      setNewName('');
      refresh();
      toast.success('Value added');
    },
    onError,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => lookupsService.update(table, id, { name: name.trim() }),
    onSuccess: () => {
      setEditId(null);
      refresh();
      // tickets were renamed via ON UPDATE CASCADE
      queryClient.invalidateQueries({ queryKey: qk.tickets });
      toast.success('Renamed. Existing tickets now show the new name.');
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (i: LookupItem) => lookupsService.update(table, i.id, { is_active: !i.is_active }),
    onSuccess: refresh,
    onError,
  });
  const move = useMutation({
    mutationFn: (ids: number[]) => lookupsService.reorder(table, ids),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (i: LookupItem) => lookupsService.remove(table, i.id),
    onSuccess: () => {
      setToDelete(null);
      refresh();
      toast.success('Value deleted');
    },
    onError: (e) => {
      setToDelete(null);
      toast.error(`${errorMessage(e)} Deactivate it instead to hide it from forms.`);
    },
  });

  const reorder = (index: number, dir: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    move.mutate(ids);
  };

  const meta = LOOKUP_LABELS[table];
  return (
    <Card>
      <CardHeader title={meta.title} description={meta.description} />
      {isLoading ? (
        <TableSkeleton rows={5} cols={2} />
      ) : (
        <ul className="divide-y dark:divide-slate-800">
          {items.map((i, idx) => (
            <li key={i.id} className={cn('flex items-center gap-2 px-4 py-2', !i.is_active && 'opacity-55')}>
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${i.name} up`} disabled={idx === 0 || move.isPending} onClick={() => reorder(idx, -1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move ${i.name} down`} disabled={idx === items.length - 1 || move.isPending} onClick={() => reorder(idx, 1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              {editId === i.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editName.trim()) rename.mutate({ id: i.id, name: editName });
                  }}
                >
                  <Input aria-label="New name" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                  <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save" loading={rename.isPending}>
                    <Check className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditId(null)}>
                    <X className="size-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{i.name}</span>
                  <Switch label={`${i.is_active ? 'Deactivate' : 'Activate'} ${i.name}`} checked={i.is_active} onChange={() => toggle.mutate(i)} />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Rename ${i.name}`}
                    onClick={() => {
                      setEditId(i.id);
                      setEditName(i.name);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${i.name}`} onClick={() => setToDelete(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) add.mutate();
        }}
      >
        <Input aria-label={`New ${meta.title} value`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a value…" className="h-8" />
        <Button type="submit" size="sm" leftIcon={<Plus className="size-4" />} disabled={!newName.trim()} loading={add.isPending}>
          Add
        </Button>
      </form>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        loading={remove.isPending}
        title={`Delete “${toDelete?.name}”?`}
        message="Values already used on tickets cannot be deleted — deactivate them instead so they no longer appear in forms."
        confirmLabel="Delete"
      />
    </Card>
  );
}

export function LookupsAdmin() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500 uppercase">Tickets</h2>
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {TICKET_LOOKUPS.map((t) => (
            <LookupList key={t} table={t} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500 uppercase">Debt recovery</h2>
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {DEBTOR_LOOKUPS.map((t) => (
            <LookupList key={t} table={t} />
          ))}
        </div>
      </section>
    </div>
  );
}

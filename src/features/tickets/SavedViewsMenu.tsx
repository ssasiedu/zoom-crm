import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { savedViewsService } from '@/services/savedViews';
import { Button, Field, Input, Menu, Modal } from '@/components/ui';

export function SavedViewsMenu({
  snapshot,
  apply,
}: {
  snapshot: () => Record<string, string>;
  apply: (filters: Record<string, string>) => void;
}) {
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const { data: views = [] } = useQuery({ queryKey: qk.savedViews, queryFn: savedViewsService.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.savedViews });

  const save = useMutation({
    mutationFn: () => savedViewsService.save(name, snapshot()),
    onSuccess: () => {
      toast.success(`View “${name}” saved`);
      setSaveOpen(false);
      setName('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: savedViewsService.remove,
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <Menu
        label="Saved views"
        align="left"
        trigger={({ toggle, ref, open }) => (
          <Button ref={ref} variant="secondary" size="sm" onClick={toggle} aria-expanded={open} leftIcon={<Bookmark className="size-4" />}>
            Views{views.length ? ` (${views.length})` : ''}
          </Button>
        )}
      >
        {(close) => (
          <div className="w-64">
            {views.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">No saved views yet.</p>}
            {views.map((v) => (
              <div key={v.id} className="group flex items-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                <button
                  type="button"
                  role="menuitem"
                  className="flex-1 truncate px-2.5 py-2 text-left text-sm"
                  onClick={() => {
                    apply(v.filters);
                    close();
                  }}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  className="p-2 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 focus:opacity-100"
                  onClick={() => remove.mutate(v.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                onClick={() => {
                  close();
                  setSaveOpen(true);
                }}
              >
                <BookmarkPlus className="size-4" /> Save current filters…
              </button>
            </div>
          </div>
        )}
      </Menu>
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        size="sm"
        title="Save view"
        description="Saves the current filters and sort order. Saving with an existing name replaces it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <Field label="View name" htmlFor="view-name">
            <Input id="view-name" data-autofocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ashanti overdue payments" />
          </Field>
        </form>
      </Modal>
    </>
  );
}

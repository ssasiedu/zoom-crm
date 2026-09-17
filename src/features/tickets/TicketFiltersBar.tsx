import { useEffect, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { toOptions, useLookups, useOfficers } from '@/hooks/useLookups';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/hooks/useAuth';
import { PRIORITIES, STATUSES } from '@/lib/constants';
import type { TicketStatus } from '@/types';
import { Button, DateRangePicker, Field, Input, Select } from '@/components/ui';
import { cn } from '@/utils/cn';
import type { useTicketUrlState } from './ticketFilters';

type UrlState = ReturnType<typeof useTicketUrlState>;

export function TicketFiltersBar({ state }: { state: UrlState }) {
  const { params, update, range, setRange, clear, activeCount } = state;
  const { active } = useLookups();
  const { data: officers = [] } = useOfficers();
  const { role } = useAuth();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search, 350);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    const q = params.get('q') ?? '';
    if (q !== debounced) setSearch(q);
    // external changes (saved views / clear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const statuses = (params.get('status') ?? '').split(',').filter(Boolean) as TicketStatus[];
  const toggleStatus = (s: TicketStatus) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    update({ status: next.join(',') || null });
  };
  const sel = (key: string) => ({
    value: params.get(key) ?? '',
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => update({ [key]: e.target.value || null }),
  });

  return (
    <div className="space-y-3 border-b p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search tickets"
          leftIcon={<Search />}
          placeholder="Search ticket no., client, ID, phone, community…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80"
          rightSlot={
            search ? (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="rounded p-1 text-slate-400 hover:text-slate-600">
                <X className="size-3.5" />
              </button>
            ) : undefined
          }
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Status filter">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={statuses.includes(s)}
              onClick={() => toggleStatus(s)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-medium transition',
                statuses.includes(s)
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={params.get('overdue') === '1'}
            onClick={() => update({ overdue: params.get('overdue') === '1' ? null : '1' })}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-medium transition',
              params.get('overdue') === '1'
                ? 'border-rose-600 bg-rose-600 text-white'
                : 'border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10',
            )}
          >
            Overdue
          </button>
        </div>
        <DateRangePicker value={range} onChange={setRange} id="tickets-range" />
        <Button
          variant={expanded ? 'outline' : 'secondary'}
          size="sm"
          leftIcon={<Filter className="size-4" />}
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          More filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" leftIcon={<X className="size-4" />} onClick={clear}>
            Clear all
          </Button>
        )}
      </div>
      {expanded && (
        <div className="grid animate-fade-in gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Field label="Region" htmlFor="f-region">
            <Select id="f-region" size="sm" placeholder="All regions" options={toOptions(active.regions)} {...sel('region')} />
          </Field>
          <Field label="Issue type" htmlFor="f-issue">
            <Select id="f-issue" size="sm" placeholder="All issue types" options={toOptions(active.issue_types)} {...sel('issue_type')} />
          </Field>
          <Field label="Type of contact" htmlFor="f-contact">
            <Select id="f-contact" size="sm" placeholder="All channels" options={toOptions(active.contact_types)} {...sel('contact_type')} />
          </Field>
          {role !== 'dm_officer' && (
            <Field label="Officer" htmlFor="f-officer">
              <Select
                id="f-officer"
                size="sm"
                placeholder="All officers"
                options={[{ value: 'unassigned', label: '— Unassigned —' }, ...officers.map((o) => ({ value: o.id, label: o.full_name }))]}
                {...sel('officer')}
              />
            </Field>
          )}
          <Field label="Priority" htmlFor="f-priority">
            <Select id="f-priority" size="sm" placeholder="Any priority" options={PRIORITIES.map((p) => ({ value: p, label: p }))} {...sel('priority')} />
          </Field>
          <Field label="Payment source" htmlFor="f-psource">
            <Select id="f-psource" size="sm" placeholder="Any" options={toOptions(active.payment_sources)} {...sel('payment_source')} />
          </Field>
          <Field label="Payment type" htmlFor="f-ptype">
            <Select id="f-ptype" size="sm" placeholder="Any" options={toOptions(active.payment_types)} {...sel('payment_type')} />
          </Field>
          <Field label="Payment status" htmlFor="f-pstatus">
            <Select id="f-pstatus" size="sm" placeholder="Any" options={toOptions(active.payment_statuses)} {...sel('payment_status')} />
          </Field>
          <Field label="Community" htmlFor="f-community">
            <Input
              id="f-community"
              className="h-8 text-xs"
              defaultValue={params.get('community') ?? ''}
              key={params.get('community') ?? ''}
              onBlur={(e) => update({ community: e.target.value.trim() || null })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') update({ community: (e.target as HTMLInputElement).value.trim() || null });
              }}
              placeholder="Contains…"
            />
          </Field>
          <Field label="Due between" htmlFor="f-due-from">
            <div className="flex gap-1">
              <Input id="f-due-from" type="date" className="h-8 text-xs" value={params.get('dueFrom') ?? ''} onChange={(e) => update({ dueFrom: e.target.value || null })} />
              <Input aria-label="Due to" type="date" className="h-8 text-xs" value={params.get('dueTo') ?? ''} onChange={(e) => update({ dueTo: e.target.value || null })} />
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Inbox, ListTodo, MapPin, PlayCircle, Search, UserX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useTicketList, useUpdateTicket } from '@/hooks/useTickets';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { officersService } from '@/services/officers';
import type { TicketFilters, TicketRow } from '@/types';
import {
  Button,
  Card,
  DueBadge,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  PriorityBadge,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate, formatGHS } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { getDueState } from '@/utils/tickets';
import { ContactActions } from './TicketDetail';
import { TicketDrawer } from './TicketDrawer';

type TabKey = 'active' | 'open' | 'in_progress' | 'overdue' | 'resolved';

function filtersFor(tab: TabKey, search: string): TicketFilters {
  const base: TicketFilters = { search: search || undefined };
  switch (tab) {
    case 'open':
      return { ...base, status: 'Open' };
    case 'in_progress':
      return { ...base, status: 'In-Progress' };
    case 'overdue':
      return { ...base, overdue: true };
    case 'resolved':
      return { ...base, status: ['Resolved', 'Closed'] };
    default:
      return { ...base, status: ['Open', 'In-Progress'] };
  }
}

function TicketCard({ t, onOpen }: { t: TicketRow; onOpen: () => void }) {
  const update = useUpdateTicket('Work started');
  const state = getDueState(t);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
        className={cn(
          'group relative flex cursor-pointer flex-col gap-2 overflow-hidden rounded-panel border bg-white p-4 pl-5 transition hover:border-brand-300 hover:shadow-md dark:bg-slate-900 dark:hover:border-brand-700',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1.5',
            state === 'overdue' ? 'bg-rose-500' : state === 'today' || state === 'soon' ? 'bg-amber-400' : state === 'ok' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700',
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">{t.ticket_number}</span>
          <StatusBadge status={t.status} />
          <DueBadge ticket={t} />
          {t.priority !== 'Medium' && <PriorityBadge priority={t.priority} />}
          <span className="ml-auto text-xs text-slate-500">Opened {formatDate(t.date_opened)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t.client_name}</h3>
          <span className="font-mono text-xs text-slate-500">ID {t.client_id}</span>
          <span className="text-sm text-slate-600 dark:text-slate-300">{formatPhone(t.contact_number)}</span>
        </div>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="size-3" /> {t.community}, {t.region} · {t.contact_type}
        </p>
        <p className="text-sm">
          <span className="font-semibold">{t.issue_type}</span>
          <span className="text-slate-600 dark:text-slate-400"> — {t.description}</span>
        </p>
        {t.payment_amount !== null && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Payment <strong className="text-slate-900 tabular-nums dark:text-white">{formatGHS(t.payment_amount)}</strong>
            {t.payment_type ? ` · ${t.payment_type}` : ''}
            {t.payment_status ? ` · ${t.payment_status}` : ''}
          </p>
        )}
        {state === 'overdue' && !t.reason_for_open_status && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
            <AlertTriangle className="size-3.5" /> Overdue — add a REASON FOR OPEN STATUS
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ContactActions ticket={t} />
          {t.status === 'Open' && state !== 'overdue' && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<PlayCircle className="size-4" />}
              loading={update.isPending}
              onClick={(e) => {
                e.stopPropagation();
                update.mutate({ id: t.id, values: { status: 'In-Progress' } });
              }}
            >
              Start work
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            {t.status === 'In-Progress' ? 'Update / resolve' : 'Open'}
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function MyTicketsPage() {
  const { officerId, profile } = useAuth();
  const [tab, setTab] = useState<TabKey>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const debounced = useDebounce(search.trim(), 300);
  const filters = useMemo(() => filtersFor(tab, debounced), [tab, debounced]);

  const summary = useQuery({
    queryKey: [...qk.myTickets, 'summary', officerId],
    queryFn: () => officersService.summary(officerId),
    enabled: Boolean(officerId),
  });
  const list = useTicketList(
    {
      filters,
      page,
      pageSize: 20,
      officerId,
      sort: tab === 'resolved' ? [{ id: 'completion_date', desc: true }] : [{ id: 'due_date', desc: false }, { id: 'priority', desc: true }],
    },
    'mine',
  );

  if (!officerId) {
    return (
      <EmptyState
        icon={<UserX />}
        title="Your account isn't linked to an officer yet"
        description="An administrator needs to link your user to an officer record under Administration → Officers before tickets can be assigned to you."
      />
    );
  }

  const s = summary.data;
  const firstName = profile?.full_name.split(' ')[0] ?? '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title={`${greeting}, ${firstName}`}
        description={
          s
            ? s.overdue
              ? `You have ${s.overdue} overdue ticket${s.overdue === 1 ? '' : 's'} — start there.`
              : s.due_today
                ? `${s.due_today} ticket${s.due_today === 1 ? ' is' : 's are'} due today.`
                : 'Nothing overdue. Nice work.'
            : 'Loading your queue…'
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total assigned" value={s?.assigned ?? 0} icon={<ListTodo />} loading={summary.isLoading} tone="gray" />
        <StatCard label="Open" value={s?.open ?? 0} icon={<Inbox />} tone="blue" loading={summary.isLoading} onClick={() => { setTab('open'); setPage(0); }} active={tab === 'open'} />
        <StatCard label="In progress" value={s?.in_progress ?? 0} icon={<PlayCircle />} tone="amber" loading={summary.isLoading} onClick={() => { setTab('in_progress'); setPage(0); }} active={tab === 'in_progress'} />
        <StatCard label="Overdue" value={s?.overdue ?? 0} icon={<AlertTriangle />} tone="red" loading={summary.isLoading} onClick={() => { setTab('overdue'); setPage(0); }} active={tab === 'overdue'} />
        <StatCard label="Due today" value={s?.due_today ?? 0} icon={<CalendarClock />} tone="gold" loading={summary.isLoading} />
        <StatCard label="Resolved this month" value={s?.resolved_this_month ?? 0} icon={<CheckCircle2 />} tone="green" loading={summary.isLoading} onClick={() => { setTab('resolved'); setPage(0); }} active={tab === 'resolved'} />
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2 px-3 pt-2">
          <Tabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(0);
            }}
            ariaLabel="Ticket queue"
            className="border-none"
            items={[
              { value: 'active', label: 'Active', count: s?.active },
              { value: 'open', label: 'Open', count: s?.open },
              { value: 'in_progress', label: 'In progress', count: s?.in_progress },
              { value: 'overdue', label: 'Overdue', count: s?.overdue },
              { value: 'resolved', label: 'Resolved', count: s?.resolved },
            ]}
          />
          <Input
            aria-label="Search my tickets"
            leftIcon={<Search />}
            placeholder="Search client, ID, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="mb-2 w-full sm:w-64"
          />
        </div>
        <div className="border-t p-3 sm:p-4">
          {list.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : list.error ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (list.data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              icon={tab === 'overdue' ? <CheckCircle2 /> : <Inbox />}
              title={debounced ? 'No matching tickets' : tab === 'overdue' ? 'No overdue tickets' : 'Nothing here'}
              description={tab === 'active' && !debounced ? 'New assignments will appear here instantly.' : undefined}
            />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {list.data!.rows.map((t) => (
                <TicketCard key={t.id} t={t} onOpen={() => setDrawerId(t.id)} />
              ))}
            </ul>
          )}
        </div>
        {(list.data?.count ?? 0) > 20 && (
          <Pagination page={page} pageSize={20} total={list.data!.count} onPageChange={setPage} />
        )}
      </Card>

      <TicketDrawer ticketId={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}


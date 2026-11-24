import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, PhoneCall, Search } from 'lucide-react';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  Tabs,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { validationsService } from '@/services/validations';
import type { ValidationFilters } from '@/types';
import { formatGHS, formatNumber, formatPercent } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { ValidationDrawer } from './ValidationDrawer';

type Tab = 'pending' | 'answered' | 'all';

/**
 * The officer's own validation list, built like My Debtor List: a card
 * per customer, a phone link, and the call recorded in the drawer.
 */
export default function MyValidationsPage() {
  const { officerId, profile } = useAuth();
  const [batch, setBatch] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const debounced = useDebounce(search.trim(), 300);

  const batches = useQuery({ queryKey: [...qk.validations, 'batches'], queryFn: validationsService.batchList });
  const open = (batches.data ?? []).filter((b) => b.status === 'open');
  const activeBatch = batch || open[0]?.id || '';

  const filters: ValidationFilters = useMemo(
    () => ({
      batch: activeBatch || undefined,
      search: debounced || undefined,
      workStatus: tab === 'all' ? undefined : tab === 'pending' ? 'Pending' : 'Answered',
    }),
    [activeBatch, debounced, tab],
  );

  const summary = useQuery({
    queryKey: [...qk.myValidations, 'summary', activeBatch, officerId],
    queryFn: () => validationsService.summary({ batch: activeBatch || undefined, officer: officerId ?? undefined }),
    enabled: Boolean(officerId),
  });
  const list = useQuery({
    queryKey: [...qk.myValidations, 'list', filters, page, officerId],
    queryFn: () => validationsService.list({ filters, page, pageSize: 20, officerId }),
    enabled: Boolean(officerId),
  });

  if (!officerId) {
    return (
      <>
        <PageHeader eyebrow="Data validation" title="My validation list" />
        <Card>
          <EmptyState
            icon={<ClipboardCheck />}
            title="Your account is not linked to an officer record"
            description="An administrator needs to link your user to an officer under Administration → Officers before a list can be given to you."
          />
        </Card>
      </>
    );
  }

  const s = summary.data;
  const rows = list.data?.rows ?? [];
  const purpose = (batches.data ?? []).find((b) => b.id === activeBatch)?.purpose;

  return (
    <>
      <PageHeader
        eyebrow="Data validation"
        title={`${profile?.full_name?.split(' ')[0] ?? 'Your'} validation list`}
        description={purpose || 'Call each customer and record what they say.'}
      />

      <section aria-label="My totals" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="On my list" value={formatNumber(s?.customers)} loading={summary.isLoading} />
        <StatCard label="Still to call" value={formatNumber(s?.pending)} tone="amber" loading={summary.isLoading} />
        <StatCard label="Answered" value={formatNumber(s?.answered)} tone="green" loading={summary.isLoading} hint={formatPercent(s?.answer_rate ?? 0)} />
        <StatCard label="Collected" value={formatGHS(s?.collected ?? 0)} tone="gold" loading={summary.isLoading} />
      </section>

      <Card>
        <div className="flex flex-wrap items-end gap-2 px-3 pt-3 sm:px-4">
          {open.length > 1 && (
            <Select
              aria-label="Exercise"
              value={activeBatch}
              onChange={(e) => {
                setBatch(e.target.value);
                setPage(0);
              }}
              clearable={false}
              options={open.map((b) => ({ value: b.id, label: b.name }))}
              className="w-full sm:w-64"
            />
          )}
          <Input
            aria-label="Search my list"
            leftIcon={<Search />}
            placeholder="Customer, ID, community…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full sm:w-56"
          />
        </div>
        <Tabs
          value={tab}
          onChange={(v) => {
            setTab(v as Tab);
            setPage(0);
          }}
          ariaLabel="My validation list"
          items={[
            { value: 'pending', label: 'Still to call' },
            { value: 'answered', label: 'Answered' },
            { value: 'all', label: 'Everyone' },
          ]}
        />

        {list.isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : list.error ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck />}
            title={tab === 'pending' ? 'Nothing left to call' : 'Nothing here'}
            description={tab === 'pending' ? 'Every customer on your list has been answered.' : undefined}
          />
        ) : (
          <ul className="divide-y dark:divide-slate-800">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDrawerId(r.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900 dark:text-white">{r.customer_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[r.customer_id, r.community, r.region].filter(Boolean).join(' · ')}
                    </span>
                    {r.contact_number && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400">
                        <PhoneCall className="size-3" /> {formatPhone(r.contact_number)}
                      </span>
                    )}
                  </span>
                  {r.response ? <Badge tone="green">{r.response}</Badge> : <Badge tone="amber">Not called</Badge>}
                  {r.call_attempts > 0 && <Badge tone="gray">{r.call_attempts} calls</Badge>}
                  {r.amount_collected ? (
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatGHS(r.amount_collected)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {(list.data?.count ?? 0) > 20 && (
          <Pagination page={page} pageSize={20} total={list.data!.count} onPageChange={setPage} />
        )}
      </Card>

      <ValidationDrawer id={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}

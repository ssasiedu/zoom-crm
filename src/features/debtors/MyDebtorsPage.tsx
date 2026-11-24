import { useEffect, useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import {
  CalendarClock,
  CheckCircle2,
  HandCoins,
  ListChecks,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Search,
  UserX,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useDebtorList, useDebtorPeriods, useMyDebtorSummary } from '@/hooks/useDebtors';
import { useBranding } from '@/hooks/useSettings';
import { errorMessage } from '@/services/errors';
import type { Debtor, DebtorFilters, DebtorWorkStatus } from '@/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatCard,
  Tabs,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate, formatGHS } from '@/utils/format';
import { formatPhone, telLink, whatsappLink } from '@/utils/phone';
import { DebtorDrawer } from './DebtorDrawer';
import { WorkStatusBadge } from './debtorColumns';

type TabKey = 'pending' | 'worked' | 'collected' | 'promises' | 'all';

function DebtorCard({ d, companyName, onOpen }: { d: Debtor; companyName: string; onOpen: () => void }) {
  const promiseDue =
    d.promised_date && new Date(d.promised_date) <= new Date() && Number(d.amount_collected ?? 0) === 0;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
        className="group relative flex cursor-pointer flex-col gap-2 overflow-hidden rounded-panel border bg-white p-4 pl-5 transition hover:border-brand-300 hover:shadow-md dark:bg-slate-900 dark:hover:border-brand-700"
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1.5',
            d.work_status === 'Collected' ? 'bg-emerald-500' : d.work_status === 'Worked' ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700',
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          <WorkStatusBadge status={d.work_status} />
          {d.customer_type && <Badge>{d.customer_type}</Badge>}
          {promiseDue && <Badge tone="amber">promise due {formatDate(d.promised_date)}</Badge>}
          <span className="ml-auto text-lg font-bold tabular-nums">{formatGHS(d.outstanding_balance)}</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{d.customer_name}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            {d.customer_id && <span className="font-mono">{d.customer_id}</span>}
            {d.contact_number && <span>{formatPhone(d.contact_number)}</span>}
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" />
              {d.community ?? '—'}
            </span>
            {d.provider && <span>{d.provider}</span>}
          </p>
        </div>
        {d.feedback && (
          <p className="text-sm">
            <span className="font-medium">{d.feedback}</span>
            {d.amount_collected !== null && (
              <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-400">
                {formatGHS(d.amount_collected)} collected
              </span>
            )}
          </p>
        )}
        {d.comment && <p className="line-clamp-2 text-xs text-slate-500">{d.comment}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {d.contact_number ? (
            <>
              <a
                href={telLink(d.contact_number)}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-8 items-center gap-1.5 rounded-control bg-brand-700 px-2.5 text-sm font-medium text-white hover:bg-brand-800"
              >
                <Phone className="size-4" /> Call
              </a>
              <a
                href={whatsappLink(
                  d.contact_number,
                  `Hello ${d.customer_name}, this is ${companyName} regarding your outstanding balance of ${formatGHS(d.outstanding_balance, { plain: true })}.`,
                )}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-8 items-center gap-1.5 rounded-control bg-[#25D366] px-2.5 text-sm font-medium text-white hover:bg-[#1eb457]"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </>
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-400">No phone number on this record</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {d.work_status === 'Pending' ? 'Log call' : 'Update'}
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function MyDebtorsPage() {
  const { officerId, profile } = useAuth();
  const branding = useBranding();
  const { data: periods = [] } = useDebtorPeriods();
  const [periodId, setPeriodId] = useState('');
  const [tab, setTab] = useState<TabKey>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Debtor | null>(null);
  const debounced = useDebounce(search.trim(), 300);

  useEffect(() => {
    if (!periodId && periods.length > 0) setPeriodId(periods[0].id);
  }, [periods, periodId]);

  const filters: DebtorFilters = useMemo(() => {
    const base: DebtorFilters = { period: periodId || undefined, search: debounced || undefined };
    if (tab === 'pending') return { ...base, workStatus: 'Pending' as DebtorWorkStatus };
    if (tab === 'worked') return { ...base, workStatus: 'Worked' as DebtorWorkStatus };
    if (tab === 'collected') return { ...base, workStatus: 'Collected' as DebtorWorkStatus };
    return base;
  }, [periodId, debounced, tab]);

  const summary = useMyDebtorSummary(periodId || null, officerId);
  const list = useDebtorList(
    {
      filters,
      page,
      pageSize: 20,
      officerId,
      sort:
        tab === 'promises'
          ? [{ id: 'promised_date', desc: false }]
          : [{ id: 'outstanding_balance', desc: true }],
    },
    'mine',
  );

  if (!officerId) {
    return (
      <EmptyState
        icon={<UserX />}
        title="Your account isn't linked to an officer yet"
        description="An administrator links your login to an officer record under Administration → Users. Debtor accounts are assigned to officers."
      />
    );
  }

  const s = summary.data;
  const firstName = profile?.full_name.split(' ')[0] ?? '';
  const rows = (list.data?.rows ?? []).filter((d) =>
    tab === 'promises' ? d.promised_date && Number(d.amount_collected ?? 0) === 0 : true,
  );

  return (
    <>
      <PageHeader
        eyebrow="Debt recovery"
        title="My debtor list"
        description={
          s
            ? `${s.pending} of ${s.customers} accounts still to call · ${formatGHS(s.collected)} collected so far`
            : `Your monthly call list, ${firstName}`
        }
        actions={
          <Select
            aria-label="Month"
            className="w-48"
            value={periodId}
            clearable={false}
            onChange={(e) => {
              setPeriodId(e.target.value);
              setPage(0);
            }}
            options={periods.map((p) => ({
              value: p.id,
              label: format(parse(p.period_month, 'yyyy-MM-dd', new Date()), 'MMMM yyyy'),
            }))}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Accounts" value={s?.customers ?? 0} icon={<ListChecks />} tone="gray" loading={summary.isLoading} />
        <StatCard
          label="Still to call"
          value={s?.pending ?? 0}
          icon={<PhoneCall />}
          tone="amber"
          loading={summary.isLoading}
          onClick={() => {
            setTab('pending');
            setPage(0);
          }}
          active={tab === 'pending'}
        />
        <StatCard
          label="Worked"
          value={s?.worked ?? 0}
          icon={<CheckCircle2 />}
          tone="blue"
          loading={summary.isLoading}
          onClick={() => {
            setTab('worked');
            setPage(0);
          }}
          active={tab === 'worked'}
        />
        <StatCard label="Outstanding" value={formatGHS(s?.outstanding ?? 0)} icon={<Wallet />} tone="violet" loading={summary.isLoading} />
        <StatCard
          label="Collected"
          value={formatGHS(s?.collected ?? 0)}
          icon={<HandCoins />}
          tone="green"
          loading={summary.isLoading}
          hint={s ? `${s.collection_rate}% of outstanding` : undefined}
          onClick={() => {
            setTab('collected');
            setPage(0);
          }}
          active={tab === 'collected'}
        />
        <StatCard
          label="Promises due"
          value={s?.due_promises ?? 0}
          icon={<CalendarClock />}
          tone="gold"
          loading={summary.isLoading}
          onClick={() => {
            setTab('promises');
            setPage(0);
          }}
          active={tab === 'promises'}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2 px-3 pt-2">
          <Tabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(0);
            }}
            ariaLabel="Debtor queue"
            className="border-none"
            items={[
              { value: 'pending', label: 'To call', count: s?.pending },
              { value: 'worked', label: 'Worked', count: s?.worked },
              { value: 'collected', label: 'Collected', count: s?.collected_count },
              { value: 'promises', label: 'Promises', count: s?.due_promises },
              { value: 'all', label: 'All', count: s?.customers },
            ]}
          />
          <Input
            aria-label="Search my debtor list"
            leftIcon={<Search />}
            placeholder="Search name, ID, phone…"
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
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : list.error ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={tab === 'pending' ? <CheckCircle2 /> : <PhoneCall />}
              title={
                periods.length === 0
                  ? 'No debtor list has been uploaded yet'
                  : tab === 'pending'
                    ? 'Every account on your list has been worked'
                    : 'Nothing here'
              }
              description={periods.length === 0 ? 'Your supervisor uploads the list each month.' : undefined}
            />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {rows.map((d) => (
                <DebtorCard key={d.id} d={d} companyName={branding.app_name} onOpen={() => setSelected(d)} />
              ))}
            </ul>
          )}
        </div>

        {(list.data?.count ?? 0) > 20 && (
          <Pagination page={page} pageSize={20} total={list.data!.count} onPageChange={setPage} />
        )}
      </Card>

      <DebtorDrawer debtor={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
    </>
  );
}

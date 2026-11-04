import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useTicketList } from '@/hooks/useTickets';
import { errorMessage } from '@/services/errors';
import { reportsService } from '@/services/reports';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import type { ReportFilters, TicketFilters } from '@/types';
import {
  Card,
  DueBadge,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  StatusBadge,
  TableSkeleton,
  Tabs,
} from '@/components/ui';
import { formatDate } from '@/utils/format';
import { resolveRange } from '@/utils/dateRange';
import { ForwardedWorkTables } from '@/features/reports/ForwardedWork';
import { TicketDrawer } from './TicketDrawer';

type TabKey = 'active' | 'overdue' | 'done';

/**
 * What a regional manager opens on: everything forwarded inside their
 * region. RLS already limits them to that, so there is nothing to filter
 * here — a supervisor or admin sees the whole country on the same screen.
 */
export default function ForwardedPage() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const [tab, setTab] = useState<TabKey>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const debounced = useDebounce(search.trim(), 300);

  /* The summary covers this month; the queue below is live and unfiltered. */
  const reportFilters: ReportFilters = useMemo(() => resolveRange({ preset: 'month' }), []);

  const filters: TicketFilters = useMemo(() => {
    const base: TicketFilters = { search: debounced || undefined };
    if (tab === 'overdue') return { ...base, overdue: true };
    if (tab === 'done') return { ...base, status: ['Resolved', 'Closed'] };
    return { ...base, status: ['Open', 'In-Progress'] };
  }, [tab, debounced]);

  const list = useTicketList(
    { filters, page, pageSize: 20, forwardedOnly: true, sort: [{ id: 'forwarded_at', desc: true }] },
    'field',
  );
  const report = useQuery({
    queryKey: [...qk.reports, 'forwarded', reportFilters],
    queryFn: () => reportsService.forwarded(reportFilters),
  });

  const scope = role === 'regional_manager' && profile?.region ? profile.region : 'every region';

  return (
    <>
      <PageHeader
        eyebrow="Field work"
        title="Forwarded to the districts"
        description={`Tickets sent down to District Operation Officers in ${scope}. This month's summary, then the live queue.`}
      />

      {report.isLoading ? (
        <Card className="mb-5">
          <TableSkeleton rows={5} cols={6} />
        </Card>
      ) : report.error ? (
        <Card className="mb-5">
          <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} />
        </Card>
      ) : report.data && report.data.totals.total > 0 ? (
        <div className="mb-5 space-y-5">
          <ForwardedWorkTables d={report.data} />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2 px-3 pt-2">
          <Tabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(0);
            }}
            ariaLabel="Forwarded tickets"
            className="border-none"
            items={[
              { value: 'active', label: 'Still being worked' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'done', label: 'Finished' },
            ]}
          />
          <Input
            aria-label="Search forwarded tickets"
            leftIcon={<Search />}
            placeholder="Client, ID, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="mb-2 w-full sm:w-64"
          />
        </div>
        <div className="border-t">
          {list.isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : list.error ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (list.data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              title={debounced ? 'No matching tickets' : 'Nothing here'}
              description="Tickets appear once an officer forwards them to a district."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2.5">Ticket</th>
                    <th className="px-4 py-2.5">Client</th>
                    <th className="px-4 py-2.5">District</th>
                    <th className="px-4 py-2.5">Field officer</th>
                    <th className="px-4 py-2.5">Forwarded</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {list.data!.rows.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setDrawerId(t.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          className="font-mono text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/tickets/${t.id}`);
                          }}
                        >
                          {t.ticket_number}
                        </button>
                        <span className="block text-xs text-slate-500">{t.issue_type}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{t.client_name}</span>
                        <span className="block text-xs text-slate-500">{t.community}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.district ?? '—'}
                        <span className="block text-xs text-slate-500">{t.region}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.district_officer_name ?? '—'}
                        <span className="block text-xs text-slate-500">{t.district_officer_manager ?? ''}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(t.forwarded_at)}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap gap-1.5">
                          <StatusBadge status={t.status} />
                          <DueBadge ticket={t} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

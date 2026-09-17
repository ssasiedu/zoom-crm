import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { qk } from '@/lib/queryClient';
import { ACTIVITY_ACTIONS, activityService, type AuditFilters } from '@/services/activity';
import { errorMessage } from '@/services/errors';
import { profilesService } from '@/services/profiles';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Pagination, Select, TableSkeleton } from '@/components/ui';
import { exportToExcel } from '@/utils/export';
import { formatDateTime } from '@/utils/format';
import { describeActivity } from '@/features/tickets/ActivityTimeline';

export function AuditLog() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: qk.profiles, queryFn: profilesService.list });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...qk.audit, filters, page, pageSize],
    queryFn: () => activityService.audit(filters, page, pageSize),
    placeholderData: keepPreviousData,
  });
  const set = (patch: AuditFilters) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const { rows } = await activityService.audit(filters, 0, 5000);
      exportToExcel({
        filename: 'audit-log',
        title: 'Audit log',
        sheets: [
          {
            name: 'Audit log',
            head: ['When', 'User', 'Ticket', 'Client', 'Action', 'Summary', 'Details', 'Note'],
            rows: rows.map((a) => {
              const d = describeActivity(a);
              return [
                formatDateTime(a.created_at),
                a.actor?.full_name ?? 'System',
                a.ticket?.ticket_number ?? '',
                a.ticket?.client_name ?? '',
                a.action,
                d.title,
                (d.details ?? []).join(' | '),
                a.note ?? '',
              ];
            }),
          },
        ],
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input aria-label="Ticket number" placeholder="Ticket no." className="h-8 w-40" value={filters.ticketNumber ?? ''} onChange={(e) => set({ ticketNumber: e.target.value })} />
        <Select
          aria-label="Action"
          size="sm"
          className="w-44"
          placeholder="All actions"
          value={filters.action ?? ''}
          onChange={(e) => set({ action: e.target.value || undefined })}
          options={ACTIVITY_ACTIONS.map((a) => ({ value: a, label: a.replace(/_/g, ' ') }))}
        />
        <Select
          aria-label="User"
          size="sm"
          className="w-48"
          placeholder="All users"
          value={filters.actorId ?? ''}
          onChange={(e) => set({ actorId: e.target.value || undefined })}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
        />
        <Input aria-label="From" type="date" className="h-8 w-auto" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <Input aria-label="To" type="date" className="h-8 w-auto" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        <Button variant="secondary" size="sm" className="ml-auto" leftIcon={<Download className="size-4" />} loading={exporting} onClick={exportAll}>
          Export
        </Button>
      </div>
      {isLoading ? (
        <TableSkeleton rows={10} cols={4} />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : !data?.rows.length ? (
        <EmptyState title="No audit entries" description="Every ticket change is recorded here automatically." />
      ) : (
        <>
          <ul className="divide-y dark:divide-slate-800">
            {data.rows.map((a) => {
              const d = describeActivity(a);
              return (
                <li key={a.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[160px_1fr]">
                  <time className="text-xs text-slate-500 tabular-nums">{formatDateTime(a.created_at)}</time>
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">{a.actor?.full_name ?? 'System'}</span> {d.title}{' '}
                      <Link to={`/tickets/${a.ticket_id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400">
                        {a.ticket?.ticket_number}
                      </Link>{' '}
                      <Badge>{a.action.replace(/_/g, ' ')}</Badge>
                    </p>
                    {a.note && <p className="text-xs text-slate-500 italic">“{a.note}”</p>}
                    {d.details && <p className="truncate text-xs text-slate-500" title={d.details.join('\n')}>{d.details.join(' · ')}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={pageSize} total={data.count} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(0); }} />
        </>
      )}
    </Card>
  );
}

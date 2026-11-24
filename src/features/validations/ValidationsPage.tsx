import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  ClipboardCheck,
  FileSpreadsheet,
  Lock,
  Search,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  type SelectOption,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useLookups, useOfficers } from '@/hooks/useLookups';

import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { validationsService } from '@/services/validations';
import type { ValidationFilters } from '@/types';
import { exportToExcel } from '@/utils/export';
import { formatDate, formatGHS, formatNumber, formatPercent } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { ValidationDrawer } from './ValidationDrawer';
import { ValidationUploadDialog } from './ValidationUploadDialog';
import { ValidationAnalytics } from './ValidationAnalytics';

function AssignDialog({
  open,
  onClose,
  ids,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: officers = [] } = useOfficers();
  const [officer, setOfficer] = useState('');
  const options: SelectOption[] = officers
    .filter((o) => o.is_active && (o.kind ?? 'dm_officer') === 'dm_officer')
    .map((o) => ({ value: o.id, label: `${o.full_name}${o.region ? ` — ${o.region}` : ''}` }));

  const assign = useMutation({
    mutationFn: () => validationsService.assign(ids, officer || null),
    onSuccess: async (n) => {
      toast.success(`${n} customers assigned`);
      await queryClient.invalidateQueries({ queryKey: qk.validations });
      onDone();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign ${ids.length} customers`}
      description="The officer sees them on their phone under My Validation List."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={assign.isPending} onClick={() => assign.mutate()}>
            Assign
          </Button>
        </>
      }
    >
      <Field label="Officer" htmlFor="va-officer">
        <Select
          id="va-officer"
          value={officer}
          onChange={(e) => setOfficer(e.target.value)}
          placeholder="Leave unassigned"
          options={options}
        />
      </Field>
    </Modal>
  );
}

export default function ValidationsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { active } = useLookups();
  const [batch, setBatch] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [response, setResponse] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const debounced = useDebounce(search.trim(), 300);
  const manage = can('validations:manage');

  const batches = useQuery({ queryKey: [...qk.validations, 'batches'], queryFn: validationsService.batchList });
  const rawBatches = useQuery({ queryKey: [...qk.validations, 'raw-batches'], queryFn: validationsService.batches });

  const filters: ValidationFilters = useMemo(
    () => ({ batch: batch || undefined, search: debounced || undefined, region: region || undefined, response: response || undefined }),
    [batch, debounced, region, response],
  );

  const summary = useQuery({
    queryKey: [...qk.validations, 'summary', filters],
    queryFn: () => validationsService.summary(filters),
  });
  const list = useQuery({
    queryKey: [...qk.validations, 'list', filters, page],
    queryFn: () => validationsService.list({ filters, page, pageSize: 25 }),
  });

  const current = (batches.data ?? []).find((b) => b.id === batch);

  const close = useMutation({
    mutationFn: (id: string) => validationsService.updateBatch(id, { status: 'closed' }),
    onSuccess: async () => {
      toast.success('Exercise closed');
      await queryClient.invalidateQueries({ queryKey: qk.validations });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const notify = useMutation({
    mutationFn: (id: string) => validationsService.notifyAssignment(id),
    onSuccess: (n) => toast.success(n > 0 ? `${n} officers told` : 'Nobody to tell yet'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeRows = useMutation({
    mutationFn: () => validationsService.remove(selected),
    onSuccess: async () => {
      toast.success(`${selected.length} removed`);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: qk.validations });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const exportAll = async () => {
    try {
      const rows = await validationsService.listAll(filters);
      exportToExcel({
        filename: `validation-${current?.name ?? 'list'}`.replace(/\s+/g, '-').toLowerCase(),
        title: current?.name ?? 'Data validation',
        sheets: [
          {
            name: 'Customers',
            head: ['Customer', 'Customer ID', 'Region', 'Community', 'Phone', 'Officer', 'Response', 'Calls', 'Outstanding (GHS)', 'Collected (GHS)', 'Comment'],
            rows: rows.map((r) => [
              r.customer_name,
              r.customer_id ?? '',
              r.region ?? '',
              r.community ?? '',
              r.contact_number ?? '',
              r.officer?.full_name ?? '',
              r.response ?? 'Not called',
              r.call_attempts,
              r.outstanding_balance,
              r.amount_collected ?? 0,
              r.comment ?? '',
            ]),
          },
        ],
      });
      toast.success(`${rows.length} rows exported`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const s = summary.data;
  const rows = list.data?.rows ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  return (
    <>
      <PageHeader
        eyebrow="Data validation"
        title="Data validation"
        description="Named exercises: a list of customers, a question to answer about them, and what they said back."
        actions={
          manage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={<FileSpreadsheet className="size-4" />} onClick={exportAll}>
                Export
              </Button>
              <Button leftIcon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>
                Load a list
              </Button>
            </div>
          )
        }
      />

      {/* --- the exercises --- */}
      <Card className="mb-5">
        <CardHeader title="Exercises" description="Pick one to work through its customers" />
        {batches.isLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : batches.error ? (
          <ErrorState message={errorMessage(batches.error)} onRetry={() => batches.refetch()} />
        ) : (batches.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ClipboardCheck />}
            title="No exercises yet"
            description={manage ? 'Load a list to start one.' : 'A supervisor has not started one yet.'}
          />
        ) : (
          <ul className="divide-y dark:divide-slate-800">
            {batches.data!.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setBatch(b.id === batch ? '' : b.id);
                    setPage(0);
                    setSelected([]);
                  }}
                  aria-pressed={b.id === batch}
                  className={`flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left sm:px-5 ${
                    b.id === batch ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900 dark:text-white">{b.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {b.purpose || 'No purpose recorded'} · started {formatDate(b.created_at)}
                    </span>
                  </span>
                  <Badge tone="gray">{formatNumber(b.customers)} customers</Badge>
                  <Badge tone={b.answer_rate >= 80 ? 'green' : 'amber'}>{formatPercent(b.answer_rate)} answered</Badge>
                  {b.active > 0 && <Badge tone="green">{b.active} active</Badge>}
                  {b.inactive > 0 && <Badge tone="red">{b.inactive} gone</Badge>}
                  {b.status === 'closed' && <Badge tone="gray">Closed</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {batch && (
        <>
          <section aria-label="Exercise totals" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Customers" value={formatNumber(s?.customers)} loading={summary.isLoading} />
            <StatCard label="Answered" value={formatNumber(s?.answered)} tone="brand" loading={summary.isLoading} hint={`${formatPercent(s?.answer_rate ?? 0)} of the list`} />
            <StatCard label="Still active" value={formatNumber(s?.active)} tone="green" loading={summary.isLoading} />
            <StatCard label="No longer with us" value={formatNumber(s?.inactive)} tone="red" loading={summary.isLoading} />
            <StatCard label="Could not reach" value={formatNumber(s?.unreachable)} tone="gray" loading={summary.isLoading} />
            <StatCard label="Collected" value={formatGHS(s?.collected ?? 0)} tone="gold" loading={summary.isLoading} hint={`${formatNumber(s?.customers_paid)} paid`} />
          </section>

          <ValidationAnalytics filters={filters} />

          <Card>
            <div className="flex flex-wrap items-end gap-2 px-3 py-3 sm:px-4">
              <Input
                aria-label="Search this list"
                leftIcon={<Search />}
                placeholder="Customer, ID, community…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="w-full sm:w-64"
              />
              <Select
                aria-label="Region"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setPage(0);
                }}
                placeholder="All regions"
                options={active.regions.map((r) => ({ value: r.name, label: r.name }))}
                className="w-full sm:w-44"
              />
              <Select
                aria-label="Response"
                value={response}
                onChange={(e) => {
                  setResponse(e.target.value);
                  setPage(0);
                }}
                placeholder="Any response"
                options={[
                  { value: 'none', label: 'Not called yet' },
                  ...active.validation_responses.map((r) => ({ value: r.name, label: r.name })),
                ]}
                className="w-full sm:w-52"
              />
              {manage && current && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" leftIcon={<BellRing className="size-4" />} loading={notify.isPending} onClick={() => notify.mutate(current.id)}>
                    Tell the officers
                  </Button>
                  {current.status === 'open' && (
                    <Button variant="ghost" size="sm" leftIcon={<Lock className="size-4" />} loading={close.isPending} onClick={() => close.mutate(current.id)}>
                      Close exercise
                    </Button>
                  )}
                </div>
              )}
            </div>

            {manage && selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-y bg-brand-50 px-3 py-2 text-sm dark:bg-brand-500/10">
                <span className="font-medium">{selected.length} selected</span>
                <Button size="xs" variant="secondary" leftIcon={<UserCheck className="size-3.5" />} onClick={() => setAssignOpen(true)}>
                  Assign to an officer
                </Button>
                <Button size="xs" variant="ghost" leftIcon={<Trash2 className="size-3.5" />} loading={removeRows.isPending} onClick={() => removeRows.mutate()}>
                  Remove
                </Button>
                <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setSelected([])}>
                  Clear
                </Button>
              </div>
            )}

            {list.isLoading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : list.error ? (
              <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState title="Nothing here" description="No customers match these filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase dark:bg-slate-900/60">
                    <tr>
                      {manage && (
                        <th className="w-10 px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label="Select every row on this page"
                            checked={allOnPage}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...new Set([...selected, ...rows.map((r) => r.id)])]
                                  : selected.filter((x) => !rows.some((r) => r.id === x)),
                              )
                            }
                          />
                        </th>
                      )}
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Phone</th>
                      <th className="px-3 py-2.5">Region</th>
                      <th className="px-3 py-2.5">Officer</th>
                      <th className="px-3 py-2.5">Response</th>
                      <th className="px-3 py-2.5 text-right">Calls</th>
                      <th className="px-3 py-2.5 text-right">Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-800">
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setDrawerId(r.id)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        {manage && (
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.customer_name}`}
                              checked={selected.includes(r.id)}
                              onChange={(e) =>
                                setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))
                              }
                            />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <span className="font-medium">{r.customer_name}</span>
                          <span className="block text-xs text-slate-500">{r.customer_id ?? r.community ?? ''}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.contact_number ? formatPhone(r.contact_number) : <span className="text-slate-400">none</span>}
                        </td>
                        <td className="px-3 py-2">{r.region ?? '—'}</td>
                        <td className="px-3 py-2">{r.officer?.full_name ?? <span className="text-amber-700">unassigned</span>}</td>
                        <td className="px-3 py-2">
                          {r.response ? <Badge tone="gray">{r.response}</Badge> : <span className="text-slate-400">not called</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.call_attempts}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.amount_collected ? formatGHS(r.amount_collected) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(list.data?.count ?? 0) > 25 && (
              <Pagination page={page} pageSize={25} total={list.data!.count} onPageChange={setPage} />
            )}
          </Card>
        </>
      )}

      <ValidationUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        batches={rawBatches.data ?? []}
        batchId={batch || undefined}
      />
      <AssignDialog open={assignOpen} onClose={() => setAssignOpen(false)} ids={selected} onDone={() => setSelected([])} />
      <ValidationDrawer id={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}

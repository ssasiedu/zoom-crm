import { useEffect, useMemo, useState } from 'react';
import type { RowSelectionState, VisibilityState } from '@tanstack/react-table';
import { format, parse, startOfMonth } from 'date-fns';
import {
  CalendarPlus,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  HandCoins,
  ListChecks,
  Lock,
  LockOpen,
  PhoneCall,
  Search,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useAssignDebtors, useDebtorList, useDebtorPeriods, useDebtorSummary, useInvalidateDebtors } from '@/hooks/useDebtors';
import { toOptions, useLookups, useOfficers } from '@/hooks/useLookups';
import { debtorsService } from '@/services/debtors';
import { errorMessage } from '@/services/errors';
import type { Debtor } from '@/types';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Menu,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
} from '@/components/ui';
import { formatGHS, formatNumber, formatPercent } from '@/utils/format';
import { OfficerPicker } from '@/features/tickets/OfficerPicker';
import { DebtorAnalytics } from './DebtorAnalytics';
import { DebtorDrawer } from './DebtorDrawer';
import { DEBTOR_HIDDEN_COLUMNS, debtorColumns } from './debtorColumns';
import { exportDebtors } from './debtorExport';
import { DebtorUploadDialog } from './DebtorUploadDialog';
import { useDebtorUrlState } from './debtorFilters';

const VIS_KEY = 'zoomlion-crm:debtor-columns';

function monthLabel(period?: { period_month: string }): string {
  return period ? format(parse(period.period_month, 'yyyy-MM-dd', new Date()), 'MMMM yyyy') : 'All months';
}

export default function DebtorsPage() {
  const { can } = useAuth();
  const { active } = useLookups();
  const { data: officers = [] } = useOfficers();
  const { data: periods = [] } = useDebtorPeriods();
  const invalidate = useInvalidateDebtors();
  const state = useDebtorUrlState();
  const { params, filters, sorting, page, pageSize, update, setSorting } = state;

  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, Debtor>>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    try {
      return { ...DEBTOR_HIDDEN_COLUMNS, ...JSON.parse(localStorage.getItem(VIS_KEY) ?? '{}') };
    } catch {
      return DEBTOR_HIDDEN_COLUMNS;
    }
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM'));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [open, setOpen] = useState<Debtor | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search, 350);

  const tab = params.get('tab') === 'analytics' ? 'analytics' : 'list';
  const periodId = filters.period ?? '';
  const period = periods.find((p) => p.id === periodId);

  useEffect(() => {
    if (!params.get('period') && periods.length > 0) update({ period: periods[0].id }, false);
  }, [periods, params, update]);

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const summary = useDebtorSummary(filters);
  const list = useDebtorList({ filters, page, pageSize, sort: sorting });
  const assign = useAssignDebtors();

  const rows = list.data?.rows ?? [];
  const selected = useMemo(() => Object.values(selectedRows), [selectedRows]);
  const clearSelection = () => {
    setSelection({});
    setSelectedRows({});
  };

  const onSelectionChange = (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
    const next = typeof updater === 'function' ? updater(selection) : updater;
    setSelection(next);
    setSelectedRows((prev) => {
      const out: Record<string, Debtor> = {};
      Object.keys(next).forEach((id) => {
        const r = rows.find((x) => x.id === id) ?? prev[id];
        if (r && next[id]) out[id] = r;
      });
      return out;
    });
  };

  const sel = (key: string) => ({
    value: params.get(key) ?? '',
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => update({ [key]: e.target.value || null }),
  });

  const doExport = async (fmt: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const all = selected.length ? selected : await debtorsService.listAll(filters, sorting);
      if (all.length === 0) {
        toast.info('Nothing to export');
        return;
      }
      exportDebtors(all, fmt, `${monthLabel(period)} · ${all.length} accounts`);
      toast.success(`Exported ${formatNumber(all.length)} records`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const s = summary.data;

  return (
    <>
      <PageHeader
        eyebrow="Debt recovery"
        title="Debtor lists"
        description={
          period
            ? `${monthLabel(period)} · ${period.status === 'closed' ? 'closed' : 'open'} for updates`
            : 'Upload the monthly list and track collections'
        }
        actions={
          <>
            <Select
              aria-label="Month"
              className="w-44"
              value={periodId}
              placeholder="All months"
              onChange={(e) => update({ period: e.target.value || null })}
              options={periods.map((p) => ({ value: p.id, label: monthLabel(p) }))}
            />
            {can('tickets:export') && (
              <Menu
                label="Export"
                trigger={({ toggle, ref, open: isOpen }) => (
                  <Button
                    ref={ref}
                    variant="secondary"
                    loading={exporting}
                    onClick={toggle}
                    aria-expanded={isOpen}
                    leftIcon={<Download className="size-4" />}
                    rightIcon={<ChevronDown className="size-3.5" />}
                  >
                    Export{selected.length ? ` (${selected.length})` : ''}
                  </Button>
                )}
                items={[
                  { label: 'Excel (.xlsx)', icon: <FileSpreadsheet />, onSelect: () => doExport('xlsx') },
                  { label: 'CSV', icon: <FileText />, onSelect: () => doExport('csv') },
                  { label: 'PDF', icon: <FileText />, onSelect: () => doExport('pdf') },
                ]}
              />
            )}
            {can('debtors:manage') && (
              <>
                <Button variant="secondary" leftIcon={<CalendarPlus className="size-4" />} onClick={() => setNewPeriodOpen(true)}>
                  New month
                </Button>
                <Button leftIcon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>
                  Upload list
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Accounts" value={formatNumber(s?.customers)} icon={<ListChecks />} tone="gray" loading={summary.isLoading} />
        <StatCard label="Outstanding" value={formatGHS(s?.outstanding ?? 0)} icon={<Wallet />} tone="violet" loading={summary.isLoading} />
        <StatCard
          label="Collected"
          value={formatGHS(s?.collected ?? 0)}
          icon={<HandCoins />}
          tone="green"
          hint={s ? `${formatPercent(s.collection_rate)} of outstanding` : undefined}
          loading={summary.isLoading}
        />
        <StatCard
          label="Still to call"
          value={formatNumber(s?.pending)}
          icon={<PhoneCall />}
          tone="amber"
          loading={summary.isLoading}
          onClick={() => update({ work: 'Pending' })}
          active={params.get('work') === 'Pending'}
        />
        <StatCard label="Contacted" value={formatPercent(s?.contact_rate ?? 0)} icon={<Users />} tone="blue" loading={summary.isLoading} />
        <StatCard
          label="Unassigned"
          value={formatNumber(s?.unassigned)}
          icon={<UserCheck />}
          tone="red"
          loading={summary.isLoading}
          onClick={() => update({ officer: 'unassigned' })}
          active={params.get('officer') === 'unassigned'}
        />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => update({ tab: v === 'analytics' ? 'analytics' : null }, false)}
        ariaLabel="Debtor views"
        items={[
          { value: 'list', label: 'Call list' },
          { value: 'analytics', label: 'Analytics' },
        ]}
      />

      {tab === 'analytics' ? (
        <DebtorAnalytics filters={filters} periodLabel={monthLabel(period)} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
            <Input
              aria-label="Search debtors"
              leftIcon={<Search />}
              placeholder="Search name, customer ID, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-72"
            />
            <Select aria-label="Officer" size="sm" className="w-44" placeholder="All officers" options={[{ value: 'unassigned', label: '— Unassigned —' }, ...officers.map((o) => ({ value: o.id, label: o.full_name }))]} {...sel('officer')} />
            <Select aria-label="Status" size="sm" className="w-36" placeholder="Any status" options={[{ value: 'Pending', label: 'Pending' }, { value: 'Worked', label: 'Worked' }, { value: 'Collected', label: 'Collected' }]} {...sel('work')} />
            <Select aria-label="Feedback" size="sm" className="w-48" placeholder="Any feedback" options={[{ value: 'none', label: '— Not yet called —' }, ...toOptions(active.debtor_feedback)]} {...sel('feedback')} />
            <Select aria-label="Provider" size="sm" className="w-40" placeholder="All providers" options={toOptions(active.providers)} {...sel('provider')} />
            <Select aria-label="Customer type" size="sm" className="w-40" placeholder="All customer types" options={toOptions(active.customer_types)} {...sel('customer_type')} />
            <Select aria-label="Region" size="sm" className="w-40" placeholder="All regions" options={toOptions(active.regions)} {...sel('region')} />
            {state.activeCount > 0 && (
              <Button variant="ghost" size="sm" leftIcon={<X className="size-4" />} onClick={state.clear}>
                Clear
              </Button>
            )}
          </div>

          {list.error ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <DataTable<Debtor>
              data={rows}
              columns={debtorColumns}
              getRowId={(r) => r.id}
              loading={list.isLoading}
              onRowClick={setOpen}
              manual={{
                total: list.data?.count ?? 0,
                page,
                pageSize,
                onPageChange: (p) => update({ page: p ? String(p) : null }, false),
                onPageSizeChange: (size) => update({ size: String(size) }),
              }}
              sorting={sorting}
              onSortingChange={(u) => setSorting(typeof u === 'function' ? u(sorting) : u)}
              rowSelection={selection}
              onRowSelectionChange={can('debtors:manage') ? onSelectionChange : undefined}
              columnVisibility={visibility}
              onColumnVisibilityChange={(u) => {
                setVisibility((old) => {
                  const next = typeof u === 'function' ? u(old) : u;
                  try {
                    localStorage.setItem(VIS_KEY, JSON.stringify(next));
                  } catch {
                    // ignore
                  }
                  return next;
                });
              }}
              showColumnToggle
              caption="Debtor accounts"
              toolbar={
                selected.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 dark:bg-brand-500/10">
                    <span className="text-sm font-semibold text-brand-900 dark:text-brand-200">{selected.length} selected</span>
                    <Badge tone="gold">{formatGHS(selected.reduce((t, d) => t + Number(d.outstanding_balance), 0))}</Badge>
                    <Button size="xs" leftIcon={<UserCheck className="size-3.5" />} onClick={() => setAssignOpen(true)}>
                      Assign officer
                    </Button>
                    <Button size="xs" variant="ghost" className="text-rose-600" leftIcon={<Trash2 className="size-3.5" />} onClick={() => setDeleteOpen(true)}>
                      Delete
                    </Button>
                    <Button size="xs" variant="ghost" leftIcon={<X className="size-3.5" />} onClick={clearSelection}>
                      Clear
                    </Button>
                  </div>
                ) : (
                  period &&
                  can('debtors:manage') && (
                    <Button
                      size="xs"
                      variant="secondary"
                      leftIcon={period.status === 'closed' ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
                      onClick={async () => {
                        try {
                          await debtorsService.updatePeriod(period.id, {
                            status: period.status === 'closed' ? 'open' : 'closed',
                          });
                          invalidate();
                          toast.success(period.status === 'closed' ? 'Month reopened' : 'Month closed');
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      {period.status === 'closed' ? 'Reopen month' : 'Close month'}
                    </Button>
                  )
                )
              }
              empty={
                <EmptyState
                  icon={<HandCoins />}
                  title={periods.length === 0 ? 'No debtor list uploaded yet' : 'No accounts match these filters'}
                  description={
                    periods.length === 0
                      ? 'Upload the monthly spreadsheet to give officers their call lists.'
                      : 'Try clearing a filter or choosing another month.'
                  }
                  action={
                    can('debtors:manage') && periods.length === 0 ? (
                      <Button onClick={() => setUploadOpen(true)}>Upload the first list</Button>
                    ) : state.activeCount > 0 ? (
                      <Button variant="secondary" onClick={state.clear}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </Card>
      )}

      <DebtorDrawer debtor={open} open={Boolean(open)} onClose={() => setOpen(null)} />
      <DebtorUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} periodId={periodId || undefined} />

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        size="lg"
        title={`Assign ${selected.length} account${selected.length === 1 ? '' : 's'}`}
        description="The officer is notified and sees these accounts on their debtor page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={assign.isPending}
              onClick={() =>
                assign.mutate(
                  { ids: selected.map((d) => d.id), officerId: assignTo || null },
                  {
                    onSuccess: async () => {
                      if (assignTo && periodId) {
                        try {
                          await debtorsService.notifyAssignment(periodId, [assignTo]);
                        } catch {
                          // notification is best-effort
                        }
                      }
                      clearSelection();
                      setAssignOpen(false);
                    },
                  },
                )
              }
            >
              {assignTo ? 'Assign' : 'Unassign'}
            </Button>
          </>
        }
      >
        <OfficerPicker value={assignTo} onChange={setAssignTo} compact />
      </Modal>

      <Modal
        open={newPeriodOpen}
        onClose={() => setNewPeriodOpen(false)}
        size="sm"
        title="New month"
        description="Creates an empty month you can upload into."
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewPeriodOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  const created = await debtorsService.createPeriod(`${newMonth}-01`);
                  invalidate();
                  update({ period: created.id });
                  setNewPeriodOpen(false);
                  toast.success('Month created');
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Month" htmlFor="new-period">
          <Input id="new-period" type="month" data-autofocus value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${selected.length} record${selected.length === 1 ? '' : 's'}?`}
        message="Any feedback recorded against them is deleted too. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await debtorsService.remove(selected.map((d) => d.id));
            toast.success('Records deleted');
            clearSelection();
            invalidate();
            setDeleteOpen(false);
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </>
  );
}

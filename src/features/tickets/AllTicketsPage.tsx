import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { RowSelectionState, VisibilityState } from '@tanstack/react-table';
import { ArrowRightLeft, ChevronDown, ClipboardList, Download, FileSpreadsheet, FileText, Plus, Upload, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useTicketList } from '@/hooks/useTickets';
import { errorMessage } from '@/services/errors';
import { ticketsService } from '@/services/tickets';
import type { TicketRow } from '@/types';
import { Button, Card, DataTable, EmptyState, ErrorState, Menu, PageHeader } from '@/components/ui';
import { formatNumber } from '@/utils/format';
import { AssignDialog } from './AssignDialog';
import { BulkStatusDialog } from './BulkStatusDialog';
import { ImportDialog } from './ImportDialog';
import { SavedViewsMenu } from './SavedViewsMenu';
import { DEFAULT_HIDDEN_COLUMNS, ticketColumns } from './ticketColumns';
import { exportTickets, type ExportFormat } from './ticketExport';
import { TicketDrawer } from './TicketDrawer';
import { TicketFiltersBar } from './TicketFiltersBar';
import { useTicketUrlState } from './ticketFilters';

const VIS_KEY = 'dm-crm:ticket-columns';

export default function AllTicketsPage() {
  const navigate = useNavigate();
  const { can, role } = useAuth();
  const state = useTicketUrlState();
  const { filters, sorting, page, pageSize, update, setSorting } = state;
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, TicketRow>>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    try {
      return { ...DEFAULT_HIDDEN_COLUMNS, ...JSON.parse(localStorage.getItem(VIS_KEY) ?? '{}') };
    } catch {
      return DEFAULT_HIDDEN_COLUMNS;
    }
  });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useTicketList({ filters, page, pageSize, sort: sorting });
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  // keep row objects for selected ids across pages
  const onSelectionChange = (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
    const next = typeof updater === 'function' ? updater(selection) : updater;
    setSelection(next);
    setSelectedRows((prev) => {
      const out: Record<string, TicketRow> = {};
      Object.keys(next).forEach((id) => {
        const r = rows.find((x) => x.id === id) ?? prev[id];
        if (r && next[id]) out[id] = r;
      });
      return out;
    });
  };
  const selected = useMemo(() => Object.values(selectedRows), [selectedRows]);
  const clearSelection = () => {
    setSelection({});
    setSelectedRows({});
  };

  const doExport = async (fmt: ExportFormat) => {
    setExporting(true);
    try {
      const all = selected.length ? selected : await ticketsService.listAll(filters, sorting);
      if (all.length === 0) {
        toast.info('Nothing to export');
        return;
      }
      if (fmt === 'pdf' && all.length > 3000) {
        toast.error('PDF export is limited to 3,000 rows. Use Excel instead or narrow the filters.');
        return;
      }
      exportTickets(all, fmt, selected.length ? `${selected.length} selected tickets` : `${all.length} tickets (current filters)`);
      toast.success(`Exported ${formatNumber(all.length)} tickets`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const bulkRegion = selected.length && selected.every((s) => s.region === selected[0].region) ? selected[0].region : null;

  return (
    <>
      <PageHeader
        eyebrow="Tickets"
        title={role === 'agent' ? 'My created tickets' : 'All tickets'}
        description={isLoading ? 'Loading…' : `${formatNumber(total)} ticket${total === 1 ? '' : 's'} match the current filters`}
        actions={
          <>
            {can('tickets:import') && (
              <Button variant="secondary" leftIcon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
                Import
              </Button>
            )}
            {can('tickets:export') && (
              <Menu
                label="Export"
                trigger={({ toggle, ref, open }) => (
                  <Button
                    ref={ref}
                    variant="secondary"
                    loading={exporting}
                    onClick={toggle}
                    aria-expanded={open}
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
            {can('tickets:create') && (
              <Button leftIcon={<Plus className="size-4" />} onClick={() => navigate('/tickets/new')}>
                New ticket
              </Button>
            )}
          </>
        }
      />

      <Card className="overflow-hidden">
        <TicketFiltersBar state={state} />
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : (
          <DataTable<TicketRow>
            data={rows}
            columns={ticketColumns}
            getRowId={(r) => r.id}
            loading={isLoading}
            onRowClick={(r) => setDrawerId(r.id)}
            manual={{
              total,
              page,
              pageSize,
              onPageChange: (p) => update({ page: p ? String(p) : null }, false),
              onPageSizeChange: (s) => update({ size: String(s) }),
            }}
            sorting={sorting}
            onSortingChange={(u) => setSorting(typeof u === 'function' ? u(sorting) : u)}
            rowSelection={selection}
            onRowSelectionChange={can('tickets:assign') || can('tickets:export') ? onSelectionChange : undefined}
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
            caption="Tickets"
            rowClassName={(r) => (r.is_overdue ? 'shadow-[inset_3px_0_0_0_var(--color-rose-500)]' : undefined)}
            toolbar={
              selected.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 dark:bg-brand-500/10">
                  <span className="text-sm font-semibold text-brand-900 dark:text-brand-200">{selected.length} selected</span>
                  {can('tickets:assign') && (
                    <Button size="xs" leftIcon={<UserCheck className="size-3.5" />} onClick={() => setAssignOpen(true)}>
                      Assign
                    </Button>
                  )}
                  {can('tickets:close') && (
                    <Button size="xs" variant="secondary" leftIcon={<ArrowRightLeft className="size-3.5" />} onClick={() => setStatusOpen(true)}>
                      Change status
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" leftIcon={<X className="size-3.5" />} onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              ) : (
                <>
                  <SavedViewsMenu snapshot={state.snapshot} apply={state.applySnapshot} />
                  {isFetching && !isLoading && <span className="text-xs text-slate-400">Updating…</span>}
                </>
              )
            }
            empty={
              <EmptyState
                icon={<ClipboardList />}
                title={state.activeCount ? 'No tickets match these filters' : 'No tickets yet'}
                description={state.activeCount ? 'Try removing a filter or widening the date range.' : 'Tickets you can access will appear here.'}
                action={
                  state.activeCount ? (
                    <Button variant="secondary" onClick={state.clear}>
                      Clear filters
                    </Button>
                  ) : can('tickets:create') ? (
                    <Button onClick={() => navigate('/tickets/new')}>Create the first ticket</Button>
                  ) : undefined
                }
              />
            }
          />
        )}
      </Card>

      <TicketDrawer ticketId={drawerId} onClose={() => setDrawerId(null)} />
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        ticketIds={selected.map((s) => s.id)}
        region={bulkRegion}
        onDone={clearSelection}
      />
      <BulkStatusDialog open={statusOpen} onClose={() => setStatusOpen(false)} tickets={selected} onDone={clearSelection} />
      {can('tickets:import') && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />}
    </>
  );
}

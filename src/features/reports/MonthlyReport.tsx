import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parse, startOfMonth, subMonths } from 'date-fns';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardHeader, ErrorState, Field, Input, StatCard, TableSkeleton } from '@/components/ui';
import { useBranding } from '@/hooks/useSettings';
import { useLookups } from '@/hooks/useLookups';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { reportsService } from '@/services/reports';
import type { ReportFilters } from '@/types';
import { exportToExcel, exportToPdf, type ExportSheet } from '@/utils/export';
import { formatGHS, formatHours, formatNumber, formatPercent } from '@/utils/format';
import { ReportTable, sum } from './ReportTable';
import {
  contactTypesPresent,
  debtorCallMap,
  debtorMoneySheet,
  loadIssueSheets,
  loadPaymentSheets,
  loadSlaSheets,
  officerColumns,
  officerSheet,
  outboundSheet,
  paymentStatusSheets,
  pivotIssues,
  pivotPaymentStatus,
  statusSheet,
  DEBTOR_MONEY_COLUMNS,
  OUTBOUND_REGION_COLUMNS,
} from './reports';
import { toPdfSheets } from './pdfSheets';

async function loadMonthly(f: ReportFilters) {
  const [kpis, combined, regions, contact, issues, outbound, paymentStatus, debtorMoney, officers] = await Promise.all([
    reportsService.kpis(f),
    reportsService.combined(f),
    reportsService.statusByRegion(f),
    reportsService.breakdown('contact_type', f),
    reportsService.issueTypeByRegion(f),
    reportsService.outboundByRegion(f),
    reportsService.paymentStatusByRegion(f),
    reportsService.debtorMoneyByRegion(f),
    reportsService.officerPerformanceCombined(f),
  ]);
  return { kpis, combined, regions, contact, issues, outbound, paymentStatus, debtorMoney, officers };
}

type MonthlyData = Awaited<ReturnType<typeof loadMonthly>>;

export function MonthlyReport({ baseFilters }: { baseFilters: ReportFilters }) {
  const branding = useBranding();
  const { lookups } = useLookups();
  const [month, setMonth] = useState(() => format(subMonths(new Date(), new Date().getDate() < 5 ? 1 : 0), 'yyyy-MM'));
  const [busy, setBusy] = useState(false);
  const monthDate = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  const label = format(monthDate, 'MMMM yyyy');
  const filters: ReportFilters = useMemo(
    () => ({
      ...baseFilters,
      from: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
      to: format(endOfMonth(monthDate), 'yyyy-MM-dd'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, baseFilters.region, baseFilters.officer, baseFilters.issueType, baseFilters.contactType],
  );
  const q = useQuery({ queryKey: [...qk.reports, 'monthly', filters], queryFn: () => loadMonthly(filters) });

  const buildSheets = async (): Promise<ExportSheet[]> => {
    const d = q.data ?? (await loadMonthly(filters));
    const k = d.kpis;
    const c = d.combined;
    const summary: ExportSheet = {
      name: 'Summary',
      head: ['Metric', 'Value'],
      rows: [
        ['Total tickets opened', k.total],
        ['Open', k.open],
        ['In-Progress', k.in_progress],
        ['Resolved', k.resolved],
        ['Closed', k.closed],
        ['Overdue (still active)', k.overdue],
        ['Unassigned (active)', k.unassigned],
        ['Resolution rate', formatPercent(k.resolution_rate)],
        ['SLA compliance (resolved on time)', formatPercent(k.sla_compliance)],
        ['Average resolution time', formatHours(k.avg_resolution_hours)],
        ['Inbound calls', c.ticket_inbound_calls],
        ['Outbound calls (total)', c.outbound_calls_total],
        ['— of which ticket calls', c.ticket_outbound_calls],
        ['— of which debtor calls', c.debtor_calls],
        ['All calls', c.calls_total],
        ['Ticket payments', formatGHS(c.ticket_payments, { plain: true })],
        ['Received from debtors', formatGHS(c.debtor_collected, { plain: true })],
        ['Total received', formatGHS(c.payments_total, { plain: true })],
      ],
    };
    const breakdown = (name: string, rows: { label: string; count: number }[]): ExportSheet => ({
      name,
      head: ['Value', 'Tickets', 'Share %'],
      rows: rows.map((r) => [r.label, r.count, Number(((100 * r.count) / Math.max(1, k.total)).toFixed(1))]),
      foot: ['TOTAL', sum(rows, (r) => r.count), 100],
    });
    const [issues, payments, sla] = await Promise.all([
      loadIssueSheets(filters),
      loadPaymentSheets(filters),
      loadSlaSheets(filters),
    ]);
    return [
      summary,
      breakdown('By type of contact', d.contact),
      statusSheet(d.regions),
      ...issues,
      outboundSheet(d.outbound),
      ...paymentStatusSheets(d.paymentStatus, lookups.payment_statuses.map((s) => s.name)),
      debtorMoneySheet(d.debtorMoney),
      ...payments.slice(0, 1),
      officerSheet(d.officers),
      ...sla.slice(0, 1),
    ];
  };

  const run = async (kind: 'pdf' | 'xlsx') => {
    setBusy(true);
    try {
      const sheets = await buildSheets();
      const opts = {
        filename: `monthly-report-${month}`,
        title: `${branding.app_name} — Monthly report, ${label}`,
        subtitle: [baseFilters.region, baseFilters.issueType, baseFilters.contactType].filter(Boolean).join(' · ') || 'All regions',
        sheets: kind === 'pdf' ? toPdfSheets(sheets) : sheets,
        orientation: 'landscape' as const,
      };
      if (kind === 'pdf') exportToPdf(opts);
      else exportToExcel(opts);
      toast.success(`Monthly report for ${label} downloaded`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const d = q.data;
  return (
    <div className="space-y-5">
      <Card className="no-print flex flex-wrap items-end gap-3 p-4">
        <Field label="Month" htmlFor="report-month">
          <Input id="report-month" type="month" value={month} max={format(new Date(), 'yyyy-MM')} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        <p className="flex-1 text-sm text-slate-500">
          A printable summary of {label}. Region, officer, issue and channel filters above still apply; the date range is replaced by the month.
        </p>
        <Button variant="secondary" leftIcon={<Printer className="size-4" />} onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="secondary" leftIcon={<FileSpreadsheet className="size-4" />} loading={busy} onClick={() => run('xlsx')}>
          Excel
        </Button>
        <Button leftIcon={<FileDown className="size-4" />} loading={busy} onClick={() => run('pdf')}>
          Download PDF
        </Button>
      </Card>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">
          {branding.app_name} — Monthly report, {label}
        </h1>
      </div>

      {q.isLoading ? (
        <Card>
          <TableSkeleton />
        </Card>
      ) : q.error ? (
        <Card>
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Card>
      ) : d ? (
        <MonthlySections d={d} issueOrder={lookups.issue_types.map((i) => i.name)} regionOrder={lookups.regions.map((r) => r.name)} statusOrder={lookups.payment_statuses.map((s) => s.name)} contactOrder={lookups.contact_types.map((c) => c.name)} />
      ) : null}
    </div>
  );
}

function MonthlySections({
  d,
  issueOrder,
  regionOrder,
  statusOrder,
  contactOrder,
}: {
  d: MonthlyData;
  issueOrder: string[];
  regionOrder: string[];
  statusOrder: string[];
  contactOrder: string[];
}) {
  const k = d.kpis;
  const c = d.combined;
  const issuePivot = useMemo(
    () => pivotIssues(d.issues, issueOrder, regionOrder, debtorCallMap(d.outbound)),
    [d.issues, d.outbound, issueOrder, regionOrder],
  );
  const payments = useMemo(() => pivotPaymentStatus(d.paymentStatus, statusOrder), [d.paymentStatus, statusOrder]);
  const outbound = d.outbound.filter((r) => r.total_outbound > 0);
  const debtorMoney = d.debtorMoney.filter((r) => r.calls > 0 || r.collected > 0);
  const officerContactTypes = contactTypesPresent(d.officers, contactOrder);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tickets opened" value={formatNumber(k.total)} />
        <StatCard label="Resolved + closed" value={formatNumber(k.resolved + k.closed)} tone="green" />
        <StatCard label="Resolution rate" value={formatPercent(k.resolution_rate)} hint={`SLA met ${formatPercent(k.sla_compliance)}`} />
        <StatCard label="Total received" value={formatGHS(c.payments_total)} tone="gold" hint={`${formatGHS(c.debtor_collected)} from debtors`} />
        <StatCard label="Inbound calls" value={formatNumber(c.ticket_inbound_calls)} tone="violet" />
        <StatCard
          label="Outbound calls"
          value={formatNumber(c.outbound_calls_total)}
          tone="blue"
          hint={`${formatNumber(c.ticket_outbound_calls)} tickets · ${formatNumber(c.debtor_calls)} debtors`}
        />
        <StatCard label="Overdue" value={formatNumber(k.overdue)} tone="red" />
        <StatCard label="Avg. resolution" value={formatHours(k.avg_resolution_hours)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="By type of contact" />
          <ReportTable
            caption="By type of contact"
            rows={d.contact}
            rowKey={(r) => r.label}
            columns={[
              { key: 'l', header: 'Value', render: (r) => r.label, footer: 'Total' },
              { key: 'c', header: 'Tickets', align: 'right', render: (r) => r.count, footer: formatNumber(sum(d.contact, (r) => r.count)) },
              { key: 's', header: 'Share', align: 'right', render: (r) => formatPercent((100 * r.count) / Math.max(1, k.total)) },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Outbound calls per region" description="Ticket calls and debtor calls together" />
          <ReportTable caption="Outbound calls per region" columns={OUTBOUND_REGION_COLUMNS(outbound)} rows={outbound} rowKey={(r) => r.region} />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Issue type per region"
          description="Debt recovery is the debtor calls logged in that region, which carry no issue type of their own."
        />
        <ReportTable
          caption="Issue type per region"
          rows={issuePivot.table}
          rowKey={(r) => r.region}
          columns={[
            { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
            ...issuePivot.issues.map((i) => ({
              key: i,
              header: i,
              align: 'right' as const,
              render: (r: (typeof issuePivot.table)[number]) => r.counts[i] || <span className="text-slate-300 dark:text-slate-600">0</span>,
              footer: formatNumber(sum(issuePivot.table, (r) => r.counts[i])),
            })),
            { key: 'tickets', header: 'Tickets', align: 'right' as const, render: (r: (typeof issuePivot.table)[number]) => r.tickets, footer: formatNumber(sum(issuePivot.table, (r) => r.tickets)) },
            {
              key: 'debtor',
              header: 'Debt recovery',
              align: 'right' as const,
              render: (r: (typeof issuePivot.table)[number]) => r.debtor || <span className="text-slate-300 dark:text-slate-600">0</span>,
              footer: formatNumber(sum(issuePivot.table, (r) => r.debtor)),
            },
            { key: 'total', header: 'Total', align: 'right' as const, render: (r: (typeof issuePivot.table)[number]) => <strong>{r.total}</strong>, footer: formatNumber(sum(issuePivot.table, (r) => r.total)) },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Regions" />
        <ReportTable
          caption="Regions"
          rows={d.regions.filter((r) => r.total > 0)}
          rowKey={(r) => r.region}
          columns={[
            { key: 'r', header: 'Region', render: (r) => r.region },
            { key: 't', header: 'Tickets', align: 'right', render: (r) => r.total },
            { key: 'res', header: 'Resolved + closed', align: 'right', render: (r) => r.resolved + r.closed },
            { key: 'o', header: 'Overdue', align: 'right', render: (r) => r.overdue },
            { key: 'rate', header: 'Resolution %', align: 'right', render: (r) => formatPercent(r.resolution_rate) },
            { key: 'p', header: 'Payments', align: 'right', render: (r) => formatGHS(r.payments) },
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="Payment status per region"
          description="Money recovered from debtors is counted as Receivables, and shown again on its own so the two halves can be told apart."
        />
        <ReportTable
          caption="Payment status per region"
          rows={payments.byRegion}
          rowKey={(r) => r.region}
          columns={[
            { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
            ...payments.statuses.map((s) => ({
              key: s,
              header: s,
              align: 'right' as const,
              render: (r: (typeof payments.byRegion)[number]) =>
                r.amounts[s] ? formatGHS(r.amounts[s]) : <span className="text-slate-300 dark:text-slate-600">—</span>,
              footer: formatGHS(sum(payments.byRegion, (r) => r.amounts[s])),
            })),
            {
              key: 'debt',
              header: 'of which debtors',
              align: 'right' as const,
              render: (r: (typeof payments.byRegion)[number]) =>
                r.debtor_total ? formatGHS(r.debtor_total) : <span className="text-slate-300 dark:text-slate-600">—</span>,
              footer: formatGHS(sum(payments.byRegion, (r) => r.debtor_total)),
            },
            {
              key: 'total',
              header: 'Total',
              align: 'right' as const,
              render: (r: (typeof payments.byRegion)[number]) => <strong>{formatGHS(r.total)}</strong>,
              footer: formatGHS(sum(payments.byRegion, (r) => r.total)),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Debtor collections per region" description="Counted on the day of the call that collected the money" />
        <ReportTable caption="Debtor collections per region" columns={DEBTOR_MONEY_COLUMNS(debtorMoney)} rows={debtorMoney} rowKey={(r) => r.region} />
      </Card>

      <Card>
        <CardHeader
          title="Officer performance"
          description="Total calls adds the debtor calls to every ticket contact — inbound, outbound, WhatsApp, text and walk-in."
        />
        <ReportTable
          caption="Officer performance"
          columns={officerColumns(d.officers, officerContactTypes)}
          rows={d.officers}
          rowKey={(r) => r.officer_id}
        />
      </Card>
    </>
  );
}

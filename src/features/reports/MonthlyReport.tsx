import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parse, startOfMonth, subMonths } from 'date-fns';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardHeader, ErrorState, Field, Input, StatCard, TableSkeleton } from '@/components/ui';
import { useBranding } from '@/hooks/useSettings';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { reportsService } from '@/services/reports';
import type { ReportFilters } from '@/types';
import { exportToExcel, exportToPdf, type ExportSheet } from '@/utils/export';
import { formatGHS, formatHours, formatNumber, formatPercent } from '@/utils/format';
import { ReportTable, sum } from './ReportTable';
import { loadIssueSheets, loadOfficerSheets, loadPaymentSheets, loadSlaSheets, statusSheet } from './reports';
import { toPdfSheets } from './pdfSheets';

async function loadMonthly(f: ReportFilters) {
  const [kpis, regions, contact, issues] = await Promise.all([
    reportsService.kpis(f),
    reportsService.statusByRegion(f),
    reportsService.breakdown('contact_type', f),
    reportsService.breakdown('issue_type', f),
  ]);
  return { kpis, regions, contact, issues };
}

export function MonthlyReport({ baseFilters }: { baseFilters: ReportFilters }) {
  const branding = useBranding();
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
        ['Total payments', formatGHS(k.total_payments, { plain: true })],
      ],
    };
    const breakdown = (name: string, rows: { label: string; count: number }[]): ExportSheet => ({
      name,
      head: ['Value', 'Tickets', 'Share %'],
      rows: rows.map((r) => [r.label, r.count, Number(((100 * r.count) / Math.max(1, k.total)).toFixed(1))]),
      foot: ['TOTAL', sum(rows, (r) => r.count), 100],
    });
    const [issues, payments, officers, sla] = await Promise.all([
      loadIssueSheets(filters),
      loadPaymentSheets(filters),
      loadOfficerSheets(filters),
      loadSlaSheets(filters),
    ]);
    return [
      summary,
      breakdown('By type of contact', d.contact),
      breakdown('By issue type', d.issues),
      statusSheet(d.regions),
      ...issues,
      ...payments.slice(0, 1),
      ...officers,
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
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Tickets opened" value={formatNumber(d.kpis.total)} />
            <StatCard label="Resolved + closed" value={formatNumber(d.kpis.resolved + d.kpis.closed)} tone="green" />
            <StatCard label="Resolution rate" value={formatPercent(d.kpis.resolution_rate)} hint={`SLA met ${formatPercent(d.kpis.sla_compliance)}`} />
            <StatCard label="Payments" value={formatGHS(d.kpis.total_payments)} tone="gold" />
            <StatCard label="Still open" value={formatNumber(d.kpis.open + d.kpis.in_progress)} tone="blue" />
            <StatCard label="Overdue" value={formatNumber(d.kpis.overdue)} tone="red" />
            <StatCard label="Unassigned" value={formatNumber(d.kpis.unassigned)} tone="violet" />
            <StatCard label="Avg. resolution" value={formatHours(d.kpis.avg_resolution_hours)} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {[
              { title: 'By type of contact', rows: d.contact },
              { title: 'By issue type', rows: d.issues },
            ].map((b) => (
              <Card key={b.title}>
                <CardHeader title={b.title} />
                <ReportTable
                  caption={b.title}
                  rows={b.rows}
                  rowKey={(r) => r.label}
                  columns={[
                    { key: 'l', header: 'Value', render: (r) => r.label, footer: 'Total' },
                    { key: 'c', header: 'Tickets', align: 'right', render: (r) => r.count, footer: formatNumber(sum(b.rows, (r) => r.count)) },
                    { key: 's', header: 'Share', align: 'right', render: (r) => formatPercent((100 * r.count) / Math.max(1, d.kpis.total)) },
                  ]}
                />
              </Card>
            ))}
          </div>
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
        </>
      ) : null}
    </div>
  );
}

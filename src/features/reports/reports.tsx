import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ChartCard, ChartTooltip, useChartTheme } from '@/components/charts/ChartKit';
import { Card, CardHeader, EmptyState, ErrorState, StatCard, TableSkeleton } from '@/components/ui';
import { useLookups } from '@/hooks/useLookups';
import { CHART_PALETTE, STATUS_COLORS } from '@/lib/constants';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { reportsService } from '@/services/reports';
import type {
  IssueByRegionRow,
  OfficerPerformanceRow,
  PaymentRow,
  ReportFilters,
  SlaAgingReport,
  StatusByRegionRow,
} from '@/types';
import type { ExportSheet } from '@/utils/export';
import { formatGHS, formatHours, formatMinutes, formatNumber, formatPercent } from '@/utils/format';
import { ticketsUrl } from '@/features/tickets/ticketFilters';
import { heat, ReportTable, sum, type ReportColumn } from './ReportTable';

export interface ReportProps {
  filters: ReportFilters;
  ticketParams: Record<string, string | undefined>;
}

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  /** builds export sheets from fetched data */
  load: (f: ReportFilters) => Promise<ExportSheet[]>;
  Component: (props: ReportProps) => React.ReactElement;
}

const money = (v: number) => formatGHS(v);
const pdfMoney = (v: number) => Number(v.toFixed(2));

function useReport<T>(name: string, filters: ReportFilters, fn: (f: ReportFilters) => Promise<T>) {
  return useQuery({ queryKey: [...qk.reports, name, filters], queryFn: () => fn(filters) });
}

function Frame({ loading, error, retry, empty, children }: { loading: boolean; error: unknown; retry: () => void; empty: boolean; children: React.ReactNode }) {
  if (loading) return <Card><TableSkeleton rows={8} cols={6} /></Card>;
  if (error) return <Card><ErrorState message={errorMessage(error)} onRetry={retry} /></Card>;
  if (empty) return <Card><EmptyState title="No tickets for this selection" description="Try a wider date range or fewer filters." /></Card>;
  return <div className="space-y-5">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* 1. Status per region                                                */
/* ------------------------------------------------------------------ */
function statusSheet(rows: StatusByRegionRow[]): ExportSheet {
  return {
    name: 'Status per region',
    head: ['Region', 'Open', 'In-Progress', 'Resolved', 'Closed', 'Total', 'Overdue', 'Resolution %', 'Payments (GHS)'],
    rows: rows.map((r) => [r.region, r.open, r.in_progress, r.resolved, r.closed, r.total, r.overdue, r.resolution_rate, pdfMoney(r.payments)]),
    foot: [
      'TOTAL',
      sum(rows, (r) => r.open),
      sum(rows, (r) => r.in_progress),
      sum(rows, (r) => r.resolved),
      sum(rows, (r) => r.closed),
      sum(rows, (r) => r.total),
      sum(rows, (r) => r.overdue),
      Number(((100 * sum(rows, (r) => r.resolved + r.closed)) / Math.max(1, sum(rows, (r) => r.total))).toFixed(1)),
      pdfMoney(sum(rows, (r) => r.payments)),
    ],
  };
}

function StatusByRegion({ filters, ticketParams }: ReportProps) {
  const navigate = useNavigate();
  const theme = useChartTheme();
  const q = useReport('status-region', filters, reportsService.statusByRegion);
  const rows = q.data ?? [];
  const total = sum(rows, (r) => r.total);
  const go = (region: string, extra: Record<string, string> = {}) => navigate(ticketsUrl({ ...ticketParams, region, ...extra }));
  const n = (v: number, region: string, status?: string) =>
    v ? (
      <button type="button" className="hover:underline" onClick={(e) => { e.stopPropagation(); go(region, status ? { status } : {}); }}>
        {formatNumber(v)}
      </button>
    ) : (
      <span className="text-slate-300 dark:text-slate-600">0</span>
    );
  const columns: ReportColumn<StatusByRegionRow>[] = [
    { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
    { key: 'open', header: 'Open', align: 'right', render: (r) => n(r.open, r.region, 'Open'), footer: formatNumber(sum(rows, (r) => r.open)) },
    { key: 'ip', header: 'In-Progress', align: 'right', render: (r) => n(r.in_progress, r.region, 'In-Progress'), footer: formatNumber(sum(rows, (r) => r.in_progress)) },
    { key: 'res', header: 'Resolved', align: 'right', render: (r) => n(r.resolved, r.region, 'Resolved'), footer: formatNumber(sum(rows, (r) => r.resolved)) },
    { key: 'closed', header: 'Closed', align: 'right', render: (r) => n(r.closed, r.region, 'Closed'), footer: formatNumber(sum(rows, (r) => r.closed)) },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <strong>{n(r.total, r.region)}</strong>, footer: formatNumber(total) },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      render: (r) => (r.overdue ? <span className="font-semibold text-rose-600">{n(r.overdue, r.region)}</span> : n(0, r.region)),
      footer: formatNumber(sum(rows, (r) => r.overdue)),
    },
    { key: 'rate', header: 'Resolution %', align: 'right', render: (r) => formatPercent(r.resolution_rate) },
    { key: 'pay', header: 'Payments', align: 'right', render: (r) => money(r.payments), footer: money(sum(rows, (r) => r.payments)) },
  ];
  return (
    <Frame loading={q.isLoading} error={q.error} retry={() => q.refetch()} empty={total === 0}>
      <ChartCard title="Status mix by region" height={320}>
        <ResponsiveContainer>
          <BarChart data={rows.filter((r) => r.total > 0)} margin={{ top: 5, right: 10, left: -15, bottom: 40 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="region" tick={theme.tick} angle={-35} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
            <Legend iconType="circle" verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="open" name="Open" stackId="s" fill={STATUS_COLORS.Open} />
            <Bar dataKey="in_progress" name="In-Progress" stackId="s" fill={STATUS_COLORS['In-Progress']} />
            <Bar dataKey="resolved" name="Resolved" stackId="s" fill={STATUS_COLORS.Resolved} />
            <Bar dataKey="closed" name="Closed" stackId="s" fill={STATUS_COLORS.Closed} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Card>
        <CardHeader title="Ticket status per region" description="Click a number to open those tickets" />
        <ReportTable caption="Ticket status per region" columns={columns} rows={rows} rowKey={(r) => r.region} />
      </Card>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Issue type per region                                            */
/* ------------------------------------------------------------------ */
function pivotIssues(rows: IssueByRegionRow[], issueOrder: string[], regionOrder: string[]) {
  const issues = [...new Set([...issueOrder.filter((i) => rows.some((r) => r.issue_type === i)), ...rows.map((r) => r.issue_type)])];
  const regions = [...new Set([...regionOrder.filter((g) => rows.some((r) => r.region === g)), ...rows.map((r) => r.region)])];
  const cell = new Map(rows.map((r) => [`${r.region}|${r.issue_type}`, r.count]));
  const table = regions.map((region) => {
    const counts = Object.fromEntries(issues.map((i) => [i, cell.get(`${region}|${i}`) ?? 0]));
    return { region, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
  return { issues, table, max: Math.max(0, ...rows.map((r) => r.count)) };
}

function IssueByRegion({ filters, ticketParams }: ReportProps) {
  const navigate = useNavigate();
  const theme = useChartTheme();
  const { lookups } = useLookups();
  const q = useReport('issue-region', filters, reportsService.issueTypeByRegion);
  const { issues, table, max } = useMemo(
    () => pivotIssues(q.data ?? [], lookups.issue_types.map((i) => i.name), lookups.regions.map((r) => r.name)),
    [q.data, lookups],
  );
  type Row = (typeof table)[number];
  const columns: ReportColumn<Row>[] = [
    { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
    ...issues.map<ReportColumn<Row>>((i) => ({
      key: i,
      header: i,
      align: 'right',
      className: '',
      render: (r) =>
        r.counts[i] ? (
          <button
            type="button"
            className={`-mx-2 -my-1 rounded px-2 py-1 hover:underline ${heat(r.counts[i], max) ?? ''}`}
            onClick={() => navigate(ticketsUrl({ ...ticketParams, region: r.region, issue_type: i }))}
          >
            {r.counts[i]}
          </button>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">0</span>
        ),
      footer: formatNumber(sum(table, (r) => r.counts[i])),
    })),
    { key: 'total', header: 'Total', align: 'right', render: (r) => <strong>{r.total}</strong>, footer: formatNumber(sum(table, (r) => r.total)) },
  ];
  const chartData = table.map((r) => ({ region: r.region, ...r.counts }));
  return (
    <Frame loading={q.isLoading} error={q.error} retry={() => q.refetch()} empty={table.length === 0}>
      <ChartCard title="Issue types by region" height={340}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 40 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="region" tick={theme.tick} angle={-35} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
            <Legend iconType="circle" verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
            {issues.map((i, idx) => (
              <Bar key={i} dataKey={i} stackId="s" fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Card>
        <CardHeader title="Issue type per region" description="Darker cells have more tickets" />
        <ReportTable caption="Issue type per region" columns={columns} rows={table} rowKey={(r) => r.region} />
      </Card>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Payments per region                                              */
/* ------------------------------------------------------------------ */
function pivotPayments(rows: PaymentRow[], typeOrder: string[]) {
  const types = [...new Set([...typeOrder.filter((t) => rows.some((r) => r.payment_type === t)), ...rows.map((r) => r.payment_type)])];
  const regions = [...new Set(rows.map((r) => r.region))].sort();
  const byRegion = regions.map((region) => {
    const rr = rows.filter((r) => r.region === region);
    const amounts = Object.fromEntries(types.map((t) => [t, sum(rr.filter((r) => r.payment_type === t), (r) => r.total)]));
    return { region, amounts, total: sum(rr, (r) => r.total), count: sum(rr, (r) => r.count) };
  }).sort((a, b) => b.total - a.total);
  const group = (key: 'payment_source' | 'payment_status') =>
    [...new Set(rows.map((r) => r[key]))].map((label) => {
      const rr = rows.filter((r) => r[key] === label);
      return { label, total: sum(rr, (r) => r.total), count: sum(rr, (r) => r.count) };
    }).sort((a, b) => b.total - a.total);
  return { types, byRegion, bySource: group('payment_source'), byStatus: group('payment_status') };
}

function PaymentsByRegion({ filters }: ReportProps) {
  const theme = useChartTheme();
  const { lookups } = useLookups();
  const q = useReport('payments-region', filters, reportsService.paymentsByRegion);
  const p = useMemo(() => pivotPayments(q.data ?? [], lookups.payment_types.map((t) => t.name)), [q.data, lookups]);
  type Row = (typeof p.byRegion)[number];
  const columns: ReportColumn<Row>[] = [
    { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
    ...p.types.map<ReportColumn<Row>>((t) => ({
      key: t,
      header: t,
      align: 'right',
      render: (r) => (r.amounts[t] ? money(r.amounts[t]) : <span className="text-slate-300 dark:text-slate-600">—</span>),
      footer: money(sum(p.byRegion, (r) => r.amounts[t])),
    })),
    { key: 'count', header: 'Tickets', align: 'right', render: (r) => r.count, footer: formatNumber(sum(p.byRegion, (r) => r.count)) },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <strong>{money(r.total)}</strong>, footer: money(sum(p.byRegion, (r) => r.total)) },
  ];
  const small = (title: string, data: { label: string; total: number; count: number }[]) => (
    <Card>
      <CardHeader title={title} />
      <ReportTable
        caption={title}
        rows={data}
        rowKey={(r) => r.label}
        columns={[
          { key: 'l', header: 'Value', render: (r) => r.label, footer: 'Total' },
          { key: 'c', header: 'Tickets', align: 'right', render: (r) => r.count, footer: formatNumber(sum(data, (r) => r.count)) },
          { key: 't', header: 'Amount', align: 'right', render: (r) => money(r.total), footer: money(sum(data, (r) => r.total)) },
        ]}
      />
    </Card>
  );
  return (
    <Frame loading={q.isLoading} error={q.error} retry={() => q.refetch()} empty={p.byRegion.length === 0}>
      <ChartCard title="Payment amounts by region" height={300}>
        <ResponsiveContainer>
          <BarChart data={p.byRegion} margin={{ top: 5, right: 10, left: 20, bottom: 40 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="region" tick={theme.tick} angle={-35} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis tick={theme.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₵${formatNumber(v)}`} />
            <Tooltip content={<ChartTooltip valueFormatter={money} />} cursor={{ fill: theme.cursor }} />
            <Bar dataKey="total" name="Payments" fill={theme.gold} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Card>
        <CardHeader title="Payments per region by payment type" description="Amounts in Ghana cedis" />
        <ReportTable caption="Payments per region" columns={columns} rows={p.byRegion} rowKey={(r) => r.region} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {small('By payment source', p.bySource)}
        {small('By payment status', p.byStatus)}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Officer performance per contact type                             */
/* ------------------------------------------------------------------ */
function OfficerPerformance({ filters, ticketParams }: ReportProps) {
  const navigate = useNavigate();
  const { lookups } = useLookups();
  const q = useReport('officer-perf', filters, reportsService.officerPerformance);
  const rows = q.data ?? [];
  const contactTypes = [
    ...new Set([
      ...lookups.contact_types.map((c) => c.name).filter((c) => rows.some((r) => r.by_contact_type[c])),
      ...rows.flatMap((r) => Object.keys(r.by_contact_type)),
    ]),
  ];
  const max = Math.max(0, ...rows.flatMap((r) => Object.values(r.by_contact_type)));
  const columns: ReportColumn<OfficerPerformanceRow>[] = [
    {
      key: 'name',
      header: 'Officer',
      render: (r) => (
        <span>
          <span className="font-medium">{r.officer_name}</span>
          {r.region && <span className="block text-xs text-slate-500">{r.region}</span>}
        </span>
      ),
      footer: 'Total',
    },
    ...contactTypes.map<ReportColumn<OfficerPerformanceRow>>((c) => ({
      key: c,
      header: c,
      align: 'right',
      render: (r) =>
        r.by_contact_type[c] ? (
          <span className={`-mx-2 -my-1 rounded px-2 py-1 ${heat(r.by_contact_type[c], max) ?? ''}`}>{r.by_contact_type[c]}</span>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">0</span>
        ),
      footer: formatNumber(sum(rows, (r) => r.by_contact_type[c] ?? 0)),
    })),
    { key: 'assigned', header: 'Assigned', align: 'right', render: (r) => <strong>{r.total_assigned}</strong>, footer: formatNumber(sum(rows, (r) => r.total_assigned)) },
    { key: 'active', header: 'Active', align: 'right', render: (r) => r.active, footer: formatNumber(sum(rows, (r) => r.active)) },
    { key: 'resolved', header: 'Resolved', align: 'right', render: (r) => r.resolved, footer: formatNumber(sum(rows, (r) => r.resolved)) },
    {
      key: 'rate',
      header: 'Resolution %',
      align: 'right',
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="hidden h-1.5 w-12 overflow-hidden rounded bg-slate-100 sm:inline-block dark:bg-slate-800">
            <span className="block h-full bg-brand-500" style={{ width: `${r.resolution_rate}%` }} />
          </span>
          {formatPercent(r.resolution_rate)}
        </span>
      ),
    },
    { key: 'avg', header: 'Avg. time', align: 'right', render: (r) => formatHours(r.avg_resolution_hours) },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      render: (r) => (r.overdue ? <span className="font-semibold text-rose-600">{r.overdue}</span> : 0),
      footer: formatNumber(sum(rows, (r) => r.overdue)),
    },
    { key: 'pay', header: 'Payments', align: 'right', render: (r) => money(r.payments), footer: money(sum(rows, (r) => r.payments)) },
  ];
  return (
    <Frame loading={q.isLoading} error={q.error} retry={() => q.refetch()} empty={rows.length === 0}>
      <Card>
        <CardHeader title="Officer performance per type of contact" description="Click an officer to see their tickets" />
        <ReportTable
          caption="Officer performance"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.officer_id}
          onRowClick={(r) => navigate(ticketsUrl({ ...ticketParams, officer: r.officer_id }))}
        />
      </Card>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 5. SLA / overdue ageing                                             */
/* ------------------------------------------------------------------ */
const BUCKETS = [
  { key: 'd0_2', label: '0–2 days', color: '#f59e0b' },
  { key: 'd3_7', label: '3–7 days', color: '#f97316' },
  { key: 'd8_14', label: '8–14 days', color: '#e11d48' },
  { key: 'd15_plus', label: '15+ days', color: '#881337' },
] as const;

function SlaAging({ filters, ticketParams }: ReportProps) {
  const navigate = useNavigate();
  const theme = useChartTheme();
  const q = useReport('sla-aging', filters, reportsService.slaAging);
  const d = q.data;
  const bucketCols = <T extends { d0_2: number; d3_7: number; d8_14: number; d15_plus: number; total: number }>(rows: T[]): ReportColumn<T>[] => [
    ...BUCKETS.map<ReportColumn<T>>((b) => ({
      key: b.key,
      header: b.label,
      align: 'right',
      render: (r) => (r[b.key] ? <span style={{ color: b.color }} className="font-semibold">{r[b.key]}</span> : <span className="text-slate-300 dark:text-slate-600">0</span>),
      footer: formatNumber(sum(rows, (r) => r[b.key])),
    })),
    { key: 'total', header: 'Total overdue', align: 'right', render: (r) => <strong>{r.total}</strong>, footer: formatNumber(sum(rows, (r) => r.total)) },
  ];
  type RegionRow = SlaAgingReport['by_region'][number];
  type OfficerRow = SlaAgingReport['by_officer'][number];
  return (
    <Frame loading={q.isLoading} error={q.error} retry={() => q.refetch()} empty={!d || d.totals.total === 0}>
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {BUCKETS.map((b) => (
              <Card key={b.key} className="p-4">
                <p className="text-xs font-medium text-slate-500">Overdue {b.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: b.color }}>
                  {formatNumber(d.totals[b.key])}
                </p>
              </Card>
            ))}
            <Card className="col-span-2 border-rose-200 bg-rose-50 p-4 lg:col-span-1 dark:border-rose-900 dark:bg-rose-500/10">
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Total overdue</p>
              <button type="button" onClick={() => navigate(ticketsUrl({ ...ticketParams, overdue: '1' }))} className="mt-1 text-2xl font-bold text-rose-700 tabular-nums hover:underline dark:text-rose-300">
                {formatNumber(d.totals.total)}
              </button>
            </Card>
          </div>
          <ChartCard title="Overdue ageing by region" height={300}>
            <ResponsiveContainer>
              <BarChart data={d.by_region} margin={{ top: 5, right: 10, left: -15, bottom: 40 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="region" tick={theme.tick} angle={-35} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
                <Legend iconType="circle" verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
                {BUCKETS.map((b) => (
                  <Bar key={b.key} dataKey={b.key} name={b.label} stackId="a" fill={b.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="By region" />
              <ReportTable<RegionRow>
                caption="Overdue by region"
                rows={d.by_region}
                rowKey={(r) => r.region}
                onRowClick={(r) => navigate(ticketsUrl({ ...ticketParams, region: r.region, overdue: '1' }))}
                columns={[
                  { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
                  ...bucketCols(d.by_region),
                  { key: 'max', header: 'Oldest', align: 'right', render: (r) => `${r.max_days}d` },
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="By officer" />
              <ReportTable<OfficerRow>
                caption="Overdue by officer"
                rows={d.by_officer}
                rowKey={(r) => r.officer_name}
                columns={[{ key: 'o', header: 'Officer', render: (r) => <span className="font-medium">{r.officer_name}</span>, footer: 'Total' }, ...bucketCols(d.by_officer)]}
              />
            </Card>
          </div>
        </>
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Export builders                                                     */
/* ------------------------------------------------------------------ */
async function loadIssueSheets(f: ReportFilters): Promise<ExportSheet[]> {
  const rows = await reportsService.issueTypeByRegion(f);
  const { issues, table } = pivotIssues(rows, [], []);
  return [
    {
      name: 'Issue type per region',
      head: ['Region', ...issues, 'Total'],
      rows: table.map((r) => [r.region, ...issues.map((i) => r.counts[i]), r.total]),
      foot: ['TOTAL', ...issues.map((i) => sum(table, (r) => r.counts[i])), sum(table, (r) => r.total)],
    },
  ];
}

async function loadPaymentSheets(f: ReportFilters): Promise<ExportSheet[]> {
  const rows = await reportsService.paymentsByRegion(f);
  const p = pivotPayments(rows, []);
  const small = (name: string, d: { label: string; total: number; count: number }[]): ExportSheet => ({
    name,
    head: ['Value', 'Tickets', 'Amount (GHS)'],
    rows: d.map((r) => [r.label, r.count, pdfMoney(r.total)]),
    foot: ['TOTAL', sum(d, (r) => r.count), pdfMoney(sum(d, (r) => r.total))],
  });
  return [
    {
      name: 'Payments per region',
      head: ['Region', ...p.types.map((t) => `${t} (GHS)`), 'Tickets', 'Total (GHS)'],
      rows: p.byRegion.map((r) => [r.region, ...p.types.map((t) => pdfMoney(r.amounts[t])), r.count, pdfMoney(r.total)]),
      foot: ['TOTAL', ...p.types.map((t) => pdfMoney(sum(p.byRegion, (r) => r.amounts[t]))), sum(p.byRegion, (r) => r.count), pdfMoney(sum(p.byRegion, (r) => r.total))],
    },
    small('By payment source', p.bySource),
    small('By payment status', p.byStatus),
  ];
}

async function loadOfficerSheets(f: ReportFilters): Promise<ExportSheet[]> {
  const rows = await reportsService.officerPerformance(f);
  const cts = [...new Set(rows.flatMap((r) => Object.keys(r.by_contact_type)))].sort();
  return [
    {
      name: 'Officer performance',
      head: ['Officer', 'Region', ...cts, 'Assigned', 'Active', 'Resolved', 'Resolution %', 'Avg resolution (h)', 'Overdue', 'Payments (GHS)'],
      rows: rows.map((r) => [
        r.officer_name,
        r.region ?? '',
        ...cts.map((c) => r.by_contact_type[c] ?? 0),
        r.total_assigned,
        r.active,
        r.resolved,
        r.resolution_rate,
        r.avg_resolution_hours ?? '',
        r.overdue,
        pdfMoney(r.payments),
      ]),
      foot: [
        'TOTAL',
        '',
        ...cts.map((c) => sum(rows, (r) => r.by_contact_type[c] ?? 0)),
        sum(rows, (r) => r.total_assigned),
        sum(rows, (r) => r.active),
        sum(rows, (r) => r.resolved),
        '',
        '',
        sum(rows, (r) => r.overdue),
        pdfMoney(sum(rows, (r) => r.payments)),
      ],
    },
  ];
}

async function loadSlaSheets(f: ReportFilters): Promise<ExportSheet[]> {
  const d = await reportsService.slaAging(f);
  const head = BUCKETS.map((b) => b.label);
  return [
    {
      name: 'Overdue by region',
      head: ['Region', ...head, 'Total', 'Oldest (days)'],
      rows: d.by_region.map((r) => [r.region, r.d0_2, r.d3_7, r.d8_14, r.d15_plus, r.total, r.max_days]),
      foot: ['TOTAL', d.totals.d0_2, d.totals.d3_7, d.totals.d8_14, d.totals.d15_plus, d.totals.total, ''],
    },
    {
      name: 'Overdue by officer',
      head: ['Officer', ...head, 'Total'],
      rows: d.by_officer.map((r) => [r.officer_name, r.d0_2, r.d3_7, r.d8_14, r.d15_plus, r.total]),
    },
  ];
}


/* ------------------------------------------------------------------ */
/* 6. Turnaround time                                                  */
/* ------------------------------------------------------------------ */
const TAT_BUCKET_COLORS = ['#10b981', '#22c55e', '#eab308', '#f97316', '#ef4444', '#991b1b'];

function Turnaround({ filters, ticketParams }: ReportProps) {
  const navigate = useNavigate();
  const theme = useChartTheme();
  const q = useReport('turnaround', filters, reportsService.turnaround);
  const d = q.data;
  const totals = d?.totals;

  return (
    <Frame loading={q.isLoading} error={q.error} retry={() => q.refetch()} empty={!totals || totals.resolved === 0}>
      {d && totals && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Resolved tickets" value={formatNumber(totals.resolved)} tone="gray" />
            <StatCard
              label="Average turnaround"
              value={formatMinutes(totals.avg_resolution_minutes)}
              tone="brand"
              hint="Raised → completed"
            />
            <StatCard
              label="Median turnaround"
              value={formatMinutes(totals.median_resolution_minutes)}
              tone="brand"
              hint="Half are faster than this"
            />
            <StatCard
              label="Average waiting time"
              value={formatMinutes(totals.avg_response_minutes)}
              tone="amber"
              hint="Raised → first worked on"
            />
            <StatCard label="Within SLA" value={formatPercent(totals.within_sla)} tone="green" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="How long tickets take" description="Resolved tickets by turnaround time" height={300}>
              <ResponsiveContainer>
                <BarChart data={d.buckets} margin={{ top: 5, right: 10, left: -15, bottom: 20 }}>
                  <CartesianGrid stroke={theme.grid} vertical={false} />
                  <XAxis dataKey="label" tick={theme.tick} interval={0} angle={-15} textAnchor="end" axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
                  <Bar dataKey="count" name="Tickets" radius={[6, 6, 0, 0]}>
                    {d.buckets.map((_, i) => (
                      <Cell key={i} fill={TAT_BUCKET_COLORS[i] ?? theme.brand} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Month by month" description="Average turnaround and waiting time, in hours" height={300}>
              <ResponsiveContainer>
                <LineChart
                  data={d.trend.map((t) => ({
                    ...t,
                    label: format(parseISO(t.bucket), 'MMM yy'),
                    tat: t.avg_resolution_minutes === null ? null : Number((t.avg_resolution_minutes / 60).toFixed(1)),
                    wait: t.avg_response_minutes === null ? null : Number((t.avg_response_minutes / 60).toFixed(1)),
                  }))}
                  margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid stroke={theme.grid} vertical={false} />
                  <XAxis dataKey="label" tick={theme.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={theme.tick} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} h`} />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="tat" name="Turnaround" stroke={theme.brand} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="wait" name="Waiting" stroke={theme.gold} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <Card>
            <CardHeader title="By officer" description="Click a row to see that officer's tickets" />
            <ReportTable
              caption="Turnaround by officer"
              rows={d.by_officer}
              rowKey={(r) => r.officer_name}
              onRowClick={(r) => {
                const officer = r.officer_name;
                navigate(ticketsUrl({ ...ticketParams, status: 'Resolved,Closed', q: officer }));
              }}
              columns={[
                { key: 'o', header: 'Officer', render: (r) => <span className="font-medium">{r.officer_name}</span> },
                { key: 'region', header: 'Region', render: (r) => r.region ?? '—' },
                { key: 'resolved', header: 'Resolved', align: 'right', render: (r) => r.resolved },
                { key: 'avg', header: 'Average', align: 'right', render: (r) => formatMinutes(r.avg_resolution_minutes) },
                { key: 'median', header: 'Median', align: 'right', render: (r) => formatMinutes(r.median_resolution_minutes) },
                { key: 'wait', header: 'Waiting', align: 'right', render: (r) => formatMinutes(r.avg_response_minutes) },
                { key: 'fast', header: 'Fastest', align: 'right', render: (r) => formatMinutes(r.fastest_minutes) },
                { key: 'slow', header: 'Slowest', align: 'right', render: (r) => formatMinutes(r.slowest_minutes) },
                { key: 'sla', header: 'Within SLA', align: 'right', render: (r) => formatPercent(r.within_sla) },
              ]}
            />
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            {(
              [
                ['By issue type', d.by_issue_type],
                ['By region', d.by_region],
              ] as const
            ).map(([title, rows]) => (
              <Card key={title}>
                <CardHeader title={title} />
                <ReportTable
                  caption={title}
                  rows={[...rows]}
                  rowKey={(r) => r.label}
                  columns={[
                    { key: 'l', header: 'Value', render: (r) => r.label },
                    { key: 'n', header: 'Resolved', align: 'right', render: (r) => r.resolved },
                    { key: 'avg', header: 'Average', align: 'right', render: (r) => formatMinutes(r.avg_resolution_minutes) },
                    { key: 'wait', header: 'Waiting', align: 'right', render: (r) => formatMinutes(r.avg_response_minutes) },
                  ]}
                />
              </Card>
            ))}
          </div>
        </>
      )}
    </Frame>
  );
}

async function loadTurnaroundSheets(f: ReportFilters): Promise<ExportSheet[]> {
  const d = await reportsService.turnaround(f);
  const hours = (m: number | null | undefined) => (m === null || m === undefined ? '' : Number((m / 60).toFixed(2)));
  return [
    {
      name: 'Summary',
      head: ['Metric', 'Value'],
      rows: [
        ['Tickets in range', d.totals.tickets],
        ['Resolved', d.totals.resolved],
        ['Average turnaround', formatMinutes(d.totals.avg_resolution_minutes)],
        ['Median turnaround', formatMinutes(d.totals.median_resolution_minutes)],
        ['90th percentile', formatMinutes(d.totals.p90_resolution_minutes)],
        ['Fastest', formatMinutes(d.totals.fastest_minutes)],
        ['Slowest', formatMinutes(d.totals.slowest_minutes)],
        ['Average waiting time', formatMinutes(d.totals.avg_response_minutes)],
        ['Within SLA', `${d.totals.within_sla}%`],
      ],
    },
    {
      name: 'By officer',
      head: ['Officer', 'Region', 'Resolved', 'Average (hours)', 'Median (hours)', 'Waiting (hours)', 'Within SLA %'],
      rows: d.by_officer.map((r) => [
        r.officer_name,
        r.region ?? '',
        r.resolved,
        hours(r.avg_resolution_minutes),
        hours(r.median_resolution_minutes),
        hours(r.avg_response_minutes),
        r.within_sla,
      ]),
    },
    {
      name: 'By issue type',
      head: ['Issue type', 'Resolved', 'Average (hours)', 'Waiting (hours)'],
      rows: d.by_issue_type.map((r) => [r.label, r.resolved, hours(r.avg_resolution_minutes), hours(r.avg_response_minutes)]),
    },
    {
      name: 'Distribution',
      head: ['Turnaround', 'Tickets'],
      rows: d.buckets.map((b) => [b.label, b.count]),
    },
  ];
}

export const REPORTS: ReportDefinition[] = [
  {
    key: 'status-region',
    title: 'Status per region',
    description: 'Open, in-progress, resolved and closed tickets for each region',
    load: async (f) => [statusSheet(await reportsService.statusByRegion(f))],
    Component: StatusByRegion,
  },
  {
    key: 'issue-region',
    title: 'Issue type per region',
    description: 'Which problems come from where',
    load: loadIssueSheets,
    Component: IssueByRegion,
  },
  {
    key: 'payments-region',
    title: 'Payments per region',
    description: 'Amounts by payment type, source and status',
    load: loadPaymentSheets,
    Component: PaymentsByRegion,
  },
  {
    key: 'officer-performance',
    title: 'Officer performance',
    description: 'Workload and results per officer and type of contact',
    load: loadOfficerSheets,
    Component: OfficerPerformance,
  },
  {
    key: 'turnaround',
    title: 'Turnaround time',
    description: 'How many minutes it takes to resolve a ticket, and where the time goes',
    load: loadTurnaroundSheets,
    Component: Turnaround,
  },
  {
    key: 'sla-aging',
    title: 'SLA & overdue ageing',
    description: 'Overdue tickets bucketed 0–2, 3–7, 8–14 and 15+ days',
    load: loadSlaSheets,
    Component: SlaAging,
  },
];

export { statusSheet, loadIssueSheets, loadPaymentSheets, loadOfficerSheets, loadSlaSheets, loadTurnaroundSheets };

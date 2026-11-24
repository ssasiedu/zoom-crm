import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { ChartCard, ChartTooltip, useChartTheme } from '@/components/charts/ChartKit';
import { Card, CardHeader, EmptyState, ErrorState, StatCard, TableSkeleton } from '@/components/ui';
import { STATUS_COLORS } from '@/lib/constants';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { reportsService } from '@/services/reports';
import type {
  ForwardedDistrictRow,
  ForwardedOfficerRow,
  ForwardedRegionRow,
  ForwardedReport,
  ReportFilters,
} from '@/types';
import type { ExportSheet } from '@/utils/export';
import { formatHours, formatNumber, formatPercent } from '@/utils/format';
import { ticketsUrl } from '@/features/tickets/ticketFilters';
import { ReportTable, sum, type ReportColumn } from './ReportTable';

/** Open / In-Progress / Resolved / Closed / Overdue, shared by all three tables */
function statusColumns<T extends { open: number; in_progress: number; resolved: number; closed: number; overdue: number; total: number; resolution_rate: number }>(
  rows: T[],
): ReportColumn<T>[] {
  return [
    { key: 'total', header: 'Forwarded', align: 'right', render: (r) => <strong>{formatNumber(r.total)}</strong>, footer: formatNumber(sum(rows, (r) => r.total)) },
    { key: 'open', header: 'Open', align: 'right', render: (r) => r.open, footer: formatNumber(sum(rows, (r) => r.open)) },
    { key: 'wip', header: 'In progress', align: 'right', render: (r) => r.in_progress, footer: formatNumber(sum(rows, (r) => r.in_progress)) },
    { key: 'resolved', header: 'Resolved', align: 'right', render: (r) => r.resolved, footer: formatNumber(sum(rows, (r) => r.resolved)) },
    { key: 'closed', header: 'Closed', align: 'right', render: (r) => r.closed, footer: formatNumber(sum(rows, (r) => r.closed)) },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      render: (r) => (r.overdue ? <span className="font-semibold text-rose-600">{r.overdue}</span> : 0),
      footer: formatNumber(sum(rows, (r) => r.overdue)),
    },
    { key: 'rate', header: 'Done %', align: 'right', render: (r) => formatPercent(r.resolution_rate) },
  ];
}

export function ForwardedWorkTables({ d, ticketParams }: { d: ForwardedReport; ticketParams?: Record<string, string | undefined> }) {
  const navigate = useNavigate();
  const go = (extra: Record<string, string | undefined>) =>
    ticketParams ? navigate(ticketsUrl({ ...ticketParams, ...extra })) : undefined;

  return (
    <>
      <Card>
        <CardHeader title="By region" description="Everything sent down to the districts of each region" />
        <ReportTable<ForwardedRegionRow>
          caption="Forwarded work by region"
          rows={d.by_region}
          rowKey={(r) => r.region}
          onRowClick={ticketParams ? (r) => go({ region: r.region }) : undefined}
          columns={[
            { key: 'region', header: 'Region', render: (r) => <span className="font-medium">{r.region}</span>, footer: 'Total' },
            { key: 'districts', header: 'Districts', align: 'right', render: (r) => r.districts },
            { key: 'officers', header: 'Officers', align: 'right', render: (r) => r.officers },
            ...statusColumns(d.by_region),
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="By district" description="Where the field work actually sits" />
        <ReportTable<ForwardedDistrictRow>
          caption="Forwarded work by district"
          rows={d.by_district}
          rowKey={(r) => `${r.region}|${r.district}`}
          onRowClick={ticketParams ? (r) => go({ region: r.region }) : undefined}
          columns={[
            { key: 'region', header: 'Region', render: (r) => r.region, footer: 'Total' },
            { key: 'district', header: 'District', render: (r) => <span className="font-medium">{r.district}</span> },
            { key: 'officers', header: 'Officers', align: 'right', render: (r) => r.officers },
            ...statusColumns(d.by_district),
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="By District Operation Officer"
          description="Field time is measured from when the ticket was forwarded, not when it was raised"
        />
        <ReportTable<ForwardedOfficerRow>
          caption="Forwarded work by officer"
          rows={d.by_officer}
          rowKey={(r) => `${r.district}|${r.officer_name}`}
          columns={[
            {
              key: 'officer',
              header: 'Officer',
              render: (r) => (
                <span>
                  <span className="font-medium">{r.officer_name}</span>
                  <span className="block text-xs text-slate-500">
                    {r.district}
                    {r.manager_name ? ` · ${r.manager_name}` : ''}
                  </span>
                </span>
              ),
              footer: 'Total',
            },
            ...statusColumns(d.by_officer),
            { key: 'field', header: 'Avg. field time', align: 'right', render: (r) => formatHours(r.avg_field_hours) },
          ]}
        />
      </Card>
    </>
  );
}

export function ForwardedWork({ filters, ticketParams }: { filters: ReportFilters; ticketParams: Record<string, string | undefined> }) {
  const theme = useChartTheme();
  const q = useQuery({
    queryKey: [...qk.reports, 'forwarded', filters],
    queryFn: () => reportsService.forwarded(filters),
  });

  if (q.isLoading) {
    return (
      <Card>
        <TableSkeleton rows={8} cols={7} />
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Card>
    );
  }
  const d = q.data;
  if (!d || d.totals.total === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing forwarded in this period"
          description="Tickets appear here once an officer sends them down to a District Operation Officer."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Forwarded" value={formatNumber(d.totals.total)} />
        <StatCard label="Still open" value={formatNumber(d.totals.open + d.totals.in_progress)} tone="blue" />
        <StatCard label="Resolved + closed" value={formatNumber(d.totals.resolved + d.totals.closed)} tone="green" />
        <StatCard label="Overdue" value={formatNumber(d.totals.overdue)} tone="red" />
        <StatCard label="Districts working" value={formatNumber(d.totals.districts)} tone="violet" />
        <StatCard label="Officers working" value={formatNumber(d.totals.officers)} tone="gray" />
      </div>

      <ChartCard title="Forwarded work by district and status" height={340}>
        <ResponsiveContainer>
          <BarChart data={d.by_district} margin={{ top: 5, right: 10, left: -15, bottom: 60 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="district" tick={theme.tick} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
            <Legend iconType="circle" verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="open" name="Open" stackId="s" fill={STATUS_COLORS.Open} />
            <Bar dataKey="in_progress" name="In progress" stackId="s" fill={STATUS_COLORS['In-Progress']} />
            <Bar dataKey="resolved" name="Resolved" stackId="s" fill={STATUS_COLORS.Resolved} />
            <Bar dataKey="closed" name="Closed" stackId="s" fill={STATUS_COLORS.Closed} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ForwardedWorkTables d={d} ticketParams={ticketParams} />
    </div>
  );
}

/**
 * District Operation Officers judged on the work forwarded to them.
 *
 * Separate from the forwarded-work report, which answers "where is the
 * field work": this answers "how is each officer doing with it". Done %
 * is how much they finished; on-time % is how much of that they
 * finished by the due date, which is the part a resolution rate alone
 * hides — an officer who closes everything a week late reads as a good
 * month until you look at this column.
 */
export function DistrictOfficerPerformance({ filters }: { filters: ReportFilters }) {
  const theme = useChartTheme();
  const q = useQuery({
    queryKey: [...qk.reports, 'forwarded', filters],
    queryFn: () => reportsService.forwarded(filters),
  });

  if (q.isLoading) {
    return (
      <Card>
        <TableSkeleton rows={8} cols={8} />
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Card>
    );
  }
  const d = q.data;
  if (!d || d.by_officer.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No forwarded work in this period"
          description="District Operation Officers appear here once tickets are forwarded to them."
        />
      </Card>
    );
  }

  const rows = [...d.by_officer].sort((a, b) => b.total - a.total);
  const finished = d.totals.resolved + d.totals.closed;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Officers working" value={formatNumber(d.totals.officers)} />
        <StatCard label="Tickets forwarded" value={formatNumber(d.totals.total)} tone="violet" />
        <StatCard
          label="Finished"
          value={formatNumber(finished)}
          tone="green"
          hint={`${formatPercent((100 * finished) / Math.max(1, d.totals.total))} of what was forwarded`}
        />
        <StatCard
          label="Finished on time"
          value={formatNumber(d.totals.sla_met)}
          tone={d.totals.sla_met < finished / 2 ? 'red' : 'brand'}
          hint={`${formatPercent((100 * d.totals.sla_met) / Math.max(1, finished))} of those finished`}
        />
      </div>

      <ChartCard title="Forwarded, finished and on time, per officer" height={340}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 5, right: 10, left: -15, bottom: 70 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="officer_name" tick={theme.tick} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
            <Legend iconType="circle" verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="total" name="Forwarded" fill={STATUS_COLORS.Open} radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" name="Resolved" fill={STATUS_COLORS.Resolved} radius={[4, 4, 0, 0]} />
            <Bar dataKey="sla_met" name="On time" fill={STATUS_COLORS.Closed} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card>
        <CardHeader
          title="District Operation Officer performance"
          description="Field time runs from the moment the ticket was forwarded. On-time counts those finished by the due date."
        />
        <ReportTable<ForwardedOfficerRow>
          caption="District officer performance"
          rows={rows}
          rowKey={(r) => `${r.district}|${r.officer_name}`}
          columns={[
            {
              key: 'officer',
              header: 'Officer',
              render: (r) => (
                <span>
                  <span className="font-medium">{r.officer_name}</span>
                  <span className="block text-xs text-slate-500">
                    {r.district}
                    {r.manager_name ? ` · ${r.manager_name}` : ''}
                  </span>
                </span>
              ),
              footer: 'Total',
            },
            ...statusColumns(rows),
            {
              key: 'ontime',
              header: 'On time',
              align: 'right',
              render: (r) => formatNumber(r.sla_met),
              footer: formatNumber(sum(rows, (r) => r.sla_met)),
            },
            {
              key: 'ontimerate',
              header: 'On time %',
              align: 'right',
              render: (r) => (
                <span className={r.sla_rate < 50 ? 'font-semibold text-rose-600' : undefined}>{formatPercent(r.sla_rate)}</span>
              ),
            },
            { key: 'field', header: 'Avg. field time', align: 'right', render: (r) => formatHours(r.avg_field_hours) },
          ]}
        />
      </Card>
    </div>
  );
}

export function districtOfficerSheet(d: ForwardedReport): ExportSheet {
  const rows = [...d.by_officer].sort((a, b) => b.total - a.total);
  return {
    name: 'District officer performance',
    head: ['Officer', 'District', 'Region', 'Regional manager', 'Forwarded', 'Open', 'In progress', 'Resolved', 'Closed', 'Overdue', 'Done %', 'On time', 'On time %', 'Avg field time (h)'],
    rows: rows.map((r) => [
      r.officer_name, r.district, r.region, r.manager_name,
      r.total, r.open, r.in_progress, r.resolved, r.closed, r.overdue,
      r.resolution_rate, r.sla_met, r.sla_rate, r.avg_field_hours ?? '',
    ]),
    foot: [
      'TOTAL', '', '', '',
      sum(rows, (r) => r.total), sum(rows, (r) => r.open), sum(rows, (r) => r.in_progress),
      sum(rows, (r) => r.resolved), sum(rows, (r) => r.closed), sum(rows, (r) => r.overdue),
      '', sum(rows, (r) => r.sla_met), '', '',
    ],
  };
}

export async function loadDistrictOfficerSheets(f: ReportFilters): Promise<ExportSheet[]> {
  return [districtOfficerSheet(await reportsService.forwarded(f))];
}

/** Export sheets, shared by the report page and the monthly report */
export function forwardedSheets(d: ForwardedReport): ExportSheet[] {
  const counts = (r: { total: number; open: number; in_progress: number; resolved: number; closed: number; overdue: number }) =>
    [r.total, r.open, r.in_progress, r.resolved, r.closed, r.overdue];
  const head = ['Forwarded', 'Open', 'In progress', 'Resolved', 'Closed', 'Overdue'];
  return [
    {
      name: 'Forwarded by region',
      head: ['Region', 'Districts', 'Officers', ...head, 'Done %'],
      rows: d.by_region.map((r) => [r.region, r.districts, r.officers, ...counts(r), r.resolution_rate]),
      foot: [
        'TOTAL',
        '',
        '',
        sum(d.by_region, (r) => r.total),
        sum(d.by_region, (r) => r.open),
        sum(d.by_region, (r) => r.in_progress),
        sum(d.by_region, (r) => r.resolved),
        sum(d.by_region, (r) => r.closed),
        sum(d.by_region, (r) => r.overdue),
        '',
      ],
    },
    {
      name: 'Forwarded by district',
      head: ['Region', 'District', 'Officers', ...head, 'Done %'],
      rows: d.by_district.map((r) => [r.region, r.district, r.officers, ...counts(r), r.resolution_rate]),
    },
    {
      name: 'Forwarded by officer',
      head: ['Region', 'District', 'Officer', 'Regional manager', ...head, 'Done %', 'Avg field time (h)'],
      rows: d.by_officer.map((r) => [
        r.region,
        r.district,
        r.officer_name,
        r.manager_name,
        ...counts(r),
        r.resolution_rate,
        r.avg_field_hours ?? '',
      ]),
    },
  ];
}

export async function loadForwardedSheets(f: ReportFilters): Promise<ExportSheet[]> {
  return forwardedSheets(await reportsService.forwarded(f));
}

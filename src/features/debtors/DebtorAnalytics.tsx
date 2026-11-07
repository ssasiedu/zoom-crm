import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parse } from 'date-fns';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ChartCard, ChartTooltip, useChartTheme } from '@/components/charts/ChartKit';
import { Button, Card, CardHeader, Menu } from '@/components/ui';
import { CHART_PALETTE, DEBTOR_STATUS_COLORS } from '@/lib/constants';
import { qk } from '@/lib/queryClient';
import { debtorsService } from '@/services/debtors';
import { errorMessage } from '@/services/errors';
import type { DebtorFilters } from '@/types';
import { exportToExcel, exportToPdf, type ExportSheet } from '@/utils/export';
import { formatGHS, formatNumber, formatPercent } from '@/utils/format';
import { ReportTable, sum } from '@/features/reports/ReportTable';

function useBreakdown(dimension: Parameters<typeof debtorsService.breakdown>[0], filters: DebtorFilters) {
  return useQuery({
    queryKey: [...qk.debtorReports, 'breakdown', dimension, filters],
    queryFn: () => debtorsService.breakdown(dimension, filters),
  });
}

/** Charts and tables for the debtor list, shown on the Debtor Lists page */
export function DebtorAnalytics({ filters, periodLabel }: { filters: DebtorFilters; periodLabel: string }) {
  const theme = useChartTheme();

  const officers = useQuery({
    queryKey: [...qk.debtorReports, 'officers', filters],
    queryFn: () => debtorsService.byOfficer(filters),
  });
  const feedback = useBreakdown('feedback', filters);
  const providers = useBreakdown('provider', filters);
  const customerTypes = useBreakdown('customer_type', filters);
  const communities = useBreakdown('community', filters);
  const status = useBreakdown('work_status', filters);
  const trend = useQuery({
    queryKey: [...qk.debtorReports, 'trend'],
    queryFn: () => debtorsService.trend(12),
  });

  const officerRows = officers.data ?? [];

  const sheets = (): ExportSheet[] => [
    {
      name: 'By officer',
      head: ['Officer', 'Region', 'Accounts', 'Worked', 'Pending', 'Outstanding (GHS)', 'Collected (GHS)', 'Contact %', 'Collection %'],
      rows: officerRows.map((r) => [
        r.officer_name,
        r.region ?? '',
        r.customers,
        r.worked,
        r.pending,
        Number(r.outstanding.toFixed(2)),
        Number(r.collected.toFixed(2)),
        r.contact_rate,
        r.collection_rate,
      ]),
      foot: [
        'TOTAL',
        '',
        sum(officerRows, (r) => r.customers),
        sum(officerRows, (r) => r.worked),
        sum(officerRows, (r) => r.pending),
        Number(sum(officerRows, (r) => r.outstanding).toFixed(2)),
        Number(sum(officerRows, (r) => r.collected).toFixed(2)),
        '',
        '',
      ],
    },
    ...(
      [
        ['By feedback', feedback.data],
        ['By provider', providers.data],
        ['By customer type', customerTypes.data],
        ['Top communities', communities.data],
      ] as const
    ).map(([name, rows]) => ({
      name,
      head: ['Value', 'Accounts', 'Worked', 'Outstanding (GHS)', 'Collected (GHS)'],
      rows: (rows ?? []).map((r) => [
        r.label,
        r.customers,
        r.worked,
        Number(r.outstanding.toFixed(2)),
        Number(r.collected.toFixed(2)),
      ]),
      foot: [
        'TOTAL',
        sum(rows ?? [], (r) => r.customers),
        sum(rows ?? [], (r) => r.worked),
        Number(sum(rows ?? [], (r) => r.outstanding).toFixed(2)),
        Number(sum(rows ?? [], (r) => r.collected).toFixed(2)),
      ],
    })),
  ];

  const download = (kind: 'xlsx' | 'pdf') => {
    try {
      const options = {
        filename: `debt-recovery-${periodLabel.toLowerCase().replace(/\s+/g, '-')}`,
        title: 'Debt recovery report',
        subtitle: periodLabel,
        sheets: sheets(),
        orientation: 'landscape' as const,
      };
      if (kind === 'xlsx') exportToExcel(options);
      else exportToPdf(options);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const trendData = (trend.data ?? []).map((t) => ({
    ...t,
    label: format(parse(t.period_month, 'yyyy-MM-dd', new Date()), 'MMM yy'),
  }));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Menu
          label="Export report"
          trigger={({ toggle, ref, open }) => (
            <Button ref={ref} variant="secondary" onClick={toggle} aria-expanded={open} leftIcon={<Download className="size-4" />}>
              Export report
            </Button>
          )}
          items={[
            { label: 'Excel (.xlsx)', icon: <FileSpreadsheet />, onSelect: () => download('xlsx') },
            { label: 'PDF', icon: <FileText />, onSelect: () => download('pdf') },
          ]}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Collections by officer"
          description="Outstanding against what has been collected"
          loading={officers.isLoading}
          empty={officerRows.length === 0}
          height={300}
        >
          <ResponsiveContainer>
            <BarChart data={officerRows} margin={{ top: 5, right: 10, left: 20, bottom: 40 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="officer_name"
                tick={theme.tick}
                angle={-30}
                textAnchor="end"
                interval={0}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.split(' ')[0]}
              />
              <YAxis tick={theme.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₵${formatNumber(v)}`} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => formatGHS(v)} />} cursor={{ fill: theme.cursor }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="outstanding" name="Outstanding" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="collected" name="Collected" fill={theme.brand} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Call progress" loading={status.isLoading} empty={(status.data ?? []).length === 0} height={300}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={status.data} dataKey="customers" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                {(status.data ?? []).map((s) => (
                  <Cell key={s.label} fill={DEBTOR_STATUS_COLORS[s.label] ?? '#94a3b8'} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Feedback given" description="Why accounts could not be collected" loading={feedback.isLoading} empty={(feedback.data ?? []).length === 0} height={320}>
          <ResponsiveContainer>
            <BarChart data={feedback.data} layout="vertical" margin={{ top: 0, right: 16, left: 20, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={170} tick={{ ...theme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
              <Bar dataKey="customers" name="Accounts" fill={theme.brand} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outstanding by provider" loading={providers.isLoading} empty={(providers.data ?? []).length === 0} height={320}>
          <ResponsiveContainer>
            <BarChart data={providers.data} margin={{ top: 5, right: 10, left: 20, bottom: 30 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="label" tick={theme.tick} interval={0} angle={-20} textAnchor="end" axisLine={false} tickLine={false} />
              <YAxis tick={theme.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₵${formatNumber(v)}`} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => formatGHS(v)} />} cursor={{ fill: theme.cursor }} />
              <Bar dataKey="outstanding" name="Outstanding" radius={[6, 6, 0, 0]}>
                {(providers.data ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Month on month"
        description="Outstanding, collected and the collection rate"
        loading={trend.isLoading}
        empty={trendData.length === 0}
        height={300}
      >
        <ResponsiveContainer>
          <ComposedChart data={trendData} margin={{ top: 5, right: 10, left: 20, bottom: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="label" tick={theme.tick} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={theme.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₵${formatNumber(v)}`} />
            <YAxis yAxisId="right" orientation="right" tick={theme.tick} axisLine={false} tickLine={false} unit="%" />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="outstanding" name="Outstanding" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="collected" name="Collected" fill={theme.brand} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="collection_rate" name="Collection rate %" stroke={theme.gold} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card>
        <CardHeader title="Officer performance" description="Click Export report for the full breakdown" />
        <ReportTable
          caption="Debt recovery by officer"
          rows={officerRows}
          rowKey={(r) => r.officer_id}
          columns={[
            { key: 'officer', header: 'Officer', render: (r) => <span className="font-medium">{r.officer_name}</span>, footer: 'Total' },
            { key: 'region', header: 'Region', render: (r) => r.region ?? '—' },
            { key: 'customers', header: 'Accounts', align: 'right', render: (r) => r.customers, footer: formatNumber(sum(officerRows, (r) => r.customers)) },
            { key: 'worked', header: 'Worked', align: 'right', render: (r) => r.worked, footer: formatNumber(sum(officerRows, (r) => r.worked)) },
            { key: 'pending', header: 'Pending', align: 'right', render: (r) => r.pending, footer: formatNumber(sum(officerRows, (r) => r.pending)) },
            {
              key: 'outstanding',
              header: 'Outstanding',
              align: 'right',
              render: (r) => formatGHS(r.outstanding),
              footer: formatGHS(sum(officerRows, (r) => r.outstanding)),
            },
            {
              key: 'collected',
              header: 'Collected',
              align: 'right',
              render: (r) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatGHS(r.collected)}</span>,
              footer: formatGHS(sum(officerRows, (r) => r.collected)),
            },
            { key: 'contact', header: 'Contacted', align: 'right', render: (r) => formatPercent(r.contact_rate) },
            { key: 'rate', header: 'Collection %', align: 'right', render: (r) => formatPercent(r.collection_rate) },
          ]}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {(
          [
            ['By customer type', customerTypes.data ?? []],
            ['Top communities', communities.data ?? []],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title}>
            <CardHeader title={title} />
            <ReportTable
              caption={title}
              rows={[...rows]}
              rowKey={(r) => r.label}
              columns={[
                { key: 'label', header: 'Value', render: (r) => r.label, footer: 'Total' },
                { key: 'customers', header: 'Accounts', align: 'right', render: (r) => r.customers, footer: formatNumber(sum([...rows], (r) => r.customers)) },
                {
                  key: 'outstanding',
                  header: 'Outstanding',
                  align: 'right',
                  render: (r) => formatGHS(r.outstanding),
                  footer: formatGHS(sum([...rows], (r) => r.outstanding)),
                },
                {
                  key: 'collected',
                  header: 'Collected',
                  align: 'right',
                  render: (r) => formatGHS(r.collected),
                  footer: formatGHS(sum([...rows], (r) => r.collected)),
                },
              ]}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

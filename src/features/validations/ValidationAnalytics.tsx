import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartTooltip, useChartTheme } from '@/components/charts/ChartKit';
import { Card, CardHeader, ErrorState, TableSkeleton } from '@/components/ui';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { validationsService } from '@/services/validations';
import type { ValidationFilters, ValidationOutcome } from '@/types';
import { formatGHS, formatNumber, formatPercent } from '@/utils/format';
import { ReportTable, sum } from '@/features/reports/ReportTable';

/** The colour says what the answer means, so a chart reads at a glance */
const OUTCOME_COLOR: Record<ValidationOutcome, string> = {
  active: '#15803d',
  inactive: '#dc2626',
  unreachable: '#64748b',
  other: '#f59e0b',
};

const OUTCOME_LABEL: Record<ValidationOutcome, string> = {
  active: 'Still with us',
  inactive: 'No longer with us',
  unreachable: 'Could not reach',
  other: 'Needs another call',
};

/**
 * What the exercise found. The responses chart is the answer to the
 * question that was asked; the region and officer tables say where the
 * answer came from and who got it.
 */
export function ValidationAnalytics({ filters }: { filters: ValidationFilters }) {
  const theme = useChartTheme();
  const responses = useQuery({
    queryKey: [...qk.validations, 'by-response', filters],
    queryFn: () => validationsService.byResponse(filters),
  });
  const regions = useQuery({
    queryKey: [...qk.validations, 'by-region', filters],
    queryFn: () => validationsService.byRegion(filters),
  });
  const officers = useQuery({
    queryKey: [...qk.validations, 'by-officer', filters],
    queryFn: () => validationsService.byOfficer(filters),
  });

  const r = responses.data ?? [];
  const reg = regions.data ?? [];
  const off = officers.data ?? [];

  if (responses.isLoading) {
    return (
      <Card className="mb-5">
        <TableSkeleton rows={5} cols={4} />
      </Card>
    );
  }
  if (responses.error) {
    return (
      <Card className="mb-5">
        <ErrorState message={errorMessage(responses.error)} onRetry={() => responses.refetch()} />
      </Card>
    );
  }

  return (
    <div className="mb-5 space-y-5">
      {r.length > 0 && (
        <ChartCard title="What customers said" height={300}>
          <ResponsiveContainer>
            <BarChart data={r} margin={{ top: 5, right: 10, left: -15, bottom: 70 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="response" tick={theme.tick} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
              <Bar dataKey="customers" name="Customers" radius={[4, 4, 0, 0]}>
                {r.map((row) => (
                  <Cell key={row.response} fill={OUTCOME_COLOR[row.outcome]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {r.length > 0 && (
        <Card>
          <CardHeader title="Responses" description="Grouped by what each answer means for the account" />
          <ReportTable
            caption="Responses"
            rows={r}
            rowKey={(x) => x.response}
            columns={[
              { key: 'response', header: 'Response', render: (x) => <span className="font-medium">{x.response}</span>, footer: 'Total' },
              {
                key: 'means',
                header: 'Means',
                render: (x) => (
                  <span style={{ color: OUTCOME_COLOR[x.outcome] }} className="text-xs font-semibold">
                    {OUTCOME_LABEL[x.outcome]}
                  </span>
                ),
              },
              { key: 'customers', header: 'Customers', align: 'right', render: (x) => formatNumber(x.customers), footer: formatNumber(sum(r, (x) => x.customers)) },
              { key: 'outstanding', header: 'Outstanding', align: 'right', render: (x) => formatGHS(x.outstanding), footer: formatGHS(sum(r, (x) => x.outstanding)) },
              { key: 'collected', header: 'Collected', align: 'right', render: (x) => formatGHS(x.collected), footer: formatGHS(sum(r, (x) => x.collected)) },
            ]}
          />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {reg.length > 0 && (
          <Card>
            <CardHeader title="By region" />
            <ReportTable
              caption="Validation by region"
              rows={reg}
              rowKey={(x) => x.region}
              columns={[
                { key: 'region', header: 'Region', render: (x) => x.region, footer: 'Total' },
                { key: 'customers', header: 'Customers', align: 'right', render: (x) => x.customers, footer: formatNumber(sum(reg, (x) => x.customers)) },
                { key: 'answered', header: 'Answered', align: 'right', render: (x) => x.answered, footer: formatNumber(sum(reg, (x) => x.answered)) },
                { key: 'active', header: 'Active', align: 'right', render: (x) => x.active, footer: formatNumber(sum(reg, (x) => x.active)) },
                { key: 'inactive', header: 'Gone', align: 'right', render: (x) => x.inactive, footer: formatNumber(sum(reg, (x) => x.inactive)) },
                { key: 'rate', header: 'Answered %', align: 'right', render: (x) => formatPercent(x.answer_rate) },
              ]}
            />
          </Card>
        )}

        {off.length > 0 && (
          <Card>
            <CardHeader title="By officer" />
            <ReportTable
              caption="Validation by officer"
              rows={off}
              rowKey={(x) => x.officer_name}
              columns={[
                { key: 'officer', header: 'Officer', render: (x) => x.officer_name, footer: 'Total' },
                { key: 'customers', header: 'On list', align: 'right', render: (x) => x.customers, footer: formatNumber(sum(off, (x) => x.customers)) },
                { key: 'calls', header: 'Calls', align: 'right', render: (x) => x.calls, footer: formatNumber(sum(off, (x) => x.calls)) },
                { key: 'answered', header: 'Answered', align: 'right', render: (x) => x.answered, footer: formatNumber(sum(off, (x) => x.answered)) },
                { key: 'collected', header: 'Collected', align: 'right', render: (x) => formatGHS(x.collected), footer: formatGHS(sum(off, (x) => x.collected)) },
                { key: 'rate', header: 'Answered %', align: 'right', render: (x) => formatPercent(x.answer_rate) },
              ]}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

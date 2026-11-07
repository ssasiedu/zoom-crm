/**
 * The pictures that go in the monthly PDF.
 *
 * Kept apart from the report component because the PDF is built from the
 * data, not from what happens to be on screen — the charts have to be
 * describable without a browser having painted anything.
 */
import type {
  DebtorMoneyByRegionRow,
  ForwardedReport,
  IssueByRegionRow,
  Kpis,
  CombinedTotals,
  OfficerCombinedRow,
  OutboundByRegionRow,
  PaymentStatusByRegionRow,
  StatusByRegionRow,
} from '@/types';
import { formatGHS, formatHours, formatNumber, formatPercent } from '@/utils/format';
import { PDF_STATUS_COLORS, type ChartSpec, type KpiTile } from '@/utils/pdfCharts';

interface MonthlyChartInput {
  kpis: Kpis;
  combined: CombinedTotals;
  regions: StatusByRegionRow[];
  issues: IssueByRegionRow[];
  outbound: OutboundByRegionRow[];
  paymentStatus: PaymentStatusByRegionRow[];
  debtorMoney: DebtorMoneyByRegionRow[];
  officers: OfficerCombinedRow[];
  forwarded: ForwardedReport;
}

/** The five figures an executive looks at first */
export function monthlyKpis({ kpis: k, combined: c }: MonthlyChartInput): KpiTile[] {
  return [
    { label: 'Tickets opened', value: formatNumber(k.total), hint: `${formatNumber(k.overdue)} overdue` },
    {
      label: 'Resolution rate',
      value: formatPercent(k.resolution_rate),
      hint: `SLA met ${formatPercent(k.sla_compliance)}`,
    },
    { label: 'Average resolution', value: formatHours(k.avg_resolution_hours) },
    {
      label: 'All calls',
      value: formatNumber(c.calls_total),
      hint: `${formatNumber(c.ticket_inbound_calls)} in · ${formatNumber(c.outbound_calls_total)} out`,
    },
    {
      label: 'Total received',
      value: formatGHS(c.payments_total, { plain: true }),
      hint: `${formatGHS(c.debtor_collected, { plain: true })} from debtors`,
    },
  ];
}

/** Charts that open the report, before any table */
export function monthlyOverviewCharts(d: MonthlyChartInput): ChartSpec[] {
  const live = d.regions.filter((r) => r.total > 0);
  const outbound = d.outbound.filter((r) => r.total_outbound > 0);
  const moneyRegions = regionsWithMoney(d);

  return [
    {
      kind: 'share',
      title: 'Where the money came from',
      note: 'Share of everything received this month',
      categories: ['month'],
      format: 'money',
      series: [
        { name: 'Ticket payments', values: [d.combined.ticket_payments] },
        { name: 'Debt recovery', values: [d.combined.debtor_collected] },
      ],
    },
    {
      kind: 'stackedBar',
      title: 'Tickets by region and status',
      note: 'Every region with activity this month',
      categories: live.map((r) => r.region),
      valueLabels: true,
      series: [
        { name: 'Open', values: live.map((r) => r.open), color: PDF_STATUS_COLORS.Open },
        { name: 'In-Progress', values: live.map((r) => r.in_progress), color: PDF_STATUS_COLORS['In-Progress'] },
        { name: 'Resolved', values: live.map((r) => r.resolved), color: PDF_STATUS_COLORS.Resolved },
        { name: 'Closed', values: live.map((r) => r.closed), color: PDF_STATUS_COLORS.Closed },
      ],
    },
    {
      kind: 'stackedBar',
      title: 'Outbound calls by region',
      note: 'Calls logged on tickets, and calls logged against debtor accounts',
      categories: outbound.map((r) => r.region),
      series: [
        { name: 'Ticket calls', values: outbound.map((r) => r.ticket_outbound) },
        { name: 'Debtor calls', values: outbound.map((r) => r.debtor_calls) },
      ],
    },
    {
      kind: 'stackedBar',
      title: 'Money received by region',
      note: 'Ticket payments and debt recovery together',
      categories: moneyRegions.map((r) => r.region),
      format: 'money',
      valueLabels: true,
      series: [
        { name: 'From tickets', values: moneyRegions.map((r) => r.tickets) },
        { name: 'From debtors', values: moneyRegions.map((r) => r.debtors) },
      ],
    },
  ];
}

function regionsWithMoney(d: MonthlyChartInput) {
  const debtors = new Map(d.debtorMoney.map((r) => [r.region, r.collected]));
  const names = [...new Set([...d.regions.map((r) => r.region), ...d.debtorMoney.map((r) => r.region)])];
  return names
    .map((region) => ({
      region,
      tickets: d.regions.find((r) => r.region === region)?.payments ?? 0,
      debtors: debtors.get(region) ?? 0,
    }))
    .filter((r) => r.tickets > 0 || r.debtors > 0)
    .sort((a, b) => b.tickets + b.debtors - (a.tickets + a.debtors));
}

/* ------------------------------------------------------------------ */
/* Charts that sit above a particular table                            */
/* ------------------------------------------------------------------ */

/** Issue types across every region, biggest first */
export function issueTypeChart(rows: IssueByRegionRow[]): ChartSpec {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.issue_type, (totals.get(r.issue_type) ?? 0) + r.count);
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return {
    kind: 'hbar',
    title: 'Issue types',
    note: 'Every region together',
    categories: sorted.map(([name]) => name),
    series: [{ name: 'Tickets', values: sorted.map(([, n]) => n) }],
    maxCategories: 12,
  };
}

export function paymentStatusChart(rows: PaymentStatusByRegionRow[]): ChartSpec {
  const byStatus = new Map<string, { tickets: number; debtors: number }>();
  for (const r of rows) {
    const cur = byStatus.get(r.payment_status) ?? { tickets: 0, debtors: 0 };
    byStatus.set(r.payment_status, {
      tickets: cur.tickets + r.ticket_total,
      debtors: cur.debtors + r.debtor_total,
    });
  }
  const sorted = [...byStatus.entries()].sort((a, b) => b[1].tickets + b[1].debtors - (a[1].tickets + a[1].debtors));
  return {
    kind: 'stackedBar',
    title: 'Payments by status',
    note: 'Debt recovery is counted as Receivables',
    categories: sorted.map(([name]) => name),
    format: 'money',
    valueLabels: true,
    series: [
      { name: 'From tickets', values: sorted.map(([, v]) => v.tickets) },
      { name: 'From debtors', values: sorted.map(([, v]) => v.debtors) },
    ],
  };
}

export function debtorMoneyChart(rows: DebtorMoneyByRegionRow[]): ChartSpec {
  const live = rows.filter((r) => r.collected > 0 || r.calls > 0).sort((a, b) => b.collected - a.collected);
  return {
    kind: 'bar',
    title: 'Money recovered from debtors, by region',
    note: 'Counted on the day of the call that collected it',
    categories: live.map((r) => r.region),
    format: 'money',
    valueLabels: true,
    series: [{ name: 'Received', values: live.map((r) => r.collected) }],
  };
}

/** Who did the talking: ticket contacts and debtor calls, per officer */
export function officerCallsChart(rows: OfficerCombinedRow[]): ChartSpec {
  const sorted = [...rows].filter((r) => r.total_calls > 0).sort((a, b) => b.total_calls - a.total_calls);
  return {
    kind: 'hbar',
    title: 'Total calls per officer',
    note: 'Every ticket contact plus the debtor calls they logged',
    categories: sorted.map((r) => r.officer_name),
    series: [
      { name: 'Ticket contacts', values: sorted.map((r) => r.ticket_contacts) },
      { name: 'Debtor calls', values: sorted.map((r) => r.debtor_calls) },
    ],
    maxCategories: 12,
  };
}

export function officerMoneyChart(rows: OfficerCombinedRow[]): ChartSpec {
  const sorted = [...rows].filter((r) => r.total_received > 0).sort((a, b) => b.total_received - a.total_received);
  return {
    kind: 'hbar',
    title: 'Money received per officer',
    categories: sorted.map((r) => r.officer_name),
    format: 'money',
    series: [
      { name: 'Ticket payments', values: sorted.map((r) => r.payments) },
      { name: 'From debtors', values: sorted.map((r) => r.debtor_collected) },
    ],
    maxCategories: 12,
  };
}

export function forwardedChart(d: ForwardedReport): ChartSpec {
  const rows = [...d.by_district].sort((a, b) => b.total - a.total);
  return {
    kind: 'stackedBar',
    title: 'Forwarded work by district',
    note: 'What the District Operation Officers are carrying, and how far it has got',
    categories: rows.map((r) => r.district),
    maxCategories: 14,
    series: [
      { name: 'Open', values: rows.map((r) => r.open), color: PDF_STATUS_COLORS.Open },
      { name: 'In-Progress', values: rows.map((r) => r.in_progress), color: PDF_STATUS_COLORS['In-Progress'] },
      { name: 'Resolved', values: rows.map((r) => r.resolved), color: PDF_STATUS_COLORS.Resolved },
      { name: 'Closed', values: rows.map((r) => r.closed), color: PDF_STATUS_COLORS.Closed },
    ],
  };
}

export function contactMixChart(rows: { label: string; count: number }[]): ChartSpec {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  return {
    kind: 'share',
    title: 'How clients reached us',
    note: 'Share of tickets by type of contact',
    categories: ['month'],
    series: sorted.map((r) => ({ name: r.label, values: [r.count] })),
  };
}

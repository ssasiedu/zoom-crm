import { useNavigate } from 'react-router';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  FolderOpen,
  Inbox,
  Lock,
  Percent,
  PlayCircle,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ChartCard, ChartTooltip, useChartTheme } from '@/components/charts/ChartKit';
import { Avatar, Card, CardHeader, EmptyState, ErrorState, PageHeader, Button, Skeleton, StatCard } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { CHART_PALETTE, STATUS_COLORS } from '@/lib/constants';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import type { TicketStatus } from '@/types';
import { rangeLabel } from '@/utils/dateRange';
import { formatGHS, formatHours, formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { describeActivity } from '@/features/tickets/ActivityTimeline';
import { ticketsUrl } from '@/features/tickets/ticketFilters';
import { ReportFiltersBar } from '@/features/reports/ReportFiltersBar';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { RegionBreakdown } from './RegionBreakdown';
import { useDashboardData } from './useDashboard';

/** Recharts passes the datum either flat or under .payload depending on the chart */
function clickDrill(e: unknown, key: string, run: (value: string) => void) {
  const obj = e as { payload?: Record<string, unknown> } & Record<string, unknown>;
  const v = obj?.[key] ?? obj?.payload?.[key];
  if (typeof v === 'string' && v) run(v);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, role } = useAuth();
  const rf = useReportFilters('month');
  const d = useDashboardData(rf.filters);
  const theme = useChartTheme();
  const k = d.kpis.data;
  const drill = (extra: Record<string, string | undefined>) => navigate(ticketsUrl({ ...rf.ticketParams, ...extra }));

  const trendFmt = (b: string) => {
    const date = parseISO(b);
    return d.bucket === 'month' ? format(date, 'MMM yy') : format(date, 'dd MMM');
  };

  if (d.kpis.error) {
    return <ErrorState message={errorMessage(d.kpis.error)} onRetry={() => queryClient.invalidateQueries({ queryKey: qk.dashboard })} />;
  }

  const officerData = (d.officers.data ?? [])
    .filter((o) => o.total_assigned > 0)
    .slice(0, 12)
    .map((o) => ({ name: o.officer_name, Active: o.active, Resolved: o.resolved, Overdue: o.overdue, id: o.officer_id }));

  return (
    <>
      <PageHeader
        eyebrow={role === 'agent' ? 'Your tickets' : 'Overview'}
        title="Dashboard"
        description={`${rangeLabel(rf.range)} · Welcome back, ${profile?.full_name.split(' ')[0] ?? ''}`}
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="size-4" />}
            onClick={() => queryClient.invalidateQueries({ queryKey: qk.dashboard })}
          >
            Refresh
          </Button>
        }
      />
      <ReportFiltersBar state={rf} />

      <section aria-label="Key metrics" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total tickets" value={formatNumber(k?.total)} icon={<FolderOpen />} loading={d.kpis.isLoading} onClick={() => drill({})} />
        <StatCard label="Open" value={formatNumber(k?.open)} icon={<Inbox />} tone="blue" loading={d.kpis.isLoading} onClick={() => drill({ status: 'Open' })} />
        <StatCard label="In progress" value={formatNumber(k?.in_progress)} icon={<PlayCircle />} tone="amber" loading={d.kpis.isLoading} onClick={() => drill({ status: 'In-Progress' })} />
        <StatCard label="Resolved" value={formatNumber(k?.resolved)} icon={<CheckCircle2 />} tone="green" loading={d.kpis.isLoading} onClick={() => drill({ status: 'Resolved' })} />
        <StatCard label="Closed" value={formatNumber(k?.closed)} icon={<Lock />} tone="gray" loading={d.kpis.isLoading} onClick={() => drill({ status: 'Closed' })} />
        <StatCard label="Overdue" value={formatNumber(k?.overdue)} icon={<AlertTriangle />} tone="red" loading={d.kpis.isLoading} onClick={() => drill({ overdue: '1' })} hint="Past due, still active" />
        <StatCard label="Unassigned" value={formatNumber(k?.unassigned)} icon={<UserX />} tone="violet" loading={d.kpis.isLoading} onClick={() => drill({ officer: 'unassigned', status: 'Open,In-Progress' })} />
        <StatCard label="Resolution rate" value={formatPercent(k?.resolution_rate)} icon={<Percent />} tone="brand" loading={d.kpis.isLoading} hint={`SLA met on ${formatPercent(k?.sla_compliance)} of resolved`} />
        <StatCard label="Avg. resolution time" value={formatHours(k?.avg_resolution_hours)} icon={<Clock />} tone="brand" loading={d.kpis.isLoading} hint="Opened → completed" />
        <StatCard label="Total payments" value={formatGHS(k?.total_payments)} icon={<Banknote />} tone="gold" loading={d.kpis.isLoading} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Tickets over time"
          description={`Opened vs resolved per ${d.bucket}`}
          loading={d.trend.isLoading}
          empty={!d.trend.data?.length}
        >
          <ResponsiveContainer>
            <AreaChart data={d.trend.data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gOpened" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.brand} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={theme.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={trendFmt} tick={theme.tick} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip labelFormatter={trendFmt} />} cursor={{ stroke: theme.grid }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="opened" name="Opened" stroke="#0ea5e9" strokeWidth={2} fill="url(#gOpened)" />
              <Area type="monotone" dataKey="resolved" name="Resolved / closed" stroke={theme.brand} strokeWidth={2} fill="url(#gResolved)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status distribution" loading={d.status.isLoading} empty={!d.status.data?.length}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={d.status.data}
                dataKey="count"
                nameKey="label"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                onClick={(e: unknown) => clickDrill(e, 'label', (v) => drill({ status: v }))}
                className="cursor-pointer"
              >
                {(d.status.data ?? []).map((s) => (
                  <Cell key={s.label} fill={STATUS_COLORS[s.label as TicketStatus] ?? '#94a3b8'} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-5">
        <RegionBreakdown
          rows={d.regions.data ?? []}
          loading={d.regions.isLoading}
          selected={rf.filters.region}
          onSelect={(region) => rf.set({ region })}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="By type of contact" description="Click a bar to see the tickets" loading={d.contactType.isLoading} empty={!d.contactType.data?.length}>
          <ResponsiveContainer>
            <BarChart data={d.contactType.data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="label" tick={theme.tick} axisLine={false} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
              <Bar dataKey="count" name="Tickets" radius={[6, 6, 0, 0]} className="cursor-pointer" onClick={(e: unknown) => clickDrill(e, 'label', (v) => drill({ contact_type: v }))}>
                {(d.contactType.data ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="By issue type" loading={d.issueType.isLoading} empty={!d.issueType.data?.length}>
          <ResponsiveContainer>
            <BarChart data={d.issueType.data} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={150} tick={theme.tick} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
              <Bar dataKey="count" name="Tickets" fill={theme.brand} radius={[0, 6, 6, 0]} className="cursor-pointer" onClick={(e: unknown) => clickDrill(e, 'label', (v) => drill({ issue_type: v }))} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top communities" description="10 communities with the most tickets" loading={d.communities.isLoading} empty={!d.communities.data?.length}>
          <ResponsiveContainer>
            <BarChart data={d.communities.data} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={120} tick={theme.tick} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
              <Bar dataKey="count" name="Tickets" fill={theme.gold} radius={[0, 6, 6, 0]} className="cursor-pointer" onClick={(e: unknown) => clickDrill(e, 'label', (v) => drill({ community: v }))} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {role !== 'dm_officer' ? (
          <ChartCard title="Officer workload" description="Active vs resolved in this period" loading={d.officers.isLoading} empty={officerData.length === 0}>
            <ResponsiveContainer>
              <BarChart data={officerData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="name" tick={theme.tick} axisLine={false} tickLine={false} interval={0} tickFormatter={(v: string) => v.split(' ')[0]} />
                <YAxis allowDecimals={false} tick={theme.tick} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Active" stackId="a" fill="#f59e0b" className="cursor-pointer" onClick={(e: unknown) => clickDrill(e, 'id', (v) => drill({ officer: v, status: 'Open,In-Progress' }))} />
                <Bar dataKey="Resolved" stackId="a" fill={theme.brand} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Overdue" fill="#e11d48" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <div />
        )}
      </div>

      <Card>
        <CardHeader title="Recent activity" description="Latest changes on tickets you can see" />
        <div className="p-2">
          {d.activity.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !d.activity.data?.length ? (
            <EmptyState compact title="No activity yet" />
          ) : (
            <ul className="divide-y dark:divide-slate-800">
              {d.activity.data.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/tickets/${a.ticket_id}`)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Avatar name={a.actor?.full_name ?? 'System'} size="sm" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{a.actor?.full_name ?? 'System'}</span> {describeActivity(a).title}
                      <span className="block truncate text-xs text-slate-500">
                        <span className="font-mono">{a.ticket?.ticket_number}</span> · {a.ticket?.client_name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{formatRelative(a.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryClient';
import { activityService } from '@/services/activity';
import { reportsService, type BreakdownDimension } from '@/services/reports';
import type { ReportFilters } from '@/types';

export function bucketFor(f: ReportFilters): 'day' | 'week' | 'month' {
  if (!f.from || !f.to) return 'month';
  const days = differenceInCalendarDays(parseISO(f.to), parseISO(f.from));
  if (days <= 45) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

export function useDashboardData(filters: ReportFilters) {
  const { session } = useAuth();
  const enabled = Boolean(session);
  const key = (name: string, extra?: unknown) => [...qk.dashboard, name, filters, extra];
  const breakdown = (dim: BreakdownDimension, limit = 50) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({ queryKey: key(`breakdown-${dim}`, limit), queryFn: () => reportsService.breakdown(dim, filters, limit), enabled });

  const bucket = bucketFor(filters);
  return {
    bucket,
    kpis: useQuery({ queryKey: key('kpis'), queryFn: () => reportsService.kpis(filters), enabled }),
    trend: useQuery({ queryKey: key('trend', bucket), queryFn: () => reportsService.trend(filters, bucket), enabled }),
    status: breakdown('status'),
    /* Debtor calls are outbound calls too, so the mix and the headline
       totals below count them alongside tickets. */
    contactType: useQuery({ queryKey: key('contact-mix'), queryFn: () => reportsService.contactMix(filters), enabled }),
    combined: useQuery({ queryKey: key('combined'), queryFn: () => reportsService.combined(filters), enabled }),
    issueType: breakdown('issue_type'),
    communities: breakdown('community', 10),
    regions: useQuery({ queryKey: key('regions'), queryFn: () => reportsService.statusByRegion(filters), enabled }),
    officers: useQuery({ queryKey: key('officers'), queryFn: () => reportsService.officerPerformance(filters), enabled }),
    turnaround: useQuery({ queryKey: key('turnaround'), queryFn: () => reportsService.turnaround(filters), enabled }),
    activity: useQuery({ queryKey: [...qk.dashboard, 'activity'], queryFn: () => activityService.recent(10), enabled }),
  };
}

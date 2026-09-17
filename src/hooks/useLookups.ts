import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { lookupsService } from '@/services/lookups';
import { officersService } from '@/services/officers';
import type { Lookups } from '@/types';
import { useAuth } from './useAuth';

const EMPTY: Lookups = {
  contact_types: [],
  issue_types: [],
  payment_sources: [],
  payment_types: [],
  payment_statuses: [],
  regions: [],
};

/** All lookup tables (including inactive values) */
export function useLookups() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: qk.lookups,
    queryFn: lookupsService.getAll,
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
  });
  const data = query.data ?? EMPTY;
  const active = {
    contact_types: data.contact_types.filter((x) => x.is_active),
    issue_types: data.issue_types.filter((x) => x.is_active),
    payment_sources: data.payment_sources.filter((x) => x.is_active),
    payment_types: data.payment_types.filter((x) => x.is_active),
    payment_statuses: data.payment_statuses.filter((x) => x.is_active),
    regions: data.regions.filter((x) => x.is_active),
  } satisfies Lookups;
  return { ...query, lookups: data, active };
}

export function useOfficers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.officers,
    queryFn: officersService.list,
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}

export function useOfficerWorkload(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.workload,
    queryFn: officersService.workload,
    enabled: Boolean(session) && enabled,
    staleTime: 15_000,
  });
}

/** value/label options for <Select> */
export function toOptions(items: { name: string }[]) {
  return items.map((i) => ({ value: i.name, label: i.name }));
}

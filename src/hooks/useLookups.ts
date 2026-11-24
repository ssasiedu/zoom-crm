import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { lookupsService } from '@/services/lookups';
import { officersService } from '@/services/officers';
import type { Lookups, Officer } from '@/types';
import { useAuth } from './useAuth';

const EMPTY: Lookups = {
  contact_types: [],
  issue_types: [],
  payment_sources: [],
  payment_types: [],
  payment_statuses: [],
  regions: [],
  customer_types: [],
  providers: [],
  debtor_feedback: [],
  districts: [],
  validation_responses: [],
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
    customer_types: data.customer_types.filter((x) => x.is_active),
    providers: data.providers.filter((x) => x.is_active),
    debtor_feedback: data.debtor_feedback.filter((x) => x.is_active),
    districts: data.districts.filter((x) => x.is_active),
    validation_responses: data.validation_responses.filter((x) => x.is_active),
  } satisfies Lookups;
  return { ...query, lookups: data, active };
}

/** The active districts of one region, in their configured order */
export function districtsOf(lookups: Lookups, region: string | null | undefined) {
  if (!region) return [];
  return lookups.districts.filter((d) => d.is_active && d.region === region);
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

/**
 * The officers worth offering once a region has been picked.
 *
 * An officer's region is where they are based. Choosing Ahafo and then
 * being offered every officer in the country is how you end up with a
 * contradictory pair of filters and an empty report that looks like a
 * bug.
 *
 * Officers with no region recorded are always kept: there is no evidence
 * they do not work the chosen region, and dropping them would hide real
 * work. They are marked so it is clear why they are still listed.
 */
export function officerOptionsFor(
  officers: Officer[],
  region: string | null | undefined,
): { value: string; label: string }[] {
  const active = officers.filter((o) => o.is_active);
  if (!region) return active.map((o) => ({ value: o.id, label: o.full_name }));
  return active
    .filter((o) => !o.region || o.region === region)
    .map((o) => ({
      value: o.id,
      label: o.region ? o.full_name : `${o.full_name} — no region set`,
    }));
}

/** Whether a chosen officer still belongs in the list after a region change */
export function officerFitsRegion(
  officers: Officer[],
  officerId: string | null | undefined,
  region: string | null | undefined,
): boolean {
  if (!officerId || !region) return true;
  /* 'unassigned' is a pseudo-value on some filter bars, never an officer */
  if (officerId === 'unassigned') return true;
  const officer = officers.find((o) => o.id === officerId);
  return !officer || !officer.region || officer.region === region;
}

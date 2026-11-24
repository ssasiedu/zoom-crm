import { supabase } from '@/lib/supabase';
import type {
  DistrictOfficerOption,
  Officer,
  OfficerKind,
  OfficerSummary,
  OfficerWorkload,
  RegionDistrictRow,
} from '@/types';
import { toNumber } from '@/utils/format';
import { errorMessage, unwrap } from './errors';

export type OfficerInput = Pick<Officer, 'full_name' | 'region' | 'phone' | 'email' | 'is_active'> & {
  profile_id?: string | null;
  kind?: OfficerKind;
  district?: string | null;
  manager_officer_id?: string | null;
};

export const officersService = {
  async list(): Promise<Officer[]> {
    return unwrap(await supabase.from('officers').select('*').order('full_name')) as Officer[];
  },

  async listByKind(kind: OfficerKind): Promise<Officer[]> {
    return unwrap(
      await supabase.from('officers').select('*').eq('kind', kind).order('full_name'),
    ) as Officer[];
  },

  /** District Operation Officers a ticket can be forwarded to */
  async districtOfficers(region?: string | null): Promise<DistrictOfficerOption[]> {
    const rows = (unwrap(
      await supabase.rpc('district_officers', { p_region: region ?? null }),
    ) as DistrictOfficerOption[] | null) ?? [];
    return rows.map((r) => ({ ...r, active_tickets: toNumber(r.active_tickets) }));
  },

  /** Region → districts → the officers covering them */
  async regionTree(): Promise<RegionDistrictRow[]> {
    return ((unwrap(await supabase.rpc('region_district_officers')) as RegionDistrictRow[] | null) ?? []).map((r) => ({
      ...r,
      sort_order: toNumber(r.sort_order),
      districts: (r.districts ?? []).map((d) => ({ ...d, sort_order: toNumber(d.sort_order) })),
    }));
  },

  /**
   * Load several officers at once from the pasted or uploaded list.
   *
   * Each row is inserted on its own so one bad line — an unknown
   * district, a name already taken — is reported rather than losing the
   * whole batch.
   */
  async bulkCreate(rows: OfficerInput[]): Promise<{ created: number; errors: { name: string; message: string }[] }> {
    const errors: { name: string; message: string }[] = [];
    let created = 0;
    for (const row of rows) {
      try {
        await officersService.create(row);
        created += 1;
      } catch (err) {
        errors.push({ name: row.full_name, message: errorMessage(err) });
      }
    }
    return { created, errors };
  },

  async workload(): Promise<OfficerWorkload[]> {
    const data = unwrap(await supabase.rpc('officer_workload')) as OfficerWorkload[] | null;
    return (data ?? []).map((w) => ({
      ...w,
      open_count: toNumber(w.open_count),
      in_progress_count: toNumber(w.in_progress_count),
      overdue_count: toNumber(w.overdue_count),
    }));
  },

  async summary(officerId?: string | null): Promise<OfficerSummary> {
    const data = unwrap(
      await supabase.rpc('officer_summary', officerId ? { p_officer: officerId } : {}),
    ) as Record<string, unknown>;
    return {
      assigned: toNumber(data?.assigned),
      active: toNumber(data?.active),
      open: toNumber(data?.open),
      in_progress: toNumber(data?.in_progress),
      overdue: toNumber(data?.overdue),
      due_today: toNumber(data?.due_today),
      resolved: toNumber(data?.resolved),
      resolved_this_month: toNumber(data?.resolved_this_month),
    };
  },

  /** The same numbers as summary(), but for work forwarded to a field officer */
  async fieldSummary(officerId?: string | null): Promise<OfficerSummary> {
    const data = unwrap(
      await supabase.rpc('field_summary', officerId ? { p_officer: officerId } : {}),
    ) as Record<string, unknown>;
    return {
      assigned: toNumber(data?.assigned),
      active: toNumber(data?.active),
      open: toNumber(data?.open),
      in_progress: toNumber(data?.in_progress),
      overdue: toNumber(data?.overdue),
      due_today: toNumber(data?.due_today),
      resolved: toNumber(data?.resolved),
      resolved_this_month: toNumber(data?.resolved_this_month),
    };
  },

  async create(values: OfficerInput): Promise<Officer> {
    return unwrap(
      await supabase
        .from('officers')
        .insert({ ...values, full_name: values.full_name.trim().toUpperCase() })
        .select()
        .single(),
    ) as Officer;
  },

  async update(id: string, values: Partial<OfficerInput>): Promise<Officer> {
    const patch = { ...values };
    if (patch.full_name) patch.full_name = patch.full_name.trim().toUpperCase();
    return unwrap(await supabase.from('officers').update(patch).eq('id', id).select().single()) as Officer;
  },

  /** Link (or unlink with null) an officer record to a user profile */
  async linkProfile(officerId: string, profileId: string | null) {
    if (profileId) {
      // a profile can only be linked to one officer
      unwrap(await supabase.from('officers').update({ profile_id: null }).eq('profile_id', profileId));
    }
    unwrap(await supabase.from('officers').update({ profile_id: profileId }).eq('id', officerId));
  },

  /**
   * Suggest the least-loaded active officer, preferring the ticket's region.
   * Ties are broken by fewer overdue tickets, then name.
   */
  suggest(workload: OfficerWorkload[], region?: string | null): OfficerWorkload | null {
    const active = workload.filter((w) => w.is_active);
    if (active.length === 0) return null;
    const inRegion = region ? active.filter((w) => w.region === region) : [];
    const pool = inRegion.length > 0 ? inRegion : active;
    return (
      [...pool].sort(
        (a, b) =>
          a.open_count + a.in_progress_count - (b.open_count + b.in_progress_count) ||
          a.overdue_count - b.overdue_count ||
          a.full_name.localeCompare(b.full_name),
      )[0] ?? null
    );
  },
};

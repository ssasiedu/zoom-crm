import { supabase } from '@/lib/supabase';
import type { IssueTypeItem, LookupItem, Lookups, LookupTable } from '@/types';
import { unwrap } from './errors';

const TABLES: LookupTable[] = [
  'contact_types',
  'issue_types',
  'payment_sources',
  'payment_types',
  'payment_statuses',
  'regions',
];

export const lookupsService = {
  tables: TABLES,

  /** All lookup tables, including inactive rows (callers filter) */
  async getAll(): Promise<Lookups> {
    const results = await Promise.all(
      TABLES.map((t) => supabase.from(t).select('*').order('sort_order').order('name')),
    );
    const out = {} as Record<LookupTable, LookupItem[]>;
    results.forEach((res, i) => {
      out[TABLES[i]] = unwrap(res) as LookupItem[];
    });
    return {
      ...(out as unknown as Lookups),
      issue_types: out.issue_types as IssueTypeItem[],
    };
  },

  async create(table: LookupTable, values: Partial<IssueTypeItem> & { name: string }) {
    return unwrap(await supabase.from(table).insert(values).select().single()) as LookupItem;
  },

  async update(table: LookupTable, id: number, values: Partial<IssueTypeItem>) {
    return unwrap(await supabase.from(table).update(values).eq('id', id).select().single()) as LookupItem;
  },

  async remove(table: LookupTable, id: number) {
    unwrap(await supabase.from(table).delete().eq('id', id));
  },

  /** Persist a new order: items in the order given get sort_order 10, 20, 30... */
  async reorder(table: LookupTable, ids: number[]) {
    await Promise.all(
      ids.map(async (id, index) =>
        unwrap(await supabase.from(table).update({ sort_order: (index + 1) * 10 }).eq('id', id)),
      ),
    );
  },
};

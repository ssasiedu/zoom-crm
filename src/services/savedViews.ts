import { supabase } from '@/lib/supabase';
import type { SavedView } from '@/types';
import { unwrap } from './errors';

export const savedViewsService = {
  async list(): Promise<SavedView[]> {
    return unwrap(await supabase.from('saved_views').select('*').order('name')) as SavedView[];
  },

  async save(name: string, filters: Record<string, string>): Promise<SavedView> {
    return unwrap(
      await supabase
        .from('saved_views')
        .upsert({ name: name.trim(), filters }, { onConflict: 'user_id,name' })
        .select()
        .single(),
    ) as SavedView;
  },

  async remove(id: string): Promise<void> {
    unwrap(await supabase.from('saved_views').delete().eq('id', id));
  },
};

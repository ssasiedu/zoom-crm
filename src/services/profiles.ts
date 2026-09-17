import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';
import { AppError, toAppError, unwrap } from './errors';

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: Role;
  region?: string | null;
  phone?: string | null;
  officer_id?: string | null;
  mode: 'invite' | 'password';
  password?: string;
}

export const profilesService = {
  async list(): Promise<Profile[]> {
    return unwrap(await supabase.from('profiles').select('*').order('full_name')) as Profile[];
  },

  async update(id: string, values: Partial<Pick<Profile, 'full_name' | 'phone' | 'role' | 'region' | 'is_active'>>) {
    return unwrap(await supabase.from('profiles').update(values).eq('id', id).select().single()) as Profile;
  },

  async invite(input: InviteUserInput): Promise<{ user_id: string }> {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { ...input, redirect_to: `${window.location.origin}/reset-password` },
    });
    if (error) {
      // FunctionsHttpError carries the JSON body in context
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as { error?: string };
          if (body?.error) throw new AppError(body.error);
        } catch (inner) {
          if (inner instanceof AppError) throw inner;
        }
      }
      throw toAppError({
        message:
          'Could not reach the invite-user function. Make sure it is deployed (see README → Edge function).',
      });
    }
    if (data?.error) throw new AppError(String(data.error));
    return data as { user_id: string };
  },
};

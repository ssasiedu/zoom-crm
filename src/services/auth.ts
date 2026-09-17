import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { toAppError, unwrap } from './errors';

export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      throw toAppError(
        error.message === 'Invalid login credentials' ? { message: 'Incorrect email or password.' } : error,
      );
    }
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw toAppError(error);
  },

  async sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw toAppError(error);
  },

  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw toAppError(error);
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async getProfile(userId: string): Promise<Profile | null> {
    return unwrap(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()) as Profile | null;
  },

  async getOfficerIdForProfile(userId: string): Promise<string | null> {
    const row = unwrap(
      await supabase.from('officers').select('id').eq('profile_id', userId).maybeSingle(),
    ) as { id: string } | null;
    return row?.id ?? null;
  },

  async updateOwnProfile(userId: string, values: Pick<Profile, 'full_name' | 'phone'>) {
    return unwrap(
      await supabase.from('profiles').update(values).eq('id', userId).select().single(),
    ) as Profile;
  },
};

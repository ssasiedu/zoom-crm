import { supabase } from '@/lib/supabase';
import type { AiSettings, Branding, SettingsKey, SmsSettings } from '@/types';
import { unwrap } from './errors';

export const BRANDING_BUCKET = 'branding';

export const DEFAULT_BRANDING: Branding = {
  app_name: 'Zoomlion CRM',
  tagline: 'Service & Debt Management',
  logo_url: null,
  primary_color: '#14532d',
  accent_color: '#e5a50a',
};

export const DEFAULT_SMS: SmsSettings = {
  enabled: false,
  provider: 'mnotify',
  endpoint: 'https://api.mnotify.com/api/sms/quick',
  api_key: '',
  sender_id: 'Zoomlion',
  auto_send: true,
  is_schedule: false,
  schedule_date: '',
  daily_limit: 1000,
};

export const DEFAULT_AI: AiSettings = {
  enabled: false,
  provider: 'anthropic',
  api_key: '',
  model: 'claude-3-5-haiku-latest',
  max_similar: 8,
};

interface SettingsRow {
  key: SettingsKey;
  value: Record<string, unknown>;
}

export const settingsService = {
  /**
   * Everything the signed-in user is allowed to read. Secret rows (sms, ai)
   * only come back for admins — RLS filters them out for everyone else.
   */
  async getAll(): Promise<{ branding: Branding; sms: SmsSettings | null; ai: AiSettings | null }> {
    const rows = (unwrap(await supabase.from('app_settings').select('key, value')) ?? []) as SettingsRow[];
    const pick = (key: SettingsKey) => rows.find((r) => r.key === key)?.value;
    const branding = pick('branding');
    const sms = pick('sms');
    const ai = pick('ai');
    return {
      branding: { ...DEFAULT_BRANDING, ...(branding as Partial<Branding> | undefined) },
      sms: sms ? { ...DEFAULT_SMS, ...(sms as Partial<SmsSettings>) } : null,
      ai: ai ? { ...DEFAULT_AI, ...(ai as Partial<AiSettings>) } : null,
    };
  },

  async save(key: SettingsKey, value: Record<string, unknown>) {
    unwrap(
      await supabase
        .from('app_settings')
        .upsert({ key, value, is_secret: key !== 'branding' }, { onConflict: 'key' }),
    );
  },

  /** Uploads the logo to the public branding bucket and returns its URL */
  async uploadLogo(file: File): Promise<string> {
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  async removeLogo(url: string) {
    const marker = `/${BRANDING_BUCKET}/`;
    const index = url.indexOf(marker);
    if (index < 0) return;
    const path = url.slice(index + marker.length).split('?')[0];
    await supabase.storage.from(BRANDING_BUCKET).remove([path]);
  },
};

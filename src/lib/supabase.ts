import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project-ref'));

/**
 * Single Supabase client for the whole app. Components never import this
 * directly; they go through src/services/*.
 */
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'dm-crm-auth',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export const ATTACHMENT_BUCKET = 'ticket-attachments';

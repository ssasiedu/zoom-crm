// Supabase Edge Function: send-sms
//
// Sends SMS through the provider configured in app_settings['sms'] (mNotify
// by default). The API key never reaches the browser: it is read here with
// the service role and the request to the provider is made server-side.
//
// Deploy:  supabase functions deploy send-sms
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//          provided automatically by Supabase.
//
// Actions
//   { action: 'send',     recipient, message, ticket_id?, debtor_id?, template_code? }
//   { action: 'dispatch', limit? }   -> send everything queued by the triggers
//   { action: 'test',     recipient, message? }  (admins only)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface SmsSettings {
  enabled?: boolean;
  provider?: string;
  endpoint?: string;
  api_key?: string;
  sender_id?: string;
  auto_send?: boolean;
  is_schedule?: boolean;
  schedule_date?: string;
  daily_limit?: number;
}

interface QueuedMessage {
  id: string;
  recipient: string;
  message: string;
  attempts: number;
}

/** 0XXXXXXXXX / +233XXXXXXXXX / 233XXXXXXXXX -> 0XXXXXXXXX */
function normalise(phone: string): string | null {
  const v = (phone ?? '').replace(/[\s\-().]/g, '');
  if (/^0\d{9}$/.test(v)) return v;
  if (/^\+233\d{9}$/.test(v)) return `0${v.slice(4)}`;
  if (/^233\d{9}$/.test(v)) return `0${v.slice(3)}`;
  if (/^\d{9}$/.test(v)) return `0${v}`;
  return null;
}

/** GSM-7 messages are 160 chars, 153 per part once concatenated */
function segments(message: string): number {
  const unicode = /[^\x20-\x7E\n\r]/.test(message);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return message.length <= single ? 1 : Math.ceil(message.length / multi);
}

interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  response: unknown;
}

async function sendViaProvider(settings: SmsSettings, recipient: string, message: string): Promise<SendResult> {
  const endpoint = (settings.endpoint || 'https://api.mnotify.com/api/sms/quick').trim();
  const apiKey = (settings.api_key || '').trim();
  if (!apiKey) return { ok: false, error: 'No SMS API key configured', response: null };

  const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
  const payload = {
    recipient: [recipient],
    sender: (settings.sender_id || 'Zoomlion').trim(),
    message,
    is_schedule: Boolean(settings.is_schedule),
    schedule_date: settings.schedule_date || '',
  };

  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error', response: null };
  }

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  // mNotify answers { status: 'success', code: '2000', message, summary: {...} }
  const status = String(body.status ?? '').toLowerCase();
  const code = String(body.code ?? '');
  const ok = res.ok && (status === 'success' || code === '2000' || code === '2010');
  const summary = (body.summary ?? {}) as Record<string, unknown>;

  return {
    ok,
    providerId: (summary._id ?? summary.id ?? body.message_id) as string | undefined,
    error: ok ? undefined : String(body.message ?? body.error ?? `Provider returned HTTP ${res.status}`),
    response: body,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return json({ error: 'Function is not configured' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'You must be signed in' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me } = await admin.from('profiles').select('role, is_active, full_name').eq('id', user.id).single();
    if (!me || !me.is_active) return json({ error: 'Your account is inactive' }, 403);

    const { data: settingsRow } = await admin.from('app_settings').select('value').eq('key', 'sms').single();
    const settings = (settingsRow?.value ?? {}) as SmsSettings;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? 'send');

    if (!settings.enabled && action !== 'test') {
      return json({ error: 'SMS is turned off. Enable it under Administration → SMS.' }, 400);
    }

    // ---------------------------------------------------------------
    // Daily cap, counted across everything sent today
    // ---------------------------------------------------------------
    const dailyLimit = Number(settings.daily_limit ?? 0);
    if (dailyLimit > 0) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { count } = await admin
        .from('sms_messages')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', since.toISOString());
      if ((count ?? 0) >= dailyLimit) {
        return json({ error: `Daily SMS limit of ${dailyLimit} reached` }, 429);
      }
    }

    // ---------------------------------------------------------------
    // dispatch: send everything the triggers queued
    // ---------------------------------------------------------------
    if (action === 'dispatch') {
      const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);
      const { data: queued } = await admin
        .from('sms_messages')
        .select('id, recipient, message, attempts')
        .eq('status', 'pending')
        .lt('attempts', 3)
        .order('created_at', { ascending: true })
        .limit(limit);

      let sent = 0;
      let failed = 0;
      for (const row of (queued ?? []) as QueuedMessage[]) {
        const to = normalise(row.recipient);
        if (!to) {
          await admin
            .from('sms_messages')
            .update({ status: 'failed', error: 'Invalid phone number', attempts: row.attempts + 1 })
            .eq('id', row.id);
          failed += 1;
          continue;
        }
        const result = await sendViaProvider(settings, to, row.message);
        await admin
          .from('sms_messages')
          .update({
            status: result.ok ? 'sent' : 'failed',
            provider: settings.provider ?? 'mnotify',
            provider_message_id: result.providerId ?? null,
            provider_response: result.response,
            error: result.error ?? null,
            attempts: row.attempts + 1,
            segments: segments(row.message),
            sent_at: result.ok ? new Date().toISOString() : null,
          })
          .eq('id', row.id);
        if (result.ok) sent += 1;
        else failed += 1;
      }
      return json({ dispatched: (queued ?? []).length, sent, failed });
    }

    // ---------------------------------------------------------------
    // send / test: one message, logged either way
    // ---------------------------------------------------------------
    const recipient = normalise(String(body.recipient ?? ''));
    const message = String(body.message ?? '').trim();
    if (!recipient) return json({ error: 'Enter a valid Ghana phone number' }, 400);
    if (!message) return json({ error: 'The message is empty' }, 400);
    if (message.length > 918) return json({ error: 'The message is too long (maximum 918 characters)' }, 400);

    if (action === 'test' && me.role !== 'admin') {
      return json({ error: 'Only administrators can send test messages' }, 403);
    }

    const ticketId = body.ticket_id ? String(body.ticket_id) : null;
    const debtorId = body.debtor_id ? String(body.debtor_id) : null;

    // The caller must be able to see the record the message is attached to.
    if (ticketId) {
      const { data: visible } = await userClient.from('tickets').select('id').eq('id', ticketId).maybeSingle();
      if (!visible) return json({ error: 'You do not have access to that ticket' }, 403);
    }
    if (debtorId) {
      const { data: visible } = await userClient.from('debtors').select('id').eq('id', debtorId).maybeSingle();
      if (!visible) return json({ error: 'You do not have access to that debtor record' }, 403);
    }

    const { data: inserted, error: insertError } = await admin
      .from('sms_messages')
      .insert({
        ticket_id: ticketId,
        debtor_id: debtorId,
        recipient,
        recipient_name: body.recipient_name ? String(body.recipient_name) : null,
        message,
        template_code: body.template_code ? String(body.template_code) : null,
        trigger_event: action === 'test' ? 'test' : 'manual',
        requested_by: user.id,
        segments: segments(message),
      })
      .select('id')
      .single();
    if (insertError) return json({ error: insertError.message }, 400);

    const result = await sendViaProvider(settings, recipient, message);
    await admin
      .from('sms_messages')
      .update({
        status: result.ok ? 'sent' : 'failed',
        provider: settings.provider ?? 'mnotify',
        provider_message_id: result.providerId ?? null,
        provider_response: result.response,
        error: result.error ?? null,
        attempts: 1,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq('id', inserted.id);

    if (!result.ok) return json({ error: result.error ?? 'The provider rejected the message', id: inserted.id }, 502);
    return json({ id: inserted.id, recipient, segments: segments(message) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

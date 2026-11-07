// Supabase Edge Function: ai-assist
//
// Optional. The resolution assistant works without this function: the app
// already shows how similar issues were resolved, straight from the
// database. Deploy this and add an AI key under Administration → AI to
// also get a written suggestion.
//
// Deploy:  supabase functions deploy ai-assist
// The AI provider and key are read from app_settings['ai'] (admin-only row),
// so no key is ever exposed to the browser.
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

interface AiSettings {
  enabled?: boolean;
  provider?: string;
  api_key?: string;
  model?: string;
  max_similar?: number;
}

interface SimilarTicket {
  ticket_number: string;
  issue_type: string;
  community: string | null;
  region: string | null;
  description: string;
  remarks: string | null;
  responsible_party: string | null;
  resolution_minutes: number | null;
}

function minutesText(m: number | null | undefined): string {
  if (m === null || m === undefined) return 'unknown';
  if (m < 60) return `${m} minutes`;
  if (m < 1440) return `${(m / 60).toFixed(1)} hours`;
  return `${(m / 1440).toFixed(1)} days`;
}

const SYSTEM_PROMPT = `You coach customer-service officers at a Ghanaian waste-management and debt-management company.
You are given one open ticket and how similar past tickets were actually resolved.
Reply with JSON only, matching exactly:
{"summary": string, "steps": [string], "draft_response": string, "watch_out": string}
- summary: one or two sentences on what this issue usually is and what resolves it.
- steps: 3 to 6 short imperative actions for the officer, grounded in the past tickets.
- draft_response: what to say to the customer on the phone, polite, under 60 words, Ghanaian English, no placeholders in square brackets.
- watch_out: one risk or common mistake, or "" when nothing stands out.
Base everything on the supplied history. Never invent payment amounts, account numbers or policies.`;

async function callAnthropic(settings: AiSettings, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (settings.api_key ?? '').trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: settings.model || 'claude-3-5-haiku-latest',
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `AI provider returned HTTP ${res.status}`);
  const block = Array.isArray(data?.content) ? data.content.find((c: { type: string }) => c.type === 'text') : null;
  return block?.text ?? '';
}

async function callOpenAi(settings: AiSettings, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(settings.api_key ?? '').trim()}`,
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `AI provider returned HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content ?? '';
}

function parseJson(text: string): Record<string, unknown> | null {
  const trimmed = (text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
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
    const { data: settingsRow } = await admin.from('app_settings').select('value').eq('key', 'ai').single();
    const settings = (settingsRow?.value ?? {}) as AiSettings;
    if (!settings.enabled || !(settings.api_key ?? '').trim()) {
      return json({ error: 'AI suggestions are turned off. Add a key under Administration → AI.' }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ticketId = body.ticket_id ? String(body.ticket_id) : null;
    if (!ticketId) return json({ error: 'ticket_id is required' }, 400);

    // RLS decides whether this user may see the ticket at all.
    const { data: ticket } = await userClient
      .from('tickets_view')
      .select('id, ticket_number, issue_type, description, community, region, status, due_date, priority, payment_amount, officer_name')
      .eq('id', ticketId)
      .maybeSingle();
    if (!ticket) return json({ error: 'You do not have access to that ticket' }, 403);

    const { data: similar } = await userClient.rpc('similar_tickets', {
      p_issue_type: ticket.issue_type,
      p_description: ticket.description,
      p_community: ticket.community,
      p_region: ticket.region,
      p_exclude: ticket.id,
      p_limit: Math.min(Math.max(Number(settings.max_similar ?? 8), 1), 15),
    });

    const history = ((similar ?? []) as SimilarTicket[])
      .map(
        (s, i) =>
          `${i + 1}. [${s.issue_type}${s.community ? `, ${s.community}` : ''}] Reported: ${String(s.description).slice(0, 300)}\n   Resolved in ${minutesText(s.resolution_minutes)} by ${s.responsible_party || 'the service team'}: ${String(s.remarks ?? '').slice(0, 300)}`,
      )
      .join('\n');

    const prompt = `CURRENT TICKET
Issue type: ${ticket.issue_type}
Location: ${ticket.community ?? 'unknown'}, ${ticket.region ?? 'unknown'}
Priority: ${ticket.priority}  Status: ${ticket.status}  Due: ${ticket.due_date}
Reported: ${ticket.description}

HOW SIMILAR TICKETS WERE RESOLVED
${history || '(no similar resolved tickets on record yet)'}`;

    const provider = (settings.provider ?? 'anthropic').toLowerCase();
    const raw = provider === 'openai' ? await callOpenAi(settings, prompt) : await callAnthropic(settings, prompt);
    const parsed = parseJson(raw);
    if (!parsed) return json({ error: 'The AI response could not be read', raw: raw.slice(0, 500) }, 502);

    return json({
      summary: String(parsed.summary ?? ''),
      steps: Array.isArray(parsed.steps) ? parsed.steps.map(String).slice(0, 8) : [],
      draft_response: String(parsed.draft_response ?? ''),
      watch_out: String(parsed.watch_out ?? ''),
      based_on: (similar ?? []).length,
      model: settings.model ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

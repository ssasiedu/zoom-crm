// Supabase Edge Function: invite-user
// Lets an active Admin invite (or directly create) a user, set their role and
// region, and optionally link them to a DM officer record.
//
// Deploy:  supabase functions deploy invite-user
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//          provided automatically by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['admin', 'supervisor', 'agent', 'dm_officer'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface InviteBody {
  email?: string;
  full_name?: string;
  phone?: string | null;
  role?: string;
  region?: string | null;
  officer_id?: string | null;
  mode?: 'invite' | 'password';
  password?: string;
  redirect_to?: string;
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
    const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', user.id).single();
    if (!me || me.role !== 'admin' || !me.is_active) {
      return json({ error: 'Only active administrators can add users' }, 403);
    }

    const body = (await req.json()) as InviteBody;
    const email = (body.email ?? '').trim().toLowerCase();
    const fullName = (body.full_name ?? '').trim();
    const role = body.role ?? 'agent';
    const mode = body.mode ?? 'invite';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
    if (fullName.length < 2) return json({ error: 'Full name is required' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);
    if (mode === 'password' && (body.password ?? '').length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    let userId: string | undefined;
    if (mode === 'password') {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone: body.phone ?? null },
      });
      if (error) return json({ error: error.message }, 400);
      userId = data.user?.id;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, phone: body.phone ?? null },
        redirectTo: body.redirect_to,
      });
      if (error) return json({ error: error.message }, 400);
      userId = data.user?.id;
    }
    if (!userId) return json({ error: 'User could not be created' }, 500);

    // The on_auth_user_created trigger creates the profile; set role/region now.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        { id: userId, email, full_name: fullName, phone: body.phone ?? null, role, region: body.region ?? null, is_active: true },
        { onConflict: 'id' },
      );
    if (profileError) return json({ error: profileError.message }, 400);

    if (body.officer_id) {
      await admin.from('officers').update({ profile_id: null }).eq('profile_id', userId);
      const { error: linkError } = await admin
        .from('officers')
        .update({ profile_id: userId })
        .eq('id', body.officer_id);
      if (linkError) return json({ error: `User created, but officer link failed: ${linkError.message}` }, 400);
    }

    return json({ user_id: userId, email, mode });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

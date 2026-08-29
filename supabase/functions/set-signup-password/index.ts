import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

const corsHeaders = {
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

// Keep these rules in lockstep with src/utils/passwordRules.ts.
const validPassword = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 8
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /[0-9]/.test(value)
  && /[^A-Za-z0-9]/.test(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });

  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!accessToken || !supabaseUrl || !serviceRoleKey) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: corsHeaders });

  const { password } = await request.json().catch(() => ({}));
  if (!validPassword(password)) {
    return Response.json({ error: 'Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.' }, { status: 400, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: corsHeaders });

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updateError) return Response.json({ error: 'Unable to set password.' }, { status: 500, headers: corsHeaders });
  return Response.json({ message: 'Password set.' }, { headers: corsHeaders });
});

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Admin-only password reset for ANOTHER user's account.
//
// A browser can never hold the service-role key, so the privileged write lives
// here. The caller is authorized by their bearer token (never cookies), we
// confirm they are an active administrator with the service role, then set the
// target's password through GoTrue's admin endpoint. That endpoint signs the
// target out of every session — exactly what a reset should do. Audit + the
// user notification are written by the admin_record_password_reset RPC, called
// with the admin's own token so auth.uid() attributes the action correctly.
//
// Every response, the OPTIONS preflight included, must carry CORS headers or the
// browser refuses to send the POST. Echoing the origin is safe: authorization
// is by bearer token, not cookies.
const corsHeaders = (request: Request) => ({
  'access-control-allow-origin': request.headers.get('origin') || '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'Origin',
});
const json = (request: Request, body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders(request) });

// Keep these rules in lockstep with src/utils/passwordRules.ts.
const validPassword = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 8
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /[0-9]/.test(value)
  && /[^A-Za-z0-9]/.test(value);

const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const NOT_ADMIN = 'Only an active administrator can change another user’s password.';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('[admin-set-user-password] SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured.');
    return json(request, { error: 'The account service is not configured. Please contact an administrator.' }, 500);
  }

  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json(request, { error: 'You must be signed in to do this.' }, 401);

  const { userId: targetUserId, password } = await request.json().catch(() => ({}));
  if (!isUuid(targetUserId)) return json(request, { error: 'A valid target user is required.' }, 400);
  if (!validPassword(password)) {
    return json(request, { error: 'Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.' }, 400);
  }

  const callerHeaders = { apikey: anonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
  const serviceHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };

  // 1. Who is calling? Resolve the user straight from their token.
  const meResp = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: callerHeaders }).catch(() => null);
  const me = meResp?.ok ? await meResp.json().catch(() => null) : null;
  if (!me?.id) return json(request, { error: 'Your session has expired. Please sign in again.' }, 401);

  // 2. Confirm the caller is an active admin, and read the target — both with the
  //    service role so RLS cannot hide either row.
  const [callerRows, targetRows] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/profiles?auth_user_id=eq.${me.id}&select=account_type,is_active`, { headers: serviceHeaders })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${supabaseUrl}/rest/v1/profiles?auth_user_id=eq.${targetUserId}&select=account_type,is_active,email`, { headers: serviceHeaders })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  const caller = Array.isArray(callerRows) ? callerRows[0] : null;
  const target = Array.isArray(targetRows) ? targetRows[0] : null;

  if (!caller || caller.account_type !== 'admin' || caller.is_active !== true) {
    return json(request, { error: NOT_ADMIN }, 403);
  }
  if (!target) return json(request, { error: 'That user could not be found.' }, 404);
  // An administrator's password is not resettable from here; it stays a
  // self-service action, so one admin can never seize another admin's account.
  if (target.account_type === 'admin') {
    return json(request, { error: 'Administrator passwords cannot be changed here. Use your own account settings.' }, 403);
  }

  // 3. Set the password (service role). GoTrue's admin path also revokes the
  //    target's existing sessions, which is what a reset should do.
  const updateResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetUserId}`, {
    method: 'PUT',
    headers: serviceHeaders,
    body: JSON.stringify({ password }),
  }).catch(() => null);
  if (!updateResp) {
    console.error('[admin-set-user-password] auth server unreachable');
    return json(request, { error: 'Unable to set the password. Please try again.' }, 502);
  }
  const updated = await updateResp.json().catch(() => null);
  if (!updateResp.ok || !updated?.id) {
    console.error('[admin-set-user-password] password update rejected', { status: updateResp.status, code: updated?.error_code ?? updated?.code });
    // A 4xx is the project's own auth password policy (e.g. a leaked/weak
    // password) rejecting what the client rules allowed. GoTrue writes that
    // text for end users, so pass it through; anything else stays generic.
    const message = updated?.msg || updated?.message || updated?.error_description;
    return updateResp.status < 500 && message
      ? json(request, { error: message }, 422)
      : json(request, { error: 'Unable to set the password. Please try again.' }, 500);
  }

  // 4. Audit + notify (best-effort). Called with the admin's token so the audit
  //    trail and notification are attributed to them. The password is already
  //    set; a logging hiccup must not fail the whole action.
  await fetch(`${supabaseUrl}/rest/v1/rpc/admin_record_password_reset`, {
    method: 'POST',
    headers: callerHeaders,
    body: JSON.stringify({ p_target: targetUserId }),
  }).catch((err) => console.error('[admin-set-user-password] audit/notify failed (non-fatal):', err));

  return json(request, { message: 'Password updated.', passwordApplied: true });
});

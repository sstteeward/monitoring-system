import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// The portal calls this cross-origin, so EVERY response — the OPTIONS preflight
// included — must carry access-control-allow-origin. Without it the preflight
// still answers 204, but the browser refuses to send the POST: the password is
// never written and the account keeps the random password GoTrue generated for
// the OTP user, which looks healthy until its owner first tries to sign in.
// Echoing the origin is safe here because the caller is authorized by the
// bearer token below, never by cookies.
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

const SESSION_LOST = 'Your sign-in session was lost. Please request a new code.';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    // A deployment problem, not the visitor's fault — do not report it as 401.
    console.error('[set-signup-password] SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
    return json(request, { error: 'The account service is not configured. Please contact an administrator.' }, 500);
  }

  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json(request, { error: SESSION_LOST }, 401);

  const { password } = await request.json().catch(() => ({}));
  if (!validPassword(password)) {
    return json(request, { error: 'Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.' }, 400);
  }

  const authHeaders = { apikey: anonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };

  // Apply the password AS the caller (PUT /auth/v1/user with their own token),
  // not through admin.updateUserById. GoTrue's admin path calls
  // UpdatePassword(tx, nil), which signs the user out of EVERY session — the
  // signup session in the browser included — so a brand-new account would be
  // thrown back to the login page mid-registration. The user path keeps the
  // current session (LogoutAllExceptMe), and because GoTrue resolves the user
  // from the token itself it can only ever change the caller's own password.
  const updateResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ password }),
  }).catch(() => null);
  if (!updateResponse) {
    console.error('[set-signup-password] auth server unreachable');
    return json(request, { error: 'Unable to set password. Please try again.' }, 502);
  }

  const updated = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    console.error('[set-signup-password] password update rejected', { status: updateResponse.status, code: updated?.error_code ?? updated?.code });
    if (updateResponse.status === 401 || updateResponse.status === 403) return json(request, { error: SESSION_LOST }, 401);
    // A 4xx here is the project's auth password policy (e.g. a leaked or weak
    // password) rejecting something the client rules accepted. GoTrue writes
    // that text for end users, so pass it through; anything else stays generic.
    const message = updated?.msg || updated?.message || updated?.error_description;
    return updateResponse.status < 500 && message
      ? json(request, { error: message }, 422)
      : json(request, { error: 'Unable to set password. Please try again.' }, 500);
  }

  // Re-read the user with the same token before the client is allowed to mark
  // registration complete: it must be the account that was just updated, and
  // the session the browser is about to keep using must still be alive.
  const rereadResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders }).catch(() => null);
  const reread = rereadResponse?.ok ? await rereadResponse.json().catch(() => null) : null;
  if (!updated?.id || reread?.id !== updated.id) {
    console.error('[set-signup-password] password write could not be confirmed', { rereadStatus: rereadResponse?.status ?? null });
    return json(request, { error: 'Your password could not be confirmed. Please try again.' }, 500);
  }

  return json(request, { message: 'Password set.', passwordApplied: true });
});

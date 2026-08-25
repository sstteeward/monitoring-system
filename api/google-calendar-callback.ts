import { createHmac, timingSafeEqual } from 'node:crypto';

type OAuthState = {
  companyId: string;
  userId: string;
  exp: number;
  popup?: boolean;
  returnOrigin?: string;
};

const appUrl = () => (process.env.APP_URL || 'https://asiancollegesilmonitoringsystem.vercel.app').replace(/\/$/, '');
const redirect = (response: any, path: string) => response.redirect(302, `${appUrl()}${path}`);
const complete = (response: any, status: 'connected' | 'error') => redirect(response, `/calendar-oauth-complete.html?status=${status}`);
const decodeState = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as OAuthState;

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const stateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const code = typeof request.query.code === 'string' ? request.query.code : '';
  const state = typeof request.query.state === 'string' ? request.query.state : '';

  const missing = [
    !googleClientId && 'GOOGLE_CLIENT_ID',
    !googleClientSecret && 'GOOGLE_CLIENT_SECRET',
    !stateSecret && 'GOOGLE_OAUTH_STATE_SECRET',
    !supabaseUrl && 'SUPABASE_URL',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length || !code || !state) {
    console.error('Google Calendar callback could not start.', { missing, hasCode: Boolean(code), hasState: Boolean(state) });
    return complete(response, 'error');
  }

  const [encodedState, signature] = state.split('.');
  const expectedSignature = createHmac('sha256', stateSecret).update(encodedState || '').digest('base64url');
  if (!encodedState || !signature || signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    console.error('Google OAuth state validation failed. Check that GOOGLE_OAUTH_STATE_SECRET matches the Edge Function secret.');
    return complete(response, 'error');
  }

  let claim: OAuthState;
  try { claim = decodeState(encodedState); } catch {
    console.error('Google OAuth state could not be decoded.');
    return complete(response, 'error');
  }
  if (claim.exp < Date.now()) {
    console.error('Google OAuth state expired before the callback completed.');
    return complete(response, 'error');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: `${appUrl()}/api/google-calendar-callback`,
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !token?.access_token || !token?.refresh_token) {
    console.error('Google token exchange failed.', { status: tokenResponse.status });
    return complete(response, 'error');
  }

  const rpcHeaders = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' };
  const connectionResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/service_upsert_google_calendar_connection`, {
    method: 'POST', headers: rpcHeaders,
    body: JSON.stringify({ p_company_id: claim.companyId, p_calendar_id: 'primary', p_calendar_name: 'Primary calendar', p_access_token: token.access_token, p_refresh_token: token.refresh_token, p_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), p_created_by: claim.userId }),
  });
  if (!connectionResponse.ok) {
    console.error('Google Calendar connection save failed.', { status: connectionResponse.status });
    return complete(response, 'error');
  }

  await fetch(`${supabaseUrl}/rest/v1/schedule_audit_logs`, { method: 'POST', headers: { ...rpcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: claim.companyId, actor_id: claim.userId, action: 'calendar_connected' }) });
  return claim.popup ? complete(response, 'connected') : redirect(response, '?calendar=connected');
}

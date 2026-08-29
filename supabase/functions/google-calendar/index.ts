/// <reference path="./edge-runtime.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

const configuredAppUrl = Deno.env.get('APP_URL');
const normalizedOrigin = (value: string | undefined) => {
  if (!value) return undefined;
  try { return new URL(value).origin; } catch { return undefined; }
};
const configuredAppOrigin = normalizedOrigin(configuredAppUrl);
const allowedOrigins = new Set<string>([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
if (configuredAppOrigin) allowedOrigins.add(configuredAppOrigin);

const isAllowedOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  return !origin || allowedOrigins.has(origin);
};

const corsHeaders = (request: Request) => ({
  'access-control-allow-origin': request.headers.get('origin') || configuredAppOrigin || '',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'vary': 'Origin',
});
const json = (request: Request, body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders(request) });
const base64url = (value: string) => btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const unbase64url = (value: string) => atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
const sign = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64url(String.fromCharCode(...new Uint8Array(signature)));
};

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurrence?: string[];
  status?: string;
};

const dateFromGoogleEvent = (value?: { dateTime?: string; date?: string }) => value?.date || value?.dateTime?.slice(0, 10) || null;
const timeFromGoogleEvent = (value?: { dateTime?: string; date?: string }) => value?.dateTime?.slice(11, 16) || '00:00';
const recurrenceFromGoogleEvent = (rules?: string[]) => {
  const rule = rules?.find((value) => value.startsWith('RRULE:')) || '';
  if (rule.includes('FREQ=DAILY')) return { recurrence: 'daily', working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };
  if (rule.includes('FREQ=WEEKLY')) {
    const byDay = rule.match(/BYDAY=([^;]+)/)?.[1]?.split(',') || [];
    const days: Record<string, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
    return { recurrence: 'weekly', working_days: byDay.map((day) => days[day]).filter(Boolean) };
  }
  return { recurrence: 'none', working_days: [] };
};

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) return json(request, { error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url); const supabaseUrl = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const clientId = Deno.env.get('GOOGLE_CLIENT_ID'); const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET'); const stateSecret = Deno.env.get('GOOGLE_OAUTH_STATE_SECRET'); const appUrl = Deno.env.get('APP_URL');
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret || !stateSecret || !appUrl) return json(request, { error: 'Google Calendar integration is not configured.' }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // Google returns the authorization result as a GET request. Using the plain
  // function URL keeps the redirect URI identical to the Google Console entry.
  const callback = request.method === 'GET';
  if (callback) {
    const state = url.searchParams.get('state') || ''; const [payload, signature] = state.split('.');
    if (!payload || !signature || signature !== await sign(payload, stateSecret)) return Response.redirect(`${appUrl}?calendar=error`, 302);
    let claim: { companyId: string; userId: string; exp: number; popup?: boolean; returnOrigin?: string }; try { claim = JSON.parse(unbase64url(payload)); } catch { return Response.redirect(`${appUrl}?calendar=error`, 302); }
    if (claim.exp < Date.now() || !url.searchParams.get('code')) return Response.redirect(`${appUrl}?calendar=error`, 302);
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar`;
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    if (!response.ok) return Response.redirect(`${appUrl}?calendar=error`, 302);
    const token = await response.json();
    if (!token.refresh_token) return Response.redirect(`${appUrl}?calendar=error`, 302);
    const { error } = await admin.rpc('service_upsert_google_calendar_connection', { p_company_id: claim.companyId, p_calendar_id: 'primary', p_calendar_name: 'Primary calendar', p_access_token: token.access_token, p_refresh_token: token.refresh_token, p_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), p_created_by: claim.userId });
    if (error) return Response.redirect(`${appUrl}?calendar=error`, 302);
    await admin.from('schedule_audit_logs').insert({ company_id: claim.companyId, actor_id: claim.userId, action: 'calendar_connected' });
    if (claim.popup && claim.returnOrigin && allowedOrigins.has(claim.returnOrigin)) {
      return Response.redirect(`${appUrl.replace(/\/$/, '')}/calendar-oauth-complete.html`, 302);
    }
    return Response.redirect(`${appUrl}?calendar=connected`, 302);
  }
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json(request, { error: 'Unauthorized' }, 401);

  // Validate the caller's JWT explicitly. A service-role client is used only
  // after this check for the private token store and server-side operations.
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return json(request, { error: 'Unauthorized' }, 401);
  const { data: profile } = await admin.from('profiles').select('company_id, account_type').eq('auth_user_id', user.id).maybeSingle(); if (!profile?.company_id || profile.account_type !== 'company') return json(request, { error: 'Unauthorized' }, 403);
  const body = await request.json().catch(() => ({})); const action = body.action as string;
  // Google must return to this Edge Function: it validates the signed state and
  // exchanges the authorization code using the same redirect URI.
  const redirectUri = `${supabaseUrl}/functions/v1/google-calendar`;
  if (action === 'connect') { const requestOrigin = request.headers.get('origin'); const popup = Boolean(body.popup); const returnOrigin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : appUrl; const payload = base64url(JSON.stringify({ companyId: profile.company_id, userId: user.id, exp: Date.now() + 10 * 60 * 1000, popup, returnOrigin })); const state = `${payload}.${await sign(payload, stateSecret)}`; const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'select_account consent', include_granted_scopes: 'true', scope: 'https://www.googleapis.com/auth/calendar.events', state }); return json(request, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` }); }
  if (action === 'disconnect') { await admin.rpc('service_delete_google_calendar_connection', { p_company_id: profile.company_id }); await admin.from('company_google_calendar_status').delete().eq('company_id', profile.company_id); await admin.from('schedules').update({ calendar_sync_status: 'not_connected' }).eq('company_id', profile.company_id); await admin.from('schedule_audit_logs').insert({ company_id: profile.company_id, actor_id: user.id, action: 'calendar_disconnected' }); return json(request, { message: 'Google Calendar disconnected.' }); }
  if (action === 'import') {
    const { data: storedConnection, error: connectionError } = await admin.rpc('service_get_google_calendar_connection', { p_company_id: profile.company_id });
    if (connectionError) return json(request, { error: 'Unable to read the calendar connection.' }, 500);
    if (!storedConnection) return json(request, { error: 'Connect Google Calendar before importing.' }, 400);

    let accessToken = storedConnection.access_token;
    if (storedConnection.expires_at && new Date(storedConnection.expires_at).getTime() < Date.now() + 60_000) {
      const refresh = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: storedConnection.refresh_token, grant_type: 'refresh_token' }) });
      if (!refresh.ok) return json(request, { error: 'Google Calendar authorization expired. Reconnect your calendar.' }, 401);
      const refreshed = await refresh.json(); accessToken = refreshed.access_token;
      await admin.rpc('service_upsert_google_calendar_connection', { p_company_id: profile.company_id, p_calendar_id: storedConnection.calendar_id, p_calendar_name: storedConnection.calendar_name, p_access_token: accessToken, p_refresh_token: storedConnection.refresh_token, p_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), p_created_by: storedConnection.created_by });
    }

    const eventsResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(storedConnection.calendar_id)}/events?singleEvents=true&orderBy=startTime&maxResults=250`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!eventsResponse.ok) return json(request, { error: 'Unable to read Google Calendar events. Reconnect your calendar and try again.' }, 502);
    const eventsPayload = await eventsResponse.json() as { items?: GoogleCalendarEvent[] };
    let imported = 0;
    for (const event of eventsPayload.items || []) {
      if (!event.id || event.status === 'cancelled') continue;
      const startDate = dateFromGoogleEvent(event.start);
      if (!startDate) continue;
      const { recurrence, working_days } = recurrenceFromGoogleEvent(event.recurrence);
      const endDate = dateFromGoogleEvent(event.end) || startDate;
      const schedule = {
        company_id: profile.company_id, student_id: null, name: event.summary?.trim() || 'Google Calendar event',
        start_date: startDate, end_date: endDate, start_time: timeFromGoogleEvent(event.start), end_time: timeFromGoogleEvent(event.end),
        break_duration_minutes: 0, location: event.location || null, notes: event.description || null, recurrence, working_days,
        status: startDate > new Date().toISOString().slice(0, 10) ? 'upcoming' : 'active', calendar_sync_status: 'synced',
        google_event_id: event.id, last_calendar_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const { data: existing, error: findError } = await admin.from('schedules').select('id').eq('company_id', profile.company_id).eq('google_event_id', event.id).maybeSingle();
      if (findError) return json(request, { error: 'Unable to match imported calendar events.' }, 500);
      const { error: saveError } = existing
        ? await admin.from('schedules').update(schedule).eq('id', existing.id)
        : await admin.from('schedules').insert(schedule);
      if (saveError) return json(request, { error: 'Unable to save an imported calendar event.' }, 500);
      imported += 1;
    }
    await admin.from('schedule_audit_logs').insert({ company_id: profile.company_id, actor_id: user.id, action: 'calendar_events_imported', details: { imported } });
    return json(request, { message: `${imported} Google Calendar event(s) imported.` });
  }
  if (action === 'sync') {
    const { data: storedConnection, error: connectionError } = await admin.rpc('service_get_google_calendar_connection', { p_company_id: profile.company_id });
    if (connectionError) return json(request, { error: 'Unable to read the calendar connection.' }, 500);
    if (!storedConnection) return json(request, { error: 'Connect Google Calendar before syncing.' }, 400);
    let accessToken = storedConnection.access_token;
    if (storedConnection.expires_at && new Date(storedConnection.expires_at).getTime() < Date.now() + 60_000) {
      const refresh = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: storedConnection.refresh_token, grant_type: 'refresh_token' }) });
      if (!refresh.ok) return json(request, { error: 'Google Calendar authorization expired. Reconnect your calendar.' }, 401);
      const refreshed = await refresh.json(); accessToken = refreshed.access_token;
      await admin.rpc('service_upsert_google_calendar_connection', { p_company_id: profile.company_id, p_calendar_id: storedConnection.calendar_id, p_calendar_name: storedConnection.calendar_name, p_access_token: accessToken, p_refresh_token: storedConnection.refresh_token, p_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), p_created_by: storedConnection.created_by });
    }
    let query = admin.from('schedules').select('id,name,start_date,end_date,start_time,end_time,location,supervisor_name,notes,recurrence,working_days,google_event_id,status').eq('company_id', profile.company_id).neq('status', 'cancelled');
    if (body.scheduleId) query = query.eq('id', body.scheduleId);
    const { data: schedules, error: schedulesError } = await query; if (schedulesError) return json(request, { error: 'Unable to load schedules for sync.' }, 500);
    let synced = 0; let failed = 0;
    for (const schedule of schedules || []) {
      try {
        const days: string[] = Array.isArray(schedule.working_days) ? schedule.working_days : [];
        const recurrence = schedule.recurrence === 'daily' ? ['RRULE:FREQ=DAILY'] : schedule.recurrence !== 'none' && days.length ? [`RRULE:FREQ=WEEKLY;BYDAY=${days.map((day) => day.slice(0, 2).toUpperCase()).join(',')}`] : undefined;
        const event = { summary: schedule.name, location: schedule.location || undefined, description: [schedule.supervisor_name ? `Supervisor: ${schedule.supervisor_name}` : '', schedule.notes || ''].filter(Boolean).join('\n'), start: { dateTime: `${schedule.start_date}T${schedule.start_time}`, timeZone: 'Asia/Manila' }, end: { dateTime: `${schedule.end_date || schedule.start_date}T${schedule.end_time}`, timeZone: 'Asia/Manila' }, recurrence };
        const endpoint = schedule.google_event_id ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(storedConnection.calendar_id)}/events/${encodeURIComponent(schedule.google_event_id)}` : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(storedConnection.calendar_id)}/events`;
        const response = await fetch(endpoint, { method: schedule.google_event_id ? 'PUT' : 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(event) });
        if (!response.ok) throw new Error(await response.text()); const saved = await response.json();
        await admin.from('schedules').update({ google_event_id: saved.id, calendar_sync_status: 'synced', last_calendar_sync_at: new Date().toISOString() }).eq('id', schedule.id); synced += 1;
      } catch { await admin.from('schedules').update({ calendar_sync_status: 'failed' }).eq('id', schedule.id); failed += 1; }
    }
    await admin.from('schedule_audit_logs').insert({ company_id: profile.company_id, actor_id: user.id, action: failed ? 'calendar_sync_failed' : 'calendar_sync_succeeded', details: { synced, failed } });
    return json(request, { message: failed ? `${synced} schedule(s) synced; ${failed} need retry.` : `${synced} schedule(s) synced.` });
  }
  return json(request, { error: 'Unsupported calendar action.' }, 400);
});

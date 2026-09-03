/// <reference path="./edge-runtime.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import {
  attendeeSummary,
  eventWindow,
  recurrenceFromGoogleEvent,
  scheduleStatusFor,
  todayInZone,
  type GoogleCalendarEvent,
} from './calendarMapping.ts';

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

// Reading the calendar's own name and timezone needs calendar.readonly; the
// account email comes from the OpenID id_token rather than an extra API call.
const OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

// How far around today a full sync reaches. Schedule Management shows past
// ("Completed") as well as upcoming work, so the window spans both directions.
const SYNC_WINDOW_PAST_DAYS = 120;
const SYNC_WINDOW_FUTURE_DAYS = 400;
const MAX_SYNC_PAGES = 40; // 40 x 250 = 10k events, a hard stop against runaway paging

const emailFromIdToken = (idToken?: string) => {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    return (JSON.parse(unbase64url(payload)) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
};

/** Errors carrying a message that is safe to show the company user. */
class CalendarError extends Error {
  status: number;
  needsReconnect: boolean;
  constructor(message: string, status = 502, needsReconnect = false) {
    super(message);
    this.status = status;
    this.needsReconnect = needsReconnect;
  }
}

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) return json(request, { error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const stateSecret = Deno.env.get('GOOGLE_OAUTH_STATE_SECRET');
  const appUrl = Deno.env.get('APP_URL');
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret || !stateSecret || !appUrl) return json(request, { error: 'Google Calendar integration is not configured.' }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const redirectUri = `${supabaseUrl}/functions/v1/google-calendar`;

  // Google returns the authorization result as a GET request. Using the plain
  // function URL keeps the redirect URI identical to the Google Console entry.
  if (request.method === 'GET') {
    const state = url.searchParams.get('state') || '';
    const [payload, signature] = state.split('.');
    if (!payload || !signature || signature !== await sign(payload, stateSecret)) return Response.redirect(`${appUrl}?calendar=error`, 302);
    let claim: { companyId: string; userId: string; exp: number; popup?: boolean; returnOrigin?: string };
    try { claim = JSON.parse(unbase64url(payload)); } catch { return Response.redirect(`${appUrl}?calendar=error`, 302); }
    if (claim.exp < Date.now() || !url.searchParams.get('code')) return Response.redirect(`${appUrl}?calendar=error`, 302);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    if (!response.ok) {
      console.error('google-calendar: code exchange failed', response.status, await response.text());
      return Response.redirect(`${appUrl}?calendar=error`, 302);
    }
    const token = await response.json();
    if (!token.refresh_token) {
      // Without a refresh token the connection could not survive the first hour,
      // let alone a logout. prompt=consent should always produce one.
      console.error('google-calendar: authorization returned no refresh token');
      return Response.redirect(`${appUrl}?calendar=error`, 302);
    }

    // Record which Google account and calendar this is, so the dashboard can
    // show a real connection rather than a bare "Connected" label.
    let calendarName = 'Primary calendar';
    let calendarTimeZone = 'Asia/Manila';
    try {
      const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', { headers: { authorization: `Bearer ${token.access_token}` } });
      if (calendarResponse.ok) {
        const calendar = await calendarResponse.json() as { summary?: string; timeZone?: string };
        calendarName = calendar.summary || calendarName;
        calendarTimeZone = calendar.timeZone || calendarTimeZone;
      }
    } catch (error) {
      console.error('google-calendar: unable to read calendar metadata', error);
    }

    const { error } = await admin.rpc('service_upsert_google_calendar_connection', {
      p_company_id: claim.companyId, p_calendar_id: 'primary', p_calendar_name: calendarName,
      p_access_token: token.access_token, p_refresh_token: token.refresh_token,
      p_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      p_created_by: claim.userId, p_google_account_email: emailFromIdToken(token.id_token),
      p_calendar_time_zone: calendarTimeZone,
    });
    if (error) {
      console.error('google-calendar: unable to store connection', error);
      return Response.redirect(`${appUrl}?calendar=error`, 302);
    }
    // A brand new authorization invalidates any previous incremental cursor.
    await admin.rpc('service_clear_calendar_sync_token', { p_company_id: claim.companyId });
    await admin.from('schedule_audit_logs').insert({ company_id: claim.companyId, actor_id: claim.userId, action: 'calendar_connected' });
    if (claim.popup && claim.returnOrigin && allowedOrigins.has(claim.returnOrigin)) {
      return Response.redirect(`${appUrl.replace(/\/$/, '')}/calendar-oauth-complete.html`, 302);
    }
    return Response.redirect(`${appUrl}?calendar=connected`, 302);
  }

  const authorization = request.headers.get('authorization') || '';
  const callerToken = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!callerToken) return json(request, { error: 'Unauthorized' }, 401);

  // Validate the caller's JWT explicitly. A service-role client is used only
  // after this check for the private token store and server-side operations.
  const { data: { user }, error: userError } = await admin.auth.getUser(callerToken);
  if (userError || !user) return json(request, { error: 'Unauthorized' }, 401);
  const { data: profile } = await admin.from('profiles').select('company_id, account_type').eq('auth_user_id', user.id).maybeSingle();
  if (!profile?.company_id || profile.account_type !== 'company') return json(request, { error: 'Unauthorized' }, 403);
  // The company id always comes from the caller's own profile. A request body
  // can never widen access to another company's calendar.
  const companyId: string = profile.company_id;

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'connect') {
    const requestOrigin = request.headers.get('origin');
    const popup = Boolean(body.popup);
    const returnOrigin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : appUrl;
    const payload = base64url(JSON.stringify({ companyId, userId: user.id, exp: Date.now() + 10 * 60 * 1000, popup, returnOrigin }));
    const state = `${payload}.${await sign(payload, stateSecret)}`;
    const query = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
      access_type: 'offline', prompt: 'select_account consent',
      include_granted_scopes: 'true', scope: OAUTH_SCOPES, state,
    });
    return json(request, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
  }

  if (action === 'disconnect') {
    // Revoke at Google so the grant does not linger on the user's account, then
    // drop the stored credentials. Local schedules are deliberately kept: only
    // the link to Google goes away.
    const { data: stored } = await admin.rpc('service_get_google_calendar_connection', { p_company_id: companyId });
    if (stored?.refresh_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: stored.refresh_token }),
        });
      } catch (error) {
        // A revoke failure must not block local disconnection.
        console.error('google-calendar: token revoke failed', error);
      }
    }
    await admin.rpc('service_delete_google_calendar_connection', { p_company_id: companyId });
    await admin.from('schedules').update({ calendar_sync_status: 'not_connected' }).eq('company_id', companyId);
    await admin.from('schedule_audit_logs').insert({ company_id: companyId, actor_id: user.id, action: 'calendar_disconnected' });
    return json(request, { message: 'Google Calendar disconnected.' });
  }

  if (action !== 'sync' && action !== 'import' && action !== 'push') {
    return json(request, { error: 'Unsupported calendar action.' }, 400);
  }

  // ── Everything below needs a live Google credential ────────────────────────
  const { data: storedConnection, error: connectionError } = await admin.rpc('service_get_google_calendar_connection', { p_company_id: companyId });
  if (connectionError) {
    console.error('google-calendar: unable to read connection', connectionError);
    return json(request, { error: 'Unable to read the calendar connection.' }, 500);
  }
  if (!storedConnection) return json(request, { error: 'Connect Google Calendar before syncing.' }, 400);

  const { data: statusRow } = await admin.from('company_google_calendar_status').select('calendar_time_zone').eq('company_id', companyId).maybeSingle();
  const calendarTimeZone: string = statusRow?.calendar_time_zone || 'Asia/Manila';
  const calendarId: string = storedConnection.calendar_id || 'primary';

  let accessToken: string = storedConnection.access_token;

  /** Exchanges the stored refresh token for a fresh access token. */
  const refreshAccessToken = async () => {
    const refresh = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: storedConnection.refresh_token, grant_type: 'refresh_token' }),
    });
    if (!refresh.ok) {
      const detail = await refresh.text();
      console.error('google-calendar: refresh failed', refresh.status, detail);
      // invalid_grant means the refresh token was revoked or expired: no amount
      // of retrying recovers it, so the company has to reconnect.
      await admin.rpc('service_mark_calendar_needs_reconnect', { p_company_id: companyId });
      throw new CalendarError('Google Calendar access has expired. Please reconnect your calendar.', 401, true);
    }
    const refreshed = await refresh.json();
    accessToken = refreshed.access_token;
    await admin.rpc('service_upsert_google_calendar_connection', {
      p_company_id: companyId, p_calendar_id: calendarId, p_calendar_name: storedConnection.calendar_name,
      p_access_token: accessToken,
      // Google omits refresh_token on a refresh; the SQL upsert keeps the stored one.
      p_refresh_token: refreshed.refresh_token ?? null,
      p_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      p_created_by: storedConnection.created_by, p_google_account_email: null, p_calendar_time_zone: null,
    });
  };

  /** Google Calendar request that refreshes once on a 401 and maps API errors. */
  const callGoogle = async (path: string, init: RequestInit = {}, retried = false): Promise<Response> => {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { ...(init.headers || {}), authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 && !retried) {
      await refreshAccessToken();
      return callGoogle(path, init, true);
    }
    return response;
  };

  const googleFailure = async (response: Response, context: string) => {
    const detail = await response.text();
    console.error(`google-calendar: ${context} failed`, response.status, detail);
    if (response.status === 401) return new CalendarError('Google Calendar access has expired. Please reconnect your calendar.', 401, true);
    if (response.status === 403) {
      return detail.includes('rateLimitExceeded') || detail.includes('userRateLimitExceeded')
        ? new CalendarError('Google Calendar is rate limiting this account. Try again in a few minutes.', 429)
        : new CalendarError('Google denied access to this calendar. Check the calendar permissions and reconnect.', 403);
    }
    if (response.status === 404) return new CalendarError('The connected Google calendar no longer exists. Reconnect to choose another calendar.', 404);
    if (response.status >= 500) return new CalendarError('Google Calendar is temporarily unavailable. Try again shortly.', 503);
    return new CalendarError('Unable to reach Google Calendar. Please try again.', 502);
  };

  try {
    // Refresh proactively when the stored token is at or near expiry.
    if (storedConnection.expires_at && new Date(storedConnection.expires_at).getTime() < Date.now() + 60_000) {
      await refreshAccessToken();
    }

    const stats = { retrieved: 0, created: 0, updated: 0, removed: 0, pushed: 0, pushFailed: 0 };

    // ── Pull: Google Calendar -> SIL schedules ───────────────────────────────
    if (action === 'sync' || action === 'import') {
      const today = todayInZone(calendarTimeZone);
      const storedSyncToken: string | null = action === 'import' ? null : (storedConnection.sync_token ?? null);

      const collectEvents = async (useSyncToken: string | null) => {
        const events: GoogleCalendarEvent[] = [];
        let pageToken: string | undefined;
        let nextSyncToken: string | null = null;
        for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
          const query = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '250' });
          if (useSyncToken) {
            // A syncToken carries its own window; Google rejects it alongside
            // timeMin/timeMax/orderBy.
            query.set('syncToken', useSyncToken);
          } else {
            const now = Date.now();
            query.set('timeMin', new Date(now - SYNC_WINDOW_PAST_DAYS * 86_400_000).toISOString());
            query.set('timeMax', new Date(now + SYNC_WINDOW_FUTURE_DAYS * 86_400_000).toISOString());
          }
          if (pageToken) query.set('pageToken', pageToken);

          const response = await callGoogle(`/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
          if (response.status === 410) {
            // The cursor aged out. Signal a full resync to the caller.
            return { events: null, nextSyncToken: null } as const;
          }
          if (!response.ok) throw await googleFailure(response, 'event list');
          const payload = await response.json() as { items?: GoogleCalendarEvent[]; nextPageToken?: string; nextSyncToken?: string };
          events.push(...(payload.items || []));
          nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
          if (!payload.nextPageToken) break;
          pageToken = payload.nextPageToken;
        }
        return { events, nextSyncToken } as const;
      };

      let collected = await collectEvents(storedSyncToken);
      if (collected.events === null) {
        await admin.rpc('service_clear_calendar_sync_token', { p_company_id: companyId });
        collected = await collectEvents(null);
      }
      const events = collected.events ?? [];
      stats.retrieved = events.length;

      const cancelled = events.filter((event) => event.id && event.status === 'cancelled').map((event) => event.id!);
      const live = events.filter((event) => event.id && event.status !== 'cancelled');

      // Which of these already exist locally? One query, so created vs updated
      // can be reported without a round trip per event.
      const liveIds = live.map((event) => event.id!);
      const knownIds = new Set<string>();
      for (let index = 0; index < liveIds.length; index += 200) {
        const slice = liveIds.slice(index, index + 200);
        const { data: existing } = await admin.from('schedules').select('google_event_id').eq('company_id', companyId).in('google_event_id', slice);
        for (const row of existing || []) if (row.google_event_id) knownIds.add(row.google_event_id);
      }

      const rows = live.flatMap((event) => {
        const window = eventWindow(event, calendarTimeZone);
        if (!window) return [];
        const { recurrence, working_days } = recurrenceFromGoogleEvent(event.recurrence);
        const notes = [event.description?.trim() || '', attendeeSummary(event)].filter(Boolean).join('\n\n') || null;
        return [{
          company_id: companyId,
          student_id: null,
          name: event.summary?.trim() || 'Google Calendar event',
          start_date: window.start_date,
          end_date: window.end_date,
          start_time: window.start_time,
          end_time: window.end_time,
          break_duration_minutes: 0,
          location: event.location || null,
          notes,
          recurrence,
          working_days,
          status: scheduleStatusFor(window.start_date, window.end_date, today),
          calendar_sync_status: 'synced',
          google_event_id: event.id!,
          source: 'google',
          last_calendar_sync_at: new Date().toISOString(),
          updated_at: event.updated || new Date().toISOString(),
        }];
      });

      if (rows.length) {
        // The unique index on (company_id, google_event_id) makes this idempotent:
        // syncing the same event twice updates in place instead of duplicating.
        const { error: upsertError } = await admin.from('schedules').upsert(rows, { onConflict: 'company_id,google_event_id' });
        if (upsertError) {
          console.error('google-calendar: unable to save imported events', upsertError);
          throw new CalendarError('Unable to save the imported calendar events.', 500);
        }
        stats.created = rows.filter((row) => !knownIds.has(row.google_event_id)).length;
        stats.updated = rows.length - stats.created;
      }

      // Events deleted in Google. Only ever touches rows this importer created.
      if (cancelled.length) {
        const { data: settings } = await admin.from('company_calendar_settings').select('cancel_behavior').eq('company_id', companyId).maybeSingle();
        const removeOutright = settings?.cancel_behavior === 'remove';
        for (let index = 0; index < cancelled.length; index += 200) {
          const slice = cancelled.slice(index, index + 200);
          const { data: affected } = removeOutright
            ? await admin.from('schedules').delete().eq('company_id', companyId).eq('source', 'google').in('google_event_id', slice).select('id')
            : await admin.from('schedules').update({ status: 'cancelled', calendar_sync_status: 'synced', last_calendar_sync_at: new Date().toISOString() }).eq('company_id', companyId).eq('source', 'google').in('google_event_id', slice).select('id');
          stats.removed += (affected || []).length;
        }
      }

      await admin.rpc('service_record_calendar_sync', {
        p_company_id: companyId,
        p_sync_token: collected.nextSyncToken,
        p_stats: stats,
      });
    }

    // ── Push: SIL schedules -> Google Calendar ───────────────────────────────
    if (action === 'sync' || action === 'push') {
      // Only schedules authored in the SIL system are pushed. Without this
      // filter every imported Google event was written straight back to Google.
      let query = admin.from('schedules')
        .select('id,name,start_date,end_date,start_time,end_time,location,supervisor_name,notes,recurrence,working_days,google_event_id,status')
        .eq('company_id', companyId)
        .eq('source', 'local')
        .neq('status', 'cancelled');
      if (body.scheduleId) query = query.eq('id', body.scheduleId);
      const { data: schedules, error: schedulesError } = await query;
      if (schedulesError) {
        console.error('google-calendar: unable to load schedules', schedulesError);
        throw new CalendarError('Unable to load schedules for sync.', 500);
      }

      for (const schedule of schedules || []) {
        try {
          const days: string[] = Array.isArray(schedule.working_days) ? schedule.working_days : [];
          const recurrence = schedule.recurrence === 'daily'
            ? ['RRULE:FREQ=DAILY']
            : schedule.recurrence !== 'none' && days.length
              ? [`RRULE:FREQ=WEEKLY;BYDAY=${days.map((day) => day.slice(0, 2).toUpperCase()).join(',')}`]
              : undefined;
          const event = {
            summary: schedule.name,
            location: schedule.location || undefined,
            description: [schedule.supervisor_name ? `Supervisor: ${schedule.supervisor_name}` : '', schedule.notes || ''].filter(Boolean).join('\n'),
            // Wall time plus an explicit zone: Google resolves the offset,
            // including across DST, instead of the app guessing it.
            start: { dateTime: `${schedule.start_date}T${schedule.start_time}`, timeZone: calendarTimeZone },
            end: { dateTime: `${schedule.end_date || schedule.start_date}T${schedule.end_time}`, timeZone: calendarTimeZone },
            recurrence,
          };
          const path = schedule.google_event_id
            ? `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(schedule.google_event_id)}`
            : `/calendars/${encodeURIComponent(calendarId)}/events`;
          const response = await callGoogle(path, {
            method: schedule.google_event_id ? 'PUT' : 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(event),
          });
          if (!response.ok) throw await googleFailure(response, 'event write');
          const saved = await response.json();
          await admin.from('schedules').update({ google_event_id: saved.id, calendar_sync_status: 'synced', last_calendar_sync_at: new Date().toISOString() }).eq('id', schedule.id);
          stats.pushed += 1;
        } catch (error) {
          if (error instanceof CalendarError && error.needsReconnect) throw error;
          console.error('google-calendar: schedule push failed', schedule.id, error);
          await admin.from('schedules').update({ calendar_sync_status: 'failed' }).eq('id', schedule.id);
          stats.pushFailed += 1;
        }
      }
    }

    await admin.from('schedule_audit_logs').insert({
      company_id: companyId, actor_id: user.id,
      action: stats.pushFailed ? 'calendar_sync_failed' : 'calendar_sync_succeeded',
      details: stats,
    });

    const changed = stats.created + stats.updated + stats.removed + stats.pushed;
    const message = changed === 0
      ? 'Calendar is already up to date.'
      : `Calendar synced successfully. ${changed} event${changed === 1 ? '' : 's'} updated.`;
    return json(request, { message, stats });
  } catch (error) {
    if (error instanceof CalendarError) {
      await admin.from('schedule_audit_logs').insert({
        company_id: companyId, actor_id: user.id, action: 'calendar_sync_failed',
        details: { error: error.message },
      });
      return json(request, { error: error.message, needsReconnect: error.needsReconnect }, error.status);
    }
    console.error('google-calendar: unexpected failure', error);
    return json(request, { error: 'Unable to sync Google Calendar. Please reconnect and try again.' }, 500);
  }
});

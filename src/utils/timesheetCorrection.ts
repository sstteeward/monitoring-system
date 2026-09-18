// Client-side helpers for the admin clock-record corrections.
//
// The server (supabase_admin_force_control.sql) is the authority on every rule:
// admin_validate_timesheet_range raises the messages below, and the RPCs run in
// the configured attendance time zone. This module mirrors that arithmetic so
// the AdminTimesheetModal can render a live preview and instant validation
// without a round trip — and, crucially, so a <input type="datetime-local">
// value the admin types is interpreted in the ATTENDANCE zone (Asia/Manila by
// default), not the browser's own zone. An admin in another country editing a
// student's Philippine day must save the wall-clock time they typed.
//
// Kept free of React and Supabase imports so the Node test runner can exercise
// it directly (see timesheetCorrection.test.ts).

const MS_PER_MINUTE = 60_000;

/**
 * The offset (in ms, positive east of UTC) that `timeZone` had at `date`.
 *
 * offset = (the wall-clock time in that zone, read as if it were UTC) − the
 * actual UTC instant. So `utc = wallClockAsUtc − offset`.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - date.getTime();
}

/**
 * A `<input type="datetime-local">` value ("2026-09-16T13:30"), read in the
 * given attendance zone, as an ISO instant. Returns '' for a blank input.
 */
export function zonedLocalToIso(localDateTime: string, timeZone: string): string {
  if (!localDateTime) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDateTime.trim());
  if (!m) return '';
  const [, y, mo, d, h, mi, s] = m;
  // Treat the wall-clock components as if they were UTC, then subtract the
  // zone's offset at that instant. A second pass handles the DST edge in zones
  // that observe it; Asia/Manila does not, so it is a no-op there.
  const wallAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  let offset = zoneOffsetMs(new Date(wallAsUtc), timeZone);
  let utc = wallAsUtc - offset;
  offset = zoneOffsetMs(new Date(utc), timeZone);
  utc = wallAsUtc - offset;
  return new Date(utc).toISOString();
}

/**
 * The reverse: an ISO instant as a `<input type="datetime-local">` value
 * ("YYYY-MM-DDTHH:mm") in the given attendance zone. Returns '' for null/blank.
 */
export function isoToZonedLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // en-CA hour can render '24' at midnight; normalise to '00'.
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

export interface SessionDraft {
  clockIn: string | null;
  clockOut: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

export interface DraftValidation {
  ok: boolean;
  /** The server's exact message, so the preview and the server agree. */
  error: string | null;
}

const ms = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Mirror of admin_validate_timesheet_range, minus the overlap check (which
 * needs the other rows and stays a server responsibility). The messages match
 * the SQL exactly so the client preview and the server never disagree.
 */
export function validateSessionDraft(draft: SessionDraft, now: number = Date.now()): DraftValidation {
  const cin = ms(draft.clockIn);
  const cout = ms(draft.clockOut);
  const bs = ms(draft.breakStart);
  const be = ms(draft.breakEnd);

  if (cin === null || cout === null) {
    return { ok: false, error: 'Clock-in and clock-out are both required.' };
  }
  if (cout <= cin) {
    return { ok: false, error: 'Clock-out must be later than clock-in.' };
  }
  if (cout > now) {
    return { ok: false, error: 'A clock record cannot end in the future.' };
  }
  if (cout - cin > 24 * 60 * MS_PER_MINUTE) {
    return { ok: false, error: 'A single session cannot exceed 24 hours.' };
  }
  const halfSet = (bs === null) !== (be === null);
  const outsideSession = bs !== null && be !== null && !(cin <= bs && bs < be && be <= cout);
  if (halfSet || outsideSession) {
    return { ok: false, error: 'The break must start and end inside the session.' };
  }
  return { ok: true, error: null };
}

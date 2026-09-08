// Daily rendered-hours limit — the shared reading of the rule.
//
// The server is authoritative: public.process_attendance_daily_limits() decides
// when the warning fires and when the email goes out, because the student may
// have the page closed. Everything here is the same arithmetic done in the
// browser so the dashboard and the attendance tables can render the state
// between server checks without waiting for a round trip.
//
// The rules below match supabase_attendance_daily_limit.sql line for line. If
// one changes, both change.
//
// Kept free of React and Supabase imports so the Node test runner can exercise
// it directly (see attendanceLimit.test.ts).

/** Used only until system_settings -> ojt_hours -> max_daily has been read. */
export const DEFAULT_DAILY_LIMIT_MINUTES = 480;
/**
 * How far ahead of the limit the student is told they are close to it.
 * Overridable through system_settings -> ojt_hours -> warning_lead_minutes.
 */
export const DEFAULT_WARNING_LEAD_MINUTES = 15;
export const DEFAULT_TIME_ZONE = 'Asia/Manila';

export type DailyLimitState = 'NORMAL' | 'APPROACHING' | 'LIMIT_REACHED' | 'OVER_LIMIT';

/** The fields of a timesheet row this module reads. */
export interface LimitSession {
  clock_in: string;
  clock_out?: string | null;
  break_start?: string | null;
  break_end?: string | null;
  /** 'rejected' records are invalid and never counted. */
  approval_status?: string | null;
}

export interface DailyLimitSummary {
  renderedMinutes: number;
  limitMinutes: number;
  warningMinutes: number;
  overLimitMinutes: number;
  remainingMinutes: number;
  state: DailyLimitState;
  /** True at or past the limit — the point at which the student must clock out. */
  reached: boolean;
}

const MS_PER_MINUTE = 60_000;

const time = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * The calendar day a moment belongs to, in the attendance timezone.
 *
 * Never the browser's own date: a student's day is a Philippine day, and a
 * device set to another zone must not shift a record onto the wrong date.
 */
export const attendanceDayKey = (value: Date | string | number, timeZone = DEFAULT_TIME_ZONE) => {
  const moment = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(moment.getTime())) return '';
  try {
    // en-CA renders as YYYY-MM-DD, which is the key format used everywhere else.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(moment);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
  }
};

/**
 * Minutes rendered in one session.
 *
 * Elapsed time less a COMPLETED break, which is the rule the admin attendance
 * report has always used. An open record runs to `now`, and a break that is
 * still running is subtracted from `now` too, so time does not accrue while the
 * student is away from work.
 */
export const sessionWorkedMinutes = (session: LimitSession, now: number = Date.now()) => {
  const clockIn = time(session.clock_in);
  if (clockIn === null) return 0;
  const clockOut = time(session.clock_out);
  const elapsed = (clockOut ?? now) - clockIn;

  const breakStart = time(session.break_start);
  const breakEnd = time(session.break_end);
  let breakMs = 0;
  if (breakStart !== null && breakEnd !== null && breakEnd > breakStart) breakMs = breakEnd - breakStart;
  else if (breakStart !== null && breakEnd === null && clockOut === null) breakMs = Math.max(0, now - breakStart);

  return Math.max(0, Math.floor((elapsed - breakMs) / MS_PER_MINUTE));
};

/**
 * Everything rendered on one attendance day, accumulated across every session.
 *
 * Never derived from the latest clock-in alone — a student who worked a morning
 * and an afternoon shift has rendered both. Records from other dates and
 * rejected records are excluded.
 */
export const dailyRenderedMinutes = (
  sessions: LimitSession[],
  day: string,
  now: number = Date.now(),
  timeZone = DEFAULT_TIME_ZONE,
) => sessions.reduce((total, session) => {
  if (session.approval_status === 'rejected') return total;
  if (attendanceDayKey(session.clock_in, timeZone) !== day) return total;
  return total + sessionWorkedMinutes(session, now);
}, 0);

export const limitState = (
  renderedMinutes: number,
  limitMinutes: number,
  warningMinutes: number,
): DailyLimitState => {
  if (renderedMinutes > limitMinutes) return 'OVER_LIMIT';
  if (renderedMinutes >= limitMinutes) return 'LIMIT_REACHED';
  if (renderedMinutes >= warningMinutes) return 'APPROACHING';
  return 'NORMAL';
};

export const summariseDailyLimit = (
  renderedMinutes: number,
  limitMinutes = DEFAULT_DAILY_LIMIT_MINUTES,
  warningMinutes = Math.max(0, limitMinutes - DEFAULT_WARNING_LEAD_MINUTES),
): DailyLimitSummary => {
  const state = limitState(renderedMinutes, limitMinutes, warningMinutes);
  return {
    renderedMinutes,
    limitMinutes,
    warningMinutes,
    overLimitMinutes: Math.max(0, renderedMinutes - limitMinutes),
    remainingMinutes: Math.max(0, limitMinutes - renderedMinutes),
    state,
    reached: state === 'LIMIT_REACHED' || state === 'OVER_LIMIT',
  };
};

/** `485` → `8h 5m`. `0` → `0m`, never an em dash: zero rendered is a real value. */
export const formatMinutes = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
};

/** `485` → `8 hours 5 minutes`, for prose rather than for a table cell. */
export const formatMinutesLong = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (rest || !hours) parts.push(`${rest} minute${rest === 1 ? '' : 's'}`);
  return parts.join(' ');
};

export interface DurationDisplay {
  label: string;
  /** The warning line under the duration, or null when there is nothing to say. */
  note: string | null;
  tone: 'normal' | 'approaching' | 'reached' | 'over';
}

/**
 * How a duration reads in an attendance table.
 *
 * A bare "8h 25m" says nothing about whether that is allowed, so the limit is
 * spelled out next to it once the day is at or past it.
 */
export const describeDuration = (
  renderedMinutes: number,
  limitMinutes = DEFAULT_DAILY_LIMIT_MINUTES,
  warningMinutes = Math.max(0, limitMinutes - DEFAULT_WARNING_LEAD_MINUTES),
): DurationDisplay => {
  const label = formatMinutes(renderedMinutes);
  switch (limitState(renderedMinutes, limitMinutes, warningMinutes)) {
    case 'OVER_LIMIT':
      return { label, note: `+${formatMinutes(renderedMinutes - limitMinutes)} over limit`, tone: 'over' };
    case 'LIMIT_REACHED':
      return { label, note: 'Limit reached', tone: 'reached' };
    case 'APPROACHING':
      return { label, note: `${formatMinutes(limitMinutes - renderedMinutes)} to limit`, tone: 'approaching' };
    default:
      return { label, note: null, tone: 'normal' };
  }
};

/** The filter options the coordinator and admin attendance tables offer. */
export type LimitFilter = 'all' | 'active' | 'clocked_out' | 'limit_reached' | 'over_limit';

export const LIMIT_FILTER_LABELS: Record<LimitFilter, string> = {
  all: 'All',
  active: 'Active',
  clocked_out: 'Clocked Out',
  limit_reached: 'Limit Reached',
  over_limit: 'Over Limit',
};

/** Does one day's row belong in the chosen filter? */
export const matchesLimitFilter = (
  filter: LimitFilter,
  row: { isActive: boolean; renderedMinutes: number },
  limitMinutes = DEFAULT_DAILY_LIMIT_MINUTES,
) => {
  switch (filter) {
    case 'active': return row.isActive;
    case 'clocked_out': return !row.isActive;
    case 'limit_reached': return row.renderedMinutes >= limitMinutes;
    case 'over_limit': return row.renderedMinutes > limitMinutes;
    default: return true;
  }
};

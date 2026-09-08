// Calendar maths for Schedule Management.
//
// Schedules are stored as recurring *patterns* (a date window, a time window
// and a recurrence rule) rather than as individual events, so a calendar grid
// has to expand them into per-day occurrences before anything can be drawn.
// Everything here is pure and free of React and Supabase imports so the Node
// test runner can exercise it directly (see scheduleCalendar.test.ts).

/** Sunday-first, matching Date.getDay() and the stored working_days labels. */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const MINUTES_PER_DAY = 24 * 60;

/** The subset of a Schedule the calendar needs. Schedule satisfies it structurally. */
export interface CalendarSchedule {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'custom_weekdays';
  working_days: string[];
  status: string;
}

export interface Occurrence<T extends CalendarSchedule = CalendarSchedule> {
  /** Stable per render: one schedule can appear once per date. */
  key: string;
  schedule: T;
  /** YYYY-MM-DD of this occurrence. */
  date: string;
  startMinutes: number;
  endMinutes: number;
  allDay: boolean;
}

export interface PositionedOccurrence<T extends CalendarSchedule = CalendarSchedule> extends Occurrence<T> {
  /** Column index inside its overlap cluster, and how many columns that cluster needs. */
  column: number;
  columns: number;
}

/* ── Plain date keys ─────────────────────────────────────────────────────────
   Dates are handled as YYYY-MM-DD strings and only converted to Date at local
   noon. Parsing "2026-09-07" with the Date constructor yields UTC midnight,
   which lands on the previous day for anyone west of Greenwich — the same class
   of bug the Google import mapping had to work around. */

export const dateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

export const parseKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
};

export const todayKey = (now: Date = new Date()) => dateKey(now);

export const addDays = (key: string, days: number) => {
  const value = parseKey(key);
  value.setDate(value.getDate() + days);
  return dateKey(value);
};

export const addMonths = (key: string, months: number) => {
  const value = parseKey(key);
  const day = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + months);
  // Clamp so "Jan 31 + 1 month" is the last day of February, not March 3rd.
  const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.min(day, lastDay));
  return dateKey(value);
};

export const addYears = (key: string, years: number) => {
  const value = parseKey(key);
  value.setFullYear(value.getFullYear() + years);
  return dateKey(value);
};

export const weekdayOf = (key: string) => parseKey(key).getDay();

export const startOfWeek = (key: string, weekStartsOn = 0) => {
  const offset = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
};

export const startOfMonth = (key: string) => `${key.slice(0, 7)}-01`;

export const daysInMonth = (key: string) => {
  const value = parseKey(key);
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
};

export const endOfMonth = (key: string) => `${key.slice(0, 7)}-${String(daysInMonth(key)).padStart(2, '0')}`;

export const rangeOfDays = (startKey: string, count: number) =>
  Array.from({ length: Math.max(0, count) }, (_, index) => addDays(startKey, index));

export const daysBetween = (fromKey: string, toKey: string) =>
  Math.round((parseKey(toKey).getTime() - parseKey(fromKey).getTime()) / 86_400_000);

/** Six-week grid a month view draws, starting on the configured first weekday. */
export const monthMatrix = (key: string, weekStartsOn = 0) =>
  rangeOfDays(startOfWeek(startOfMonth(key), weekStartsOn), 42);

/* ── Times ─────────────────────────────────────────────────────────────────── */

export const minutesFromTime = (time: string | null | undefined, fallback = 0) => {
  if (!time) return fallback;
  const [hour, minute] = time.split(':').map(Number);
  if (Number.isNaN(hour)) return fallback;
  return Math.min(MINUTES_PER_DAY, hour * 60 + (Number.isNaN(minute) ? 0 : minute));
};

export const timeFromMinutes = (minutes: number) => {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

/** "9 AM", "9:30 AM", or "09:30" when the viewer prefers a 24-hour clock. */
export const formatMinutes = (minutes: number, hour12 = true, alwaysMinutes = false) => {
  const total = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  if (!hour12) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return minute || alwaysMinutes ? `${display}:${String(minute).padStart(2, '0')} ${suffix}` : `${display} ${suffix}`;
};

/** Google-style compact range: "12 – 2pm", "9:30 – 10:30am". */
export const formatRange = (startMinutes: number, endMinutes: number, hour12 = true) => {
  if (!hour12) return `${formatMinutes(startMinutes, false)} – ${formatMinutes(endMinutes, false)}`;
  const suffix = (value: number) => (Math.floor(value / 60) >= 12 ? 'pm' : 'am');
  const bare = (value: number) => {
    const hour = Math.floor(value / 60) % 12 || 12;
    const minute = value % 60;
    return minute ? `${hour}:${String(minute).padStart(2, '0')}` : `${hour}`;
  };
  const start = suffix(startMinutes) === suffix(endMinutes) ? bare(startMinutes) : `${bare(startMinutes)}${suffix(startMinutes)}`;
  return `${start} – ${bare(endMinutes)}${suffix(endMinutes)}`;
};

/* ── Occurrence expansion ──────────────────────────────────────────────────── */

const occursOn = (schedule: CalendarSchedule, key: string) => {
  if (schedule.recurrence === 'daily') return true;
  if (schedule.recurrence === 'weekly' || schedule.recurrence === 'custom_weekdays') {
    const days = schedule.working_days?.length ? schedule.working_days : [DAY_NAMES[weekdayOf(schedule.start_date || key)]];
    return days.includes(DAY_NAMES[weekdayOf(key)]);
  }
  // 'none' spans its own date window: a multi-day Google event lands on each of
  // its days, which is how an imported conference or leave block should read.
  return true;
};

/**
 * The last day a schedule can produce an occurrence.
 *
 * A recurring schedule with no end date is open-ended — it keeps repeating —
 * so it is clamped to the requested range rather than to its start date. A
 * one-off with no end date is a single day.
 */
const lastDayOf = (schedule: CalendarSchedule, rangeEnd: string) => {
  if (schedule.end_date) return schedule.end_date;
  if (schedule.recurrence === 'none') return schedule.start_date || rangeEnd;
  return rangeEnd;
};

export const isAllDay = (schedule: CalendarSchedule) => {
  if (!schedule.start_time) return true;
  const start = minutesFromTime(schedule.start_time);
  const end = minutesFromTime(schedule.end_time, MINUTES_PER_DAY);
  return start === 0 && end >= 23 * 60 + 59;
};

/** Expands schedules into per-day occurrences inside [rangeStart, rangeEnd] inclusive. */
export const occurrencesInRange = <T extends CalendarSchedule>(
  schedules: T[],
  rangeStart: string,
  rangeEnd: string,
): Occurrence<T>[] => {
  const occurrences: Occurrence<T>[] = [];
  if (rangeEnd < rangeStart) return occurrences;
  for (const schedule of schedules) {
    if (!schedule.start_date) continue;
    const first = schedule.start_date > rangeStart ? schedule.start_date : rangeStart;
    const last = (() => {
      const scheduleEnd = lastDayOf(schedule, rangeEnd);
      return scheduleEnd < rangeEnd ? scheduleEnd : rangeEnd;
    })();
    if (last < first) continue;
    const allDay = isAllDay(schedule);
    const startMinutes = allDay ? 0 : minutesFromTime(schedule.start_time);
    const rawEnd = allDay ? MINUTES_PER_DAY : minutesFromTime(schedule.end_time, startMinutes + 60);
    // A stored end at or before the start (a bad import, or an event crossing
    // midnight) would otherwise render as a zero-height sliver.
    const endMinutes = Math.max(rawEnd, startMinutes + 15);
    for (let day = first; day <= last; day = addDays(day, 1)) {
      if (!occursOn(schedule, day)) continue;
      occurrences.push({ key: `${schedule.id}:${day}`, schedule, date: day, startMinutes, endMinutes, allDay });
    }
  }
  return occurrences;
};

export const groupByDate = <T extends CalendarSchedule>(occurrences: Occurrence<T>[]) => {
  const byDate = new Map<string, Occurrence<T>[]>();
  for (const occurrence of occurrences) {
    const bucket = byDate.get(occurrence.date);
    if (bucket) bucket.push(occurrence);
    else byDate.set(occurrence.date, [occurrence]);
  }
  for (const bucket of byDate.values()) {
    bucket.sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes || a.schedule.name.localeCompare(b.schedule.name));
  }
  return byDate;
};

/**
 * Side-by-side placement for overlapping events in a day column.
 *
 * Events are grouped into clusters of transitively overlapping events; inside a
 * cluster each event takes the first column that is free at its start time, and
 * every member reports the cluster width so the widths stay equal.
 */
export const layoutDay = <T extends CalendarSchedule>(occurrences: Occurrence<T>[]): PositionedOccurrence<T>[] => {
  const sorted = [...occurrences].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  const placed: PositionedOccurrence<T>[] = [];
  let cluster: PositionedOccurrence<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const member of cluster) member.columns = columnEnds.length || 1;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const occurrence of sorted) {
    if (cluster.length && occurrence.startMinutes >= clusterEnd) flush();
    let column = columnEnds.findIndex(end => end <= occurrence.startMinutes);
    if (column === -1) { column = columnEnds.length; columnEnds.push(occurrence.endMinutes); }
    else columnEnds[column] = occurrence.endMinutes;
    cluster.push({ ...occurrence, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, occurrence.endMinutes);
  }
  flush();
  return placed;
};

/* ── Titles ────────────────────────────────────────────────────────────────── */

export type CalendarView = 'day' | 'week' | 'month' | 'year' | 'schedule' | 'four_days';

export const VIEW_LABELS: Record<CalendarView, string> = {
  day: 'Day', week: 'Week', month: 'Month', year: 'Year', schedule: 'Schedule', four_days: '4 days',
};

export const VIEW_SHORTCUTS: Record<CalendarView, string> = {
  day: 'D', week: 'W', month: 'M', year: 'Y', schedule: 'A', four_days: 'X',
};

/** "Sep 7, 2026" · "September 2026" · "Aug – Sep 2026" · "2026". */
export const rangeTitle = (view: CalendarView, days: string[], anchor: string) => {
  if (view === 'year') return anchor.slice(0, 4);
  if (view === 'month') return `${MONTH_NAMES[parseKey(anchor).getMonth()]} ${anchor.slice(0, 4)}`;
  if (view === 'day') {
    const value = parseKey(anchor);
    return `${MONTH_SHORT[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}`;
  }
  const first = parseKey(days[0] ?? anchor);
  const last = parseKey(days[days.length - 1] ?? anchor);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${MONTH_SHORT[first.getMonth()]} ${first.getFullYear()} – ${MONTH_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${MONTH_SHORT[first.getMonth()]} – ${MONTH_SHORT[last.getMonth()]} ${first.getFullYear()}`;
  }
  return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
};

/** How far ahead the agenda looks from its anchor. */
export const SCHEDULE_VIEW_DAYS = 120;

/** The day columns/cells a grid view renders. Year and Schedule draw their own. */
export const visibleDays = (view: CalendarView, anchor: string, weekStartsOn = 0): string[] => {
  if (view === 'day') return [anchor];
  if (view === 'four_days') return rangeOfDays(anchor, 4);
  if (view === 'week') return rangeOfDays(startOfWeek(anchor, weekStartsOn), 7);
  if (view === 'month') return monthMatrix(anchor, weekStartsOn);
  if (view === 'schedule') return rangeOfDays(anchor, SCHEDULE_VIEW_DAYS);
  return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
};

/** Inclusive [start, end] the view needs occurrences for. */
export const viewRange = (view: CalendarView, anchor: string, weekStartsOn = 0): [string, string] => {
  if (view === 'year') return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
  if (view === 'schedule') return [anchor, addDays(anchor, SCHEDULE_VIEW_DAYS - 1)];
  const days = visibleDays(view, anchor, weekStartsOn);
  return [days[0], days[days.length - 1]];
};

export const shiftAnchor = (view: CalendarView, anchor: string, direction: 1 | -1) => {
  switch (view) {
    case 'day': return addDays(anchor, direction);
    case 'four_days': return addDays(anchor, 4 * direction);
    case 'week': return addDays(anchor, 7 * direction);
    case 'month': return addMonths(anchor, direction);
    case 'year': return addYears(anchor, direction);
    case 'schedule': return addMonths(anchor, direction);
  }
};

/**
 * Deterministic colour slot so a schedule keeps the same colour across views.
 *
 * FNV-1a with a final avalanche rather than the usual `hash * 31 + c`: the
 * simple version carries too little of each character into the low bits, so
 * ids that differ by a constant ("a1", "b2", "c3") all landed on one colour.
 */
export const colorIndex = (id: string, palette = 8) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return (hash >>> 0) % palette;
};

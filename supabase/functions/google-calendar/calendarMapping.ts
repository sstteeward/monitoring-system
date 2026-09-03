// Pure Google Calendar -> SIL schedule mapping.
//
// Kept free of Deno globals so the same code the Edge Function runs can be
// exercised by the Node test runner (see calendarMapping.test.ts).

export type GoogleDate = { dateTime?: string; date?: string; timeZone?: string };

export type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDate;
  end?: GoogleDate;
  recurrence?: string[];
  status?: string;
  updated?: string;
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
};

export type ScheduleWindow = {
  allDay: boolean;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
};

/**
 * Wall-clock date and time of an instant, as seen in `timeZone`.
 *
 * schedules.start_date/start_time are date and time WITHOUT time zone: they
 * hold local wall time. Google returns RFC3339 with an offset
 * ("2026-09-05T09:00:00+08:00"), so the conversion has to go through a real
 * timezone database rather than string slicing or hour arithmetic - that is
 * what shifted events onto the wrong day.
 */
export const zonedWallClock = (isoDateTime: string, timeZone: string) => {
  const instant = new Date(isoDateTime);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant).reduce<Record<string, string>>((all, part) => {
    all[part.type] = part.value;
    return all;
  }, {});
  if (!parts.year || !parts.month || !parts.day) return null;
  // Some engines render midnight as hour "24" under hour12:false.
  const hour = parts.hour === '24' ? '00' : (parts.hour ?? '00');
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute ?? '00'}` };
};

export const shiftPlainDate = (isoDate: string, days: number) => {
  // Plain calendar arithmetic in UTC: no DST is involved in a bare date.
  const value = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return isoDate;
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const todayInZone = (timeZone: string, now: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((all, part) => { all[part.type] = part.value; return all; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/**
 * Google event window -> local schedule dates/times.
 *
 * All-day events use `date`, and Google's end date is EXCLUSIVE: a single-day
 * event on the 5th arrives as start 2026-09-05 / end 2026-09-06. Storing that
 * verbatim stretched every all-day event across an extra day, so the end is
 * pulled back by one.
 */
export const eventWindow = (event: GoogleCalendarEvent, calendarTimeZone: string): ScheduleWindow | null => {
  const allDay = Boolean(event.start?.date);
  if (allDay) {
    const startDate = event.start?.date ?? null;
    if (!startDate) return null;
    const exclusiveEnd = event.end?.date;
    const endDate = exclusiveEnd ? shiftPlainDate(exclusiveEnd, -1) : startDate;
    return {
      allDay: true,
      start_date: startDate,
      end_date: endDate < startDate ? startDate : endDate,
      start_time: '00:00',
      end_time: '23:59',
    };
  }

  const zone = event.start?.timeZone || calendarTimeZone;
  const start = event.start?.dateTime ? zonedWallClock(event.start.dateTime, zone) : null;
  if (!start) return null;
  const endZone = event.end?.timeZone || zone;
  const end = event.end?.dateTime ? zonedWallClock(event.end.dateTime, endZone) : null;
  return {
    allDay: false,
    start_date: start.date,
    end_date: end && end.date >= start.date ? end.date : start.date,
    start_time: start.time,
    end_time: end ? end.time : start.time,
  };
};

export const recurrenceFromGoogleEvent = (rules?: string[]) => {
  const rule = rules?.find((value) => value.startsWith('RRULE:')) || '';
  if (rule.includes('FREQ=DAILY')) return { recurrence: 'daily', working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };
  if (rule.includes('FREQ=WEEKLY')) {
    const byDay = rule.match(/BYDAY=([^;]+)/)?.[1]?.split(',') || [];
    const days: Record<string, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
    return { recurrence: 'weekly', working_days: byDay.map((day) => days[day]).filter(Boolean) };
  }
  return { recurrence: 'none', working_days: [] };
};

export const scheduleStatusFor = (startDate: string, endDate: string, today: string) => {
  if (endDate < today) return 'completed';
  if (startDate > today) return 'upcoming';
  return 'active';
};

export const attendeeSummary = (event: GoogleCalendarEvent) => {
  const names = (event.attendees || [])
    .map((attendee) => attendee.displayName || attendee.email)
    .filter((value): value is string => Boolean(value));
  return names.length ? `Attendees: ${names.join(', ')}` : '';
};

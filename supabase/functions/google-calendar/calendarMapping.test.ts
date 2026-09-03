import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attendeeSummary,
  eventWindow,
  recurrenceFromGoogleEvent,
  scheduleStatusFor,
  shiftPlainDate,
  todayInZone,
  zonedWallClock,
} from './calendarMapping.ts';

const MANILA = 'Asia/Manila';

test('a timed Manila event keeps its own wall-clock date and time', () => {
  // The exact case from the bug report: 9:00 AM on 5 September must stay
  // 9:00 AM on 5 September, not slip to the 4th or the 6th.
  const window = eventWindow(
    { start: { dateTime: '2026-09-05T09:00:00+08:00', timeZone: MANILA }, end: { dateTime: '2026-09-05T17:00:00+08:00', timeZone: MANILA } },
    MANILA,
  );
  assert.deepEqual(window, { allDay: false, start_date: '2026-09-05', end_date: '2026-09-05', start_time: '09:00', end_time: '17:00' });
});

test('an event delivered in UTC is converted to the calendar timezone, not sliced', () => {
  // 2026-09-05T01:00:00Z is 09:00 on the 5th in Manila. String slicing would
  // have produced 01:00, and slicing a late-evening UTC value would have moved
  // the event to the previous day.
  const window = eventWindow({ start: { dateTime: '2026-09-05T01:00:00Z' }, end: { dateTime: '2026-09-05T09:00:00Z' } }, MANILA);
  assert.equal(window?.start_date, '2026-09-05');
  assert.equal(window?.start_time, '09:00');
  assert.equal(window?.end_time, '17:00');
});

test('a late-evening UTC instant lands on the next Manila day', () => {
  // 2026-09-04T17:00:00Z is 01:00 on 2026-09-05 in Manila (UTC+8).
  const window = eventWindow({ start: { dateTime: '2026-09-04T17:00:00Z' }, end: { dateTime: '2026-09-04T18:00:00Z' } }, MANILA);
  assert.equal(window?.start_date, '2026-09-05');
  assert.equal(window?.start_time, '01:00');
});

test("a single-day all-day event does not stretch across Google's exclusive end date", () => {
  // Google sends 5 Sep - 6 Sep for a one-day all-day event on the 5th.
  const window = eventWindow({ start: { date: '2026-09-05' }, end: { date: '2026-09-06' } }, MANILA);
  assert.deepEqual(window, { allDay: true, start_date: '2026-09-05', end_date: '2026-09-05', start_time: '00:00', end_time: '23:59' });
});

test('a multi-day all-day event ends on its last real day', () => {
  const window = eventWindow({ start: { date: '2026-09-05' }, end: { date: '2026-09-08' } }, MANILA);
  assert.equal(window?.start_date, '2026-09-05');
  assert.equal(window?.end_date, '2026-09-07');
});

test('an all-day event with no end date falls back to its start date', () => {
  const window = eventWindow({ start: { date: '2026-09-05' } }, MANILA);
  assert.equal(window?.end_date, '2026-09-05');
});

test('a DST-observing timezone uses the offset in force on the event date', () => {
  // New York is UTC-4 in September (EDT) and UTC-5 in January (EST). A fixed
  // hour offset would get one of these wrong.
  const summer = eventWindow({ start: { dateTime: '2026-09-05T13:00:00Z' }, end: { dateTime: '2026-09-05T14:00:00Z' } }, 'America/New_York');
  assert.equal(summer?.start_time, '09:00');
  const winter = eventWindow({ start: { dateTime: '2026-01-05T14:00:00Z' }, end: { dateTime: '2026-01-05T15:00:00Z' } }, 'America/New_York');
  assert.equal(winter?.start_time, '09:00');
});

test("an event's own timezone overrides the calendar default", () => {
  const window = eventWindow(
    { start: { dateTime: '2026-09-05T00:00:00Z', timeZone: 'Asia/Tokyo' }, end: { dateTime: '2026-09-05T01:00:00Z', timeZone: 'Asia/Tokyo' } },
    MANILA,
  );
  // Tokyo is UTC+9, Manila UTC+8: 09:00 rather than 08:00.
  assert.equal(window?.start_time, '09:00');
});

test('midnight is rendered as 00:00 rather than 24:00', () => {
  const parts = zonedWallClock('2026-09-04T16:00:00Z', MANILA); // midnight in Manila
  assert.equal(parts?.time, '00:00');
  assert.equal(parts?.date, '2026-09-05');
});

test('an event spanning midnight keeps both dates', () => {
  const window = eventWindow({ start: { dateTime: '2026-09-05T22:00:00+08:00' }, end: { dateTime: '2026-09-06T02:00:00+08:00' } }, MANILA);
  assert.equal(window?.start_date, '2026-09-05');
  assert.equal(window?.end_date, '2026-09-06');
  assert.equal(window?.end_time, '02:00');
});

test('an unparseable or missing start is rejected instead of stored wrong', () => {
  assert.equal(eventWindow({ start: { dateTime: 'not-a-date' } }, MANILA), null);
  assert.equal(eventWindow({}, MANILA), null);
});

test('plain date arithmetic crosses month and year boundaries', () => {
  assert.equal(shiftPlainDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftPlainDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftPlainDate('2028-03-01', -1), '2028-02-29'); // leap year
});

test('todayInZone reports the local day, not the UTC day', () => {
  // 15:00 UTC on 4 Sep is already 23:00 on 4 Sep in Manila, and 5 Sep once
  // past 16:00 UTC.
  assert.equal(todayInZone(MANILA, new Date('2026-09-04T15:00:00Z')), '2026-09-04');
  assert.equal(todayInZone(MANILA, new Date('2026-09-04T16:30:00Z')), '2026-09-05');
});

test('schedule status is derived from the whole event window', () => {
  assert.equal(scheduleStatusFor('2026-09-01', '2026-09-02', '2026-09-05'), 'completed');
  assert.equal(scheduleStatusFor('2026-09-10', '2026-09-11', '2026-09-05'), 'upcoming');
  assert.equal(scheduleStatusFor('2026-09-01', '2026-09-10', '2026-09-05'), 'active');
  // A multi-day event that started in the past but has not ended is active.
  assert.equal(scheduleStatusFor('2026-09-05', '2026-09-05', '2026-09-05'), 'active');
});

test('recurrence rules map to the local weekday vocabulary', () => {
  assert.deepEqual(recurrenceFromGoogleEvent(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR']), {
    recurrence: 'weekly', working_days: ['Monday', 'Wednesday', 'Friday'],
  });
  assert.equal(recurrenceFromGoogleEvent(['RRULE:FREQ=DAILY']).recurrence, 'daily');
  assert.equal(recurrenceFromGoogleEvent(undefined).recurrence, 'none');
});

test('attendees are summarised by name, falling back to the email', () => {
  assert.equal(
    attendeeSummary({ attendees: [{ displayName: 'Ana Cruz' }, { email: 'lee@example.com' }] }),
    'Attendees: Ana Cruz, lee@example.com',
  );
  assert.equal(attendeeSummary({}), '');
});

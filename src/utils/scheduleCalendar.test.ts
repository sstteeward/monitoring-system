import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  addMonths,
  colorIndex,
  formatMinutes,
  formatRange,
  isAllDay,
  layoutDay,
  minutesFromTime,
  monthMatrix,
  occurrencesInRange,
  rangeTitle,
  shiftAnchor,
  startOfWeek,
  timeFromMinutes,
  viewRange,
  visibleDays,
  type CalendarSchedule,
} from './scheduleCalendar.ts';

const schedule = (overrides: Partial<CalendarSchedule> & { id: string }): CalendarSchedule => ({
  name: 'Shift',
  start_date: '2026-09-07',
  end_date: null,
  start_time: '09:00',
  end_time: '17:00',
  recurrence: 'none',
  working_days: [],
  status: 'active',
  ...overrides,
});

test('date arithmetic stays on plain calendar days', () => {
  assert.equal(addDays('2026-09-07', 1), '2026-09-08');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01', 'not a leap year');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29', 'leap year');
  // End-of-month clamping: January 31 + 1 month must not overflow into March.
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});

test('weeks start on the configured weekday', () => {
  assert.equal(startOfWeek('2026-09-07', 0), '2026-09-06', 'Sunday-first');
  assert.equal(startOfWeek('2026-09-07', 1), '2026-09-07', 'Monday-first');
});

test('a month grid is six full weeks beginning before the first', () => {
  const cells = monthMatrix('2026-09-15', 0);
  assert.equal(cells.length, 42);
  assert.equal(cells[0], '2026-08-30');
  assert.equal(cells[41], '2026-10-10');
});

test('times convert both ways and format for both clocks', () => {
  assert.equal(minutesFromTime('09:30'), 570);
  assert.equal(minutesFromTime(null, 480), 480);
  assert.equal(timeFromMinutes(570), '09:30');
  assert.equal(timeFromMinutes(-30), '00:00');
  assert.equal(formatMinutes(540), '9 AM');
  assert.equal(formatMinutes(570), '9:30 AM');
  assert.equal(formatMinutes(720), '12 PM');
  assert.equal(formatMinutes(0), '12 AM');
  assert.equal(formatMinutes(570, false), '09:30');
  assert.equal(formatRange(720, 840), '12 – 2pm');
  assert.equal(formatRange(570, 630), '9:30 – 10:30am');
  assert.equal(formatRange(660, 780), '11am – 1pm');
});

test('a one-off schedule produces a single occurrence', () => {
  const occurrences = occurrencesInRange([schedule({ id: 'a' })], '2026-09-06', '2026-09-12');
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].date, '2026-09-07');
  assert.equal(occurrences[0].startMinutes, 540);
  assert.equal(occurrences[0].endMinutes, 1020);
  assert.equal(occurrences[0].allDay, false);
});

test('weekday recurrence lands only on its working days', () => {
  const weekdays = schedule({
    id: 'b',
    recurrence: 'custom_weekdays',
    working_days: ['Monday', 'Wednesday', 'Friday'],
    start_date: '2026-09-01',
    end_date: '2026-09-30',
  });
  const dates = occurrencesInRange([weekdays], '2026-09-06', '2026-09-12').map(item => item.date);
  assert.deepEqual(dates, ['2026-09-07', '2026-09-09', '2026-09-11']);
});

test('a recurring schedule with no end date keeps repeating', () => {
  const openEnded = schedule({ id: 'c', recurrence: 'daily', start_date: '2026-01-01', end_date: null });
  const dates = occurrencesInRange([openEnded], '2026-09-06', '2026-09-08').map(item => item.date);
  assert.deepEqual(dates, ['2026-09-06', '2026-09-07', '2026-09-08']);
});

test('a one-off with no end date does not repeat', () => {
  const once = schedule({ id: 'd', recurrence: 'none', start_date: '2026-09-07', end_date: null });
  assert.equal(occurrencesInRange([once], '2026-09-01', '2026-09-30').length, 1);
});

test('a multi-day one-off covers every day it spans', () => {
  const span = schedule({ id: 'e', recurrence: 'none', start_date: '2026-09-07', end_date: '2026-09-09' });
  const dates = occurrencesInRange([span], '2026-09-01', '2026-09-30').map(item => item.date);
  assert.deepEqual(dates, ['2026-09-07', '2026-09-08', '2026-09-09']);
});

test('occurrences are clipped to the requested range', () => {
  const long = schedule({ id: 'f', recurrence: 'daily', start_date: '2026-08-01', end_date: '2026-12-31' });
  const dates = occurrencesInRange([long], '2026-09-07', '2026-09-08').map(item => item.date);
  assert.deepEqual(dates, ['2026-09-07', '2026-09-08']);
});

test('an imported all-day event is treated as all-day', () => {
  const allDay = schedule({ id: 'g', start_time: '00:00', end_time: '23:59' });
  assert.equal(isAllDay(allDay), true);
  assert.equal(isAllDay(schedule({ id: 'h' })), false);
  assert.equal(isAllDay(schedule({ id: 'i', start_time: null })), true);
});

test('a non-positive stored duration still renders with height', () => {
  const broken = schedule({ id: 'j', start_time: '09:00', end_time: '09:00' });
  const [occurrence] = occurrencesInRange([broken], '2026-09-07', '2026-09-07');
  assert.ok(occurrence.endMinutes > occurrence.startMinutes);
});

test('overlapping events share the column width, sequential ones do not', () => {
  const day = '2026-09-07';
  const make = (id: string, start: number, end: number) => ({
    key: `${id}:${day}`,
    schedule: schedule({ id }),
    date: day,
    startMinutes: start,
    endMinutes: end,
    allDay: false,
  });
  const placed = layoutDay([make('a', 540, 660), make('b', 600, 720), make('c', 780, 840)]);
  const byId = new Map(placed.map(item => [item.schedule.id, item]));
  assert.equal(byId.get('a')!.columns, 2);
  assert.equal(byId.get('b')!.columns, 2);
  assert.notEqual(byId.get('a')!.column, byId.get('b')!.column);
  assert.equal(byId.get('c')!.columns, 1, 'a later, non-overlapping event gets the full width');
  assert.equal(byId.get('c')!.column, 0);
});

test('a freed column is reused instead of widening the cluster', () => {
  const day = '2026-09-07';
  const make = (id: string, start: number, end: number) => ({
    key: `${id}:${day}`, schedule: schedule({ id }), date: day, startMinutes: start, endMinutes: end, allDay: false,
  });
  // a: 9–10, b: 9:30–11, c: 10–10:30 — c can sit back in a's column.
  const placed = layoutDay([make('a', 540, 600), make('b', 570, 660), make('c', 600, 630)]);
  const byId = new Map(placed.map(item => [item.schedule.id, item]));
  assert.equal(byId.get('c')!.column, 0);
  assert.equal(byId.get('a')!.columns, 2);
});

test('the header title matches the view', () => {
  assert.equal(rangeTitle('day', ['2026-09-07'], '2026-09-07'), 'Sep 7, 2026');
  assert.equal(rangeTitle('month', [], '2026-09-15'), 'September 2026');
  assert.equal(rangeTitle('year', [], '2026-09-15'), '2026');
  assert.equal(rangeTitle('week', visibleDays('week', '2026-09-01', 0), '2026-09-01'), 'Aug – Sep 2026');
  assert.equal(rangeTitle('week', visibleDays('week', '2026-09-10', 0), '2026-09-10'), 'September 2026');
  assert.equal(rangeTitle('week', visibleDays('week', '2026-12-30', 0), '2026-12-30'), 'Dec 2026 – Jan 2027');
});

test('previous and next step by the size of the view', () => {
  assert.equal(shiftAnchor('day', '2026-09-07', 1), '2026-09-08');
  assert.equal(shiftAnchor('four_days', '2026-09-07', 1), '2026-09-11');
  assert.equal(shiftAnchor('week', '2026-09-07', -1), '2026-08-31');
  assert.equal(shiftAnchor('month', '2026-09-07', 1), '2026-10-07');
  assert.equal(shiftAnchor('year', '2026-09-07', -1), '2025-09-07');
});

test('each view asks for the range it actually draws', () => {
  assert.deepEqual(viewRange('week', '2026-09-07', 0), ['2026-09-06', '2026-09-12']);
  assert.deepEqual(viewRange('day', '2026-09-07', 0), ['2026-09-07', '2026-09-07']);
  assert.deepEqual(viewRange('year', '2026-09-07', 0), ['2026-01-01', '2026-12-31']);
  assert.deepEqual(viewRange('month', '2026-09-07', 0), ['2026-08-30', '2026-10-10']);
});

test('colours are stable per schedule and inside the palette', () => {
  assert.equal(colorIndex('abc'), colorIndex('abc'));
  for (const id of ['a', 'bb', 'ccc', '9f3c-1', '']) {
    const index = colorIndex(id);
    assert.ok(index >= 0 && index < 8, `${id} -> ${index}`);
  }
});

test('colours spread across the palette for similar ids', () => {
  // Sequential ids used to collapse onto a single colour, which made every
  // event on the grid the same shade.
  const sequential = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map(id => colorIndex(id)));
  assert.ok(sequential.size >= 4, `only ${sequential.size} distinct colours`);
  const uuids = new Set(
    Array.from({ length: 40 }, (_, index) => colorIndex(`3f2a91${String(index).padStart(2, '0')}-4b1c-4d5e-9a70-1c2d3e4f50${index}`)),
  );
  assert.ok(uuids.size >= 6, `only ${uuids.size} distinct colours`);
});

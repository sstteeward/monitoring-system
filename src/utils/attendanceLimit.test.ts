import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DAILY_LIMIT_MINUTES,
  attendanceDayKey,
  dailyRenderedMinutes,
  describeDuration,
  formatMinutes,
  formatMinutesLong,
  limitState,
  matchesLimitFilter,
  sessionWorkedMinutes,
  summariseDailyLimit,
  type LimitSession,
} from './attendanceLimit.ts';

/** 2026-09-07 08:00 in Asia/Manila, as the UTC instant the database stores. */
const manila = (hhmm: string, day = '07') => `2026-09-${day}T${hhmm}:00+08:00`;
const at = (hhmm: string, day = '07') => new Date(manila(hhmm, day)).getTime();
const LIMIT = DEFAULT_DAILY_LIMIT_MINUTES;
const WARN = LIMIT - 30;

test('an attendance day is a Philippine day, whatever the device is set to', () => {
  // 00:30 Manila on the 8th is still 16:30 UTC on the 7th — the record belongs
  // to the 8th, and a UTC-based date would have filed it a day early.
  assert.equal(attendanceDayKey('2026-09-07T16:30:00Z'), '2026-09-08');
  assert.equal(attendanceDayKey(manila('08:00')), '2026-09-07');
  assert.equal(attendanceDayKey(manila('23:59')), '2026-09-07');
});

test('an open session runs to now, a closed one to its clock-out', () => {
  const open: LimitSession = { clock_in: manila('08:00'), clock_out: null };
  assert.equal(sessionWorkedMinutes(open, at('16:00')), 480);
  const closed: LimitSession = { clock_in: manila('08:00'), clock_out: manila('12:00') };
  assert.equal(sessionWorkedMinutes(closed, at('20:00')), 240, 'now must not extend a closed session');
});

test('a completed break is subtracted, matching the existing report rule', () => {
  const session: LimitSession = {
    clock_in: manila('08:00'), clock_out: manila('17:00'),
    break_start: manila('12:00'), break_end: manila('13:00'),
  };
  assert.equal(sessionWorkedMinutes(session), 480);
});

test('time does not accrue during a break that is still running', () => {
  const session: LimitSession = { clock_in: manila('08:00'), clock_out: null, break_start: manila('12:00') };
  assert.equal(sessionWorkedMinutes(session, at('14:00')), 240, '4 worked hours, 2 on break');
});

test('a break with no end on a closed record is ignored, not open-ended', () => {
  const session: LimitSession = {
    clock_in: manila('08:00'), clock_out: manila('17:00'), break_start: manila('12:00'), break_end: null,
  };
  assert.equal(sessionWorkedMinutes(session), 540);
});

test('multiple sessions in a day accumulate', () => {
  const sessions: LimitSession[] = [
    { clock_in: manila('08:00'), clock_out: manila('12:00') },
    { clock_in: manila('13:00'), clock_out: manila('16:00') },
    { clock_in: manila('16:30'), clock_out: null },
  ];
  // 240 + 180 + 30 = 450
  assert.equal(dailyRenderedMinutes(sessions, '2026-09-07', at('17:00')), 450);
});

test('the daily total never mixes dates', () => {
  const sessions: LimitSession[] = [
    { clock_in: manila('08:00', '06'), clock_out: manila('17:00', '06') },
    { clock_in: manila('08:00', '07'), clock_out: manila('11:00', '07') },
  ];
  assert.equal(dailyRenderedMinutes(sessions, '2026-09-07', at('12:00')), 180, 'a new day starts from zero');
  assert.equal(dailyRenderedMinutes(sessions, '2026-09-06', at('12:00')), 540);
});

test('a rejected record is not counted', () => {
  const sessions: LimitSession[] = [
    { clock_in: manila('08:00'), clock_out: manila('16:00'), approval_status: 'rejected' },
    { clock_in: manila('16:00'), clock_out: null, approval_status: 'pending' },
  ];
  assert.equal(dailyRenderedMinutes(sessions, '2026-09-07', at('17:00')), 60);
});

test('the limit fires at exactly eight hours, not before', () => {
  assert.equal(limitState(479, LIMIT, WARN), 'APPROACHING', '7h 59m must not fire');
  assert.equal(limitState(480, LIMIT, WARN), 'LIMIT_REACHED', '8h 00m fires');
  assert.equal(limitState(481, LIMIT, WARN), 'OVER_LIMIT');
  assert.equal(limitState(449, LIMIT, WARN), 'NORMAL');
  assert.equal(limitState(450, LIMIT, WARN), 'APPROACHING');
});

test('the summary reports the remainder and the excess', () => {
  const under = summariseDailyLimit(470);
  assert.equal(under.state, 'APPROACHING');
  assert.equal(under.reached, false);
  assert.equal(under.remainingMinutes, 10);
  assert.equal(under.overLimitMinutes, 0);

  const over = summariseDailyLimit(505);
  assert.equal(over.state, 'OVER_LIMIT');
  assert.equal(over.reached, true);
  assert.equal(over.overLimitMinutes, 25);
  assert.equal(over.remainingMinutes, 0);
});

test('the limit is configurable, not fixed at eight hours', () => {
  const sixHourDay = summariseDailyLimit(370, 360, 330);
  assert.equal(sixHourDay.state, 'OVER_LIMIT');
  assert.equal(sixHourDay.overLimitMinutes, 10);
  assert.equal(summariseDailyLimit(370, 600, 570).state, 'NORMAL');
});

test('durations format for a table cell and for prose', () => {
  assert.equal(formatMinutes(462), '7h 42m');
  assert.equal(formatMinutes(480), '8h');
  assert.equal(formatMinutes(37), '37m');
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutesLong(485), '8 hours 5 minutes');
  assert.equal(formatMinutesLong(61), '1 hour 1 minute');
  assert.equal(formatMinutesLong(0), '0 minutes');
});

test('the duration column says what the number means', () => {
  assert.deepEqual(describeDuration(462), { label: '7h 42m', note: null, tone: 'normal' });
  assert.deepEqual(describeDuration(475), { label: '7h 55m', note: '5m to limit', tone: 'approaching' });
  assert.deepEqual(describeDuration(480), { label: '8h', note: 'Limit reached', tone: 'reached' });
  assert.deepEqual(describeDuration(505), { label: '8h 25m', note: '+25m over limit', tone: 'over' });
});

test('the staff filters select the rows they name', () => {
  const active = { isActive: true, renderedMinutes: 480 };
  const done = { isActive: false, renderedMinutes: 475 };
  const over = { isActive: true, renderedMinutes: 505 };

  assert.equal(matchesLimitFilter('all', done), true);
  assert.equal(matchesLimitFilter('active', active), true);
  assert.equal(matchesLimitFilter('active', done), false);
  assert.equal(matchesLimitFilter('clocked_out', done), true);
  assert.equal(matchesLimitFilter('limit_reached', active), true);
  assert.equal(matchesLimitFilter('limit_reached', done), false);
  assert.equal(matchesLimitFilter('over_limit', active), false, 'exactly at the limit is not over it');
  assert.equal(matchesLimitFilter('over_limit', over), true);
});

test('a clocked-out day still reports its total, and stops growing', () => {
  const sessions: LimitSession[] = [{ clock_in: manila('08:00'), clock_out: manila('16:05') }];
  const atFive = dailyRenderedMinutes(sessions, '2026-09-07', at('17:00'));
  const atSix = dailyRenderedMinutes(sessions, '2026-09-07', at('18:00'));
  assert.equal(atFive, 485);
  assert.equal(atSix, 485, 'no further warning is possible once the day is closed');
});

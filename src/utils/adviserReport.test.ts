import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_TARGET,
  formatDelta,
  formatMinutes,
  formatReportDate,
  issueTone,
  matchesAttendanceFilter,
  matchesSearch,
  minutesToHours,
  type AttendanceFilter,
} from './adviserReport.ts';
import type { ReportIssue, ReportStudent } from '../services/adviserReportService.ts';

const issue = (code: ReportIssue['code'], rank: number): ReportIssue =>
  ({ code, label: code, rank });

type FilterRow = Pick<ReportStudent, 'status' | 'issues'>;
const row = (status: ReportStudent['status'], issues: ReportIssue[] = []): FilterRow =>
  ({ status, issues });

test('formatMinutes reads as hours and minutes', () => {
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(60), '1h');
  assert.equal(formatMinutes(485), '8h 5m');
  // A negative or missing value is a bug upstream, not something to render.
  assert.equal(formatMinutes(-30), '0m');
});

test('minutesToHours keeps one decimal', () => {
  assert.equal(minutesToHours(480), 8);
  assert.equal(minutesToHours(485), 8.1);
  assert.equal(minutesToHours(0), 0);
});

test('formatDelta signs the difference so behind reads differently from ahead', () => {
  assert.equal(formatDelta(0), '0h');
  assert.equal(formatDelta(120), '+2h');
  assert.equal(formatDelta(-50), '−50m');
  assert.equal(formatDelta(-480), '−8h');
});

test('formatReportDate parses the day as local, never as UTC', () => {
  // A UTC parse would render September 7 for anyone west of Greenwich.
  assert.equal(formatReportDate('2026-09-08'), 'September 8, 2026');
  assert.equal(formatReportDate(null), '—');
  assert.equal(formatReportDate('not-a-date'), 'not-a-date');
});

test('issueTone escalates with the specification priority order', () => {
  assert.equal(issueTone(1), 'danger');   // missing clock-out
  assert.equal(issueTone(2), 'danger');   // missing clock-in
  assert.equal(issueTone(3), 'warning');  // exceeded the daily limit
  assert.equal(issueTone(5), 'warning');  // absent
  assert.equal(issueTone(6), 'info');     // behind OJT progress
  assert.equal(issueTone(8), 'info');     // incomplete log
});

test('attendance filters select on status', () => {
  assert.ok(matchesAttendanceFilter('all', row('absent')));
  assert.ok(matchesAttendanceFilter('present', row('present')));
  // Late still counts as having turned up.
  assert.ok(matchesAttendanceFilter('present', row('late')));
  assert.ok(!matchesAttendanceFilter('present', row('absent')));
  assert.ok(matchesAttendanceFilter('absent', row('absent')));
  assert.ok(matchesAttendanceFilter('incomplete', row('incomplete')));
  assert.ok(matchesAttendanceFilter('not_recorded', row(null)));
  assert.ok(!matchesAttendanceFilter('not_recorded', row('present')));
});

test('attendance filters select on the issue the report raised', () => {
  const missingOut = row('incomplete', [issue('missing_clock_out', 1)]);
  const overLimit = row('present', [issue('over_limit', 3)]);

  assert.ok(matchesAttendanceFilter('missing_clock_out', missingOut));
  assert.ok(!matchesAttendanceFilter('missing_clock_out', overLimit));
  assert.ok(matchesAttendanceFilter('over_limit', overLimit));
  assert.ok(!matchesAttendanceFilter('missing_clock_in', missingOut));
});

test('every attendance filter has a rule, so none silently returns everything', () => {
  const filters: AttendanceFilter[] = [
    'present', 'absent', 'incomplete',
    'missing_clock_out', 'missing_clock_in', 'over_limit', 'not_recorded',
  ];
  // A student with no status and no issues matches only "not recorded".
  const blank = row(null);
  const matched = filters.filter(f => matchesAttendanceFilter(f, blank));
  assert.deepEqual(matched, ['not_recorded']);
});

test('search covers the fields the report actually shows', () => {
  const student = {
    name: 'Maria Santos',
    email: 'msantos@asiancollege.edu.ph',
    section: 'DIT-1A',
    company: 'ABC Corporation',
  };

  assert.ok(matchesSearch(student, ''));
  assert.ok(matchesSearch(student, '  '));
  assert.ok(matchesSearch(student, 'maria'));
  assert.ok(matchesSearch(student, 'MSANTOS'));
  assert.ok(matchesSearch(student, 'dit-1a'));
  assert.ok(matchesSearch(student, 'abc corp'));
  assert.ok(!matchesSearch(student, 'pedro'));
});

test('search tolerates the nulls the payload allows', () => {
  const sparse = { name: null, email: null, section: 'DIT-2B', company: null };
  assert.ok(matchesSearch(sparse, 'dit-2b'));
  assert.ok(!matchesSearch(sparse, 'anything'));
});

test('every alert code routes somewhere, so no alert is a dead end', () => {
  const codes = [
    'missing_clock_out', 'missing_clock_in', 'over_limit', 'suspicious',
    'absent', 'behind_ojt', 'journals_pending', 'journals_revision', 'no_company',
  ];
  for (const code of codes) {
    assert.ok(ALERT_TARGET[code], `alert "${code}" has no destination tab`);
  }
});

test('attendance alerts carry the filter that isolates their students', () => {
  assert.deepEqual(ALERT_TARGET.missing_clock_out, { tab: 'attendance', filter: 'missing_clock_out' });
  assert.deepEqual(ALERT_TARGET.over_limit, { tab: 'attendance', filter: 'over_limit' });
  assert.deepEqual(ALERT_TARGET.behind_ojt, { tab: 'ojt' });
});

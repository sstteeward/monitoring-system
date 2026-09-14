import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_TARGET,
  ATTENTION_PREVIEW,
  buildDailyNarrative,
  formatDelta,
  formatMinutes,
  formatReportDate,
  isNarrativeStale,
  issueTone,
  matchesAttendanceFilter,
  matchesSearch,
  minutesToHours,
  narrativeToText,
  splitNarrativeLabel,
  textToParagraphs,
  type AttendanceFilter,
  type NarrativeParagraph,
  type NarrativeParagraphId,
} from './adviserReport.ts';
import type {
  DailyReportPayload,
  ReportAttentionRow,
  ReportBehindRow,
  ReportCompanyRow,
  ReportIssue,
  ReportJournalRow,
  ReportSectionRow,
  ReportStudent,
} from '../services/adviserReportService.ts';

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
  assert.equal(issueTone(6), 'info');     // behind SIL progress
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

/* ── The narrative ─────────────────────────────────────────────────────────── */

const labelled = (label: string, code: ReportIssue['code'], rank: number): ReportIssue =>
  ({ code, label, rank });

const sectionRow = (section: string, figures: Partial<ReportSectionRow> = {}): ReportSectionRow => ({
  section_id: section, section, course_code: 'DIT', students: 0, present: 0, late: 0, absent: 0,
  incomplete: 0, not_recorded: 0, avg_minutes: 0, issues: 0, journals_pending: 0, ...figures,
});

const attentionRow = (
  student_id: string,
  name: string | null,
  section: string,
  issues: ReportIssue[],
  company: string | null = null,
): ReportAttentionRow => ({
  student_id, name, section, section_id: section, company,
  issue: issues[0]?.label ?? null, issue_code: issues[0]?.code ?? null, issues, priority: issues[0]?.rank ?? 8,
});

const behindRow = (student_id: string, name: string, delta_minutes: number, completion_pct = 0): ReportBehindRow => ({
  student_id, name, section: 'DIT-1A', company: null, required_hours: 500,
  rendered_minutes: 0, expected_minutes: -delta_minutes, delta_minutes, completion_pct, status: 'behind',
});

const journalRow = (student_id: string, name: string, pending: number): ReportJournalRow => ({
  student_id, name, section: 'DIT-1B', pending, approved: 0, rejected: 0, revision: 0,
  submitted_today: 0, entry_today: false, last_entry_date: null,
});

const companyRow = (company_id: string | null, company: string, figures: Partial<ReportCompanyRow> = {}): ReportCompanyRow => ({
  company_id, company, students: 1, present: 0, absent: 0, incomplete: 0, avg_minutes: 0, issues: 0, ...figures,
});

/** The day in the original screenshot: nothing recorded, three behind, one journal waiting. */
const screenshotDay = (): DailyReportPayload => ({
  version: 1,
  report_date: '2026-09-14',
  generated_at: '2026-09-14T01:00:00Z',
  time_zone: 'Asia/Manila',
  adviser: { id: 'adviser-1', name: 'Carl Suelto', email: null, adviser_type: 'IT Adviser', course: 'DIT' },
  settings: { daily_limit_minutes: 480, working_dows: [1, 2, 3, 4, 5], expected_through: '2026-09-13', default_required_hours: 486 },
  summary: {
    sections: 4, students: 16, present: 0, late: 0, absent: 0, incomplete: 0, on_leave: 0,
    not_recorded: 16, attendance_rate: 0, total_minutes: 0, attention: 3, journals_pending: 1,
    journals_submitted_today: 0, students_without_company: 0,
  },
  sections: [
    sectionRow('DIT-1A', { students: 6, not_recorded: 6 }),
    sectionRow('DIT-2Z'),
    sectionRow('DIT-3F', { students: 5, not_recorded: 5 }),
    sectionRow('DIT-3I', { students: 5, not_recorded: 5 }),
  ],
  students: [],
  attention: [
    attentionRow('s1', 'Frenchelle Jean Inoferio', 'DIT-1A', [labelled('Behind SIL Hours', 'behind_ojt', 6)], 'Asian College'),
    attentionRow('s2', 'francis Seblos', 'DIT-3F', [labelled('Behind SIL Hours', 'behind_ojt', 6)], 'ECE'),
    attentionRow('s3', 'Juline Rubi Lacapag', 'DIT-3I', [labelled('Behind SIL Hours', 'behind_ojt', 6)]),
  ],
  ojt: {
    on_track: 0, completed: 0, monitoring: 1, behind: 3, not_started: 12,
    students_behind: [
      behindRow('s2', 'francis Seblos', -1560),
      behindRow('s1', 'Frenchelle Jean Inoferio', -1080, 12),
      behindRow('s3', 'Juline Rubi Lacapag', -600, 30),
    ],
  },
  journals: {
    submitted_today: 0, entries_for_date: 0, pending: 1, approved: 0, rejected: 0, revision: 0,
    students: [journalRow('s9', 'Ruzel Bantaya', 1)],
  },
  companies: [
    companyRow('c1', 'Asian College', { students: 4, issues: 1 }),
    companyRow('c2', 'ECE', { students: 3, issues: 1 }),
  ],
  alerts: [
    { rank: 6, code: 'behind_ojt', severity: 'warning', count: 3, message: '3 student(s) are behind expected SIL progress.' },
    { rank: 7, code: 'journals_pending', severity: 'info', count: 1, message: '1 journal(s) are pending approval.' },
  ],
});

/** A recorded day with nothing to flag. */
const quietDay = (): DailyReportPayload => {
  const day = screenshotDay();
  return {
    ...day,
    summary: {
      ...day.summary, present: 14, late: 1, on_leave: 1, not_recorded: 0, attendance_rate: 94,
      total_minutes: 6720, attention: 0, journals_pending: 0,
    },
    sections: [sectionRow('DIT-1A', { students: 16, present: 14, late: 1 })],
    attention: [],
    ojt: { on_track: 16, completed: 0, monitoring: 0, behind: 0, not_started: 0, students_behind: [] },
    journals: { submitted_today: 0, entries_for_date: 0, pending: 0, approved: 0, rejected: 0, revision: 0, students: [] },
    companies: [companyRow('c1', 'Asian College', { students: 16, present: 14 })],
    alerts: [],
  };
};

const paragraphText = (p: NarrativeParagraph) => narrativeToText([{ ...p, label: null }]);

const paragraph = (payload: DailyReportPayload, id: NarrativeParagraphId): NarrativeParagraph => {
  const found = buildDailyNarrative(payload).find(p => p.id === id);
  assert.ok(found, `no "${id}" paragraph`);
  return found;
};

test('the narrative keeps a fixed paragraph order and omits what has nothing to say', () => {
  assert.deepEqual(
    buildDailyNarrative(screenshotDay()).map(p => p.id),
    ['coverage', 'attendance', 'attention', 'sil', 'journals', 'companies', 'exceptions'],
  );
  assert.deepEqual(
    buildDailyNarrative(quietDay()).map(p => p.id),
    ['coverage', 'attendance', 'sil', 'companies', 'closing'],
  );
});

test('coverage is always there, in the first person', () => {
  assert.equal(
    paragraphText(paragraph(screenshotDay(), 'coverage')),
    'For September 14, 2026, I am monitoring 16 students across 4 sections.',
  );
  const unplaced = screenshotDay();
  unplaced.summary.students_without_company = 2;
  assert.match(paragraphText(paragraph(unplaced, 'coverage')), /Of them, 2 students are not yet placed with a company\.$/);
});

test('the narrative never speaks as the system or states a plan, an opinion or a judgement', () => {
  for (const payload of [screenshotDay(), quietDay()]) {
    const text = narrativeToText(buildDailyNarrative(payload));
    assert.doesNotMatch(text, /\b(I will|I'll|I expect|I plan|should|must|concerning|urgent|the system|your)\b/i);
    assert.doesNotMatch(text, /!/);
    assert.doesNotMatch(text, /Review (it|them) now/);
  }
});

test('no sentence opens on a figure, apart from the database alert wording', () => {
  for (const payload of [screenshotDay(), quietDay()]) {
    for (const p of buildDailyNarrative(payload).filter(p => p.id !== 'exceptions')) {
      for (const sentence of paragraphText(p).split(/(?<=\.)\s+/)) {
        assert.match(sentence, /^[^\d−+]/, `"${sentence}" opens on a figure`);
      }
    }
  }
});

test('a clause whose figure is zero is left out', () => {
  for (const payload of [screenshotDay(), quietDay()]) {
    for (const p of buildDailyNarrative(payload).filter(p => p.id !== 'exceptions')) {
      assert.doesNotMatch(paragraphText(p), /(?<![\d.,])0(?![\d.,])/, `"${p.id}" states a zero`);
    }
  }
});

test('attendance names the sections carrying the gaps, never an empty section', () => {
  const text = paragraphText(paragraph(screenshotDay(), 'attendance'));
  assert.equal(
    text,
    'None of them has an attendance record yet for this date. '
      + 'The gaps are in DIT-1A (6 not recorded), DIT-3F (5 not recorded) and DIT-3I (5 not recorded).',
  );
  assert.ok(!text.includes('DIT-2Z'));
});

test('attendance caps the section list and counts the rest', () => {
  const payload = screenshotDay();
  payload.sections.push(
    sectionRow('DIT-4A', { students: 2, absent: 1 }),
    sectionRow('DIT-4B', { students: 1, not_recorded: 1 }),
  );
  assert.match(
    paragraphText(paragraph(payload, 'attendance')),
    /The sections with the most gaps are DIT-1A \(6 not recorded\), DIT-3F \(5 not recorded\) and DIT-3I \(5 not recorded\), and 2 other sections also have gaps\.$/,
  );
});

test('a recorded day reads the breakdown and the rate from the summary', () => {
  assert.equal(
    paragraphText(paragraph(quietDay(), 'attendance')),
    'Of my students, 14 were present, 1 was late and 1 was on leave. '
      + `The attendance rate is 94%, with ${formatMinutes(6720)} rendered in total.`,
  );
});

test('attention names each student with section, company and every issue label', () => {
  const payload = screenshotDay();
  payload.attention[0] = attentionRow('s1', null, 'DIT-1A', [
    labelled('Missing Clock-out', 'missing_clock_out', 1),
    labelled('Behind SIL Hours', 'behind_ojt', 6),
  ], 'Asian College');

  const attention = paragraph(payload, 'attention');
  assert.equal(
    paragraphText(attention),
    'I have 3 students who need my attention: '
      + 'Unnamed student (DIT-1A at Asian College, missing clock-out and behind SIL hours), '
      + 'francis Seblos (DIT-3F at ECE, behind SIL hours) and '
      + 'Juline Rubi Lacapag (DIT-3I, behind SIL hours).',
  );
  // Names are segments, so the page can open each student's profile.
  assert.deepEqual(
    attention.segments.flatMap(s => (s.kind === 'student' ? [s.id] : [])),
    ['s1', 's2', 's3'],
  );
});

test('attention is capped only when the page asks, with the rest behind an expander', () => {
  const payload = screenshotDay();
  payload.attention = Array.from({ length: ATTENTION_PREVIEW + 2 }, (_, i) =>
    attentionRow(`s${i}`, `Student ${i + 1}`, 'DIT-1A', [labelled('Absent', 'absent', 5)]));

  const capped = buildDailyNarrative(payload, { attentionLimit: ATTENTION_PREVIEW }).find(p => p.id === 'attention');
  assert.ok(capped);
  assert.deepEqual(capped.segments.filter(s => s.kind === 'more'), [{ kind: 'more', count: 2 }]);
  assert.match(paragraphText(capped), /Student 5 \(DIT-1A, absent\) and 2 more\.$/);

  // The editable text and the PDF carry every name.
  const full = paragraph(payload, 'attention');
  assert.ok(full.segments.every(s => s.kind !== 'more'));
  assert.match(paragraphText(full), /Student 7 \(DIT-1A, absent\)\.$/);
});

test('SIL hours read the counts, then the students furthest behind with their exact deltas', () => {
  assert.equal(
    paragraphText(paragraph(screenshotDay(), 'sil')),
    'For SIL hours, 3 are behind schedule, 1 needs monitoring and 12 have not started. '
      + `The furthest behind are francis Seblos (${formatDelta(-1560)} against the expected hours), `
      + `Frenchelle Jean Inoferio (${formatDelta(-1080)} against the expected hours, at 12% of the requirement) `
      + `and Juline Rubi Lacapag (${formatDelta(-600)} against the expected hours, at 30% of the requirement).`,
  );
});

test('a single student behind is named on their own', () => {
  const payload = quietDay();
  payload.ojt = { ...payload.ojt, on_track: 15, behind: 1, students_behind: [behindRow('s1', 'Maria Santos', -480, 40)] };
  assert.equal(
    paragraphText(paragraph(payload, 'sil')),
    'For SIL hours, 1 is behind schedule and 15 are on track. '
      + `Maria Santos is ${formatDelta(-480)} against the expected hours, at 40% of the requirement.`,
  );
});

test('journals say what came in, what waits on me and who it is from, with no review link', () => {
  assert.equal(
    paragraphText(paragraph(screenshotDay(), 'journals')),
    'I have 1 journal entry waiting for my approval. The pending entry is from Ruzel Bantaya (DIT-1B).',
  );

  const busy = screenshotDay();
  busy.journals = {
    submitted_today: 4, entries_for_date: 3, pending: 6, approved: 20, rejected: 1, revision: 2,
    students: [
      journalRow('a', 'Ana', 1), journalRow('b', 'Ben', 3), journalRow('c', 'Cy', 1),
      journalRow('d', 'Di', 0), journalRow('e', 'Ed', 1),
    ],
  };
  assert.equal(
    paragraphText(paragraph(busy, 'journals')),
    'On this date, 4 journal entries were submitted and 3 entries cover the day. '
      + 'I have 6 journal entries waiting for my approval and 2 entries back with students for revision. '
      + 'The pending entries are from Ben (DIT-1B, 3 entries), Ana (DIT-1B), Cy (DIT-1B) and 1 other student. '
      + "Across my students' journals to date, 20 entries have been approved and 1 entry has been rejected.",
  );
});

test('companies count real placements only and name the ones with absences or flags', () => {
  const payload = screenshotDay();
  payload.companies = [
    companyRow(null, 'Not yet deployed', { students: 2, absent: 1 }),
    companyRow('c1', 'Asian College', { students: 4, issues: 1 }),
    companyRow('c2', 'ECE', { students: 3, absent: 2, issues: 2 }),
    companyRow('c3', 'Qualfon'),
  ];
  assert.equal(
    paragraphText(paragraph(payload, 'companies')),
    'My students are placed with 3 companies. '
      + 'The ones with absences or flagged students are ECE (2 absent and 2 flagged) and Asian College (1 flagged).',
  );
});

test('exceptions quote the database wording, danger first', () => {
  const payload = screenshotDay();
  payload.alerts.push({ rank: 1, code: 'missing_clock_out', severity: 'danger', count: 2, message: '2 student(s) have not clocked out' });
  assert.equal(
    paragraphText(paragraph(payload, 'exceptions')),
    '2 student(s) have not clocked out. 3 student(s) are behind expected SIL progress. 1 journal(s) are pending approval.',
  );
});

test('a quiet day closes with one factual sentence and nothing more', () => {
  const paragraphs = buildDailyNarrative(quietDay());
  const closing = paragraphs[paragraphs.length - 1];
  assert.equal(closing.id, 'closing');
  assert.equal(closing.label, null);
  assert.equal(paragraphText(closing), 'Nothing else needs my attention today.');
  assert.ok(!buildDailyNarrative(screenshotDay()).some(p => p.id === 'closing'));
});

test('an adviser with sections but no students gets coverage, not empty paragraphs', () => {
  const payload = quietDay();
  payload.summary = { ...payload.summary, students: 0, present: 0, late: 0, on_leave: 0, attendance_rate: 0, total_minutes: 0 };
  payload.sections = [sectionRow('DIT-1A')];
  payload.ojt = { ...payload.ojt, on_track: 0 };
  payload.companies = [];
  const paragraphs = buildDailyNarrative(payload);
  assert.deepEqual(paragraphs.map(p => p.id), ['coverage', 'closing']);
  assert.equal(
    paragraphText(paragraphs[0]),
    'For September 14, 2026, I have 4 sections assigned to me, with no students enrolled in them yet.',
  );
});

test('the editable text keeps the labels and a blank line between paragraphs', () => {
  const text = narrativeToText(buildDailyNarrative(screenshotDay()));
  const paragraphs = textToParagraphs(text);
  assert.equal(paragraphs.length, 7);
  assert.ok(paragraphs[0].startsWith('Coverage: For September 14, 2026'));
  assert.ok(text.includes('\n\nNeeds my attention: I have 3 students'));
  assert.ok(text.includes('\n\nJournals: I have 1 journal entry'));
});

test('saved text splits on blank lines, whatever the line endings', () => {
  assert.deepEqual(
    textToParagraphs('First line\r\nstill first\r\n\r\n  \r\nSecond\n\n\nThird  '),
    ['First line\nstill first', 'Second', 'Third'],
  );
  assert.deepEqual(textToParagraphs('   \n\n  '), []);
});

test('a saved paragraph keeps its label only when it is one the report writes', () => {
  assert.deepEqual(splitNarrativeLabel('Journals: I have 2 entries.'), { label: 'Journals', body: 'I have 2 entries.' });
  assert.deepEqual(splitNarrativeLabel('Note: the company called.'), { label: null, body: 'Note: the company called.' });
  assert.deepEqual(splitNarrativeLabel('Journals:'), { label: null, body: 'Journals:' });
});

test('an edit is stale only when the figures were rebuilt after it was written', () => {
  assert.equal(isNarrativeStale('2026-09-14T09:02:00.123456+00:00', '2026-09-14T08:12:00+00:00'), true);
  assert.equal(isNarrativeStale('2026-09-14T08:00:00+00:00', '2026-09-14T08:12:00+00:00'), false);
  assert.equal(isNarrativeStale('2026-09-14T08:00:00+00:00', null), false);
  assert.equal(isNarrativeStale('not a date', '2026-09-14T08:12:00+00:00'), false);
});

// Presentation rules for the adviser's Automated Daily Report.
//
// The report itself is built in the database (supabase_adviser_daily_report.sql);
// nothing here recomputes a figure. This module only decides how a figure is
// labelled, coloured and filtered, and it is kept free of React and Supabase
// imports so the Node test runner can exercise it directly.

import type {
  AttendanceState,
  DailyReportPayload,
  IssueCode,
  ProgressStatus,
  ReportBehindRow,
  ReportStudent,
} from '../services/adviserReportService';

/** `485` -> `8h 5m`. Mirrors formatMinutes in attendanceLimit.ts. */
export const formatMinutes = (minutes: number): string => {
  const safe = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
};

/** `485` -> `8.1`, for a column that has to line up. */
export const minutesToHours = (minutes: number): number =>
  Math.round(((minutes || 0) / 60) * 10) / 10;

/** A signed difference, so "on track" and "behind" read differently at a glance. */
export const formatDelta = (minutes: number): string => {
  const rounded = Math.round(minutes || 0);
  if (rounded === 0) return '0h';
  return `${rounded > 0 ? '+' : '−'}${formatMinutes(Math.abs(rounded))}`;
};

/** `2026-09-08` -> `September 8, 2026`. Parsed as a local date, never as UTC. */
export const formatReportDate = (date: string | null | undefined): string => {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** A timestamp as a wall-clock time, for "Generated: 5:02 PM". */
export const formatClock = (timestamp: string | null | undefined): string => {
  if (!timestamp) return '—';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export const STATUS_LABELS: Record<Exclude<AttendanceState, null> | 'not_recorded', string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  on_leave: 'On Leave',
  incomplete: 'Incomplete',
  not_recorded: 'Not Recorded',
};

/** The badge class names already defined for the attendance tables. */
export const STATUS_CLASS: Record<Exclude<AttendanceState, null> | 'not_recorded', string> = {
  present: 'is-present',
  late: 'is-late',
  absent: 'is-absent',
  on_leave: 'is-on-leave',
  incomplete: 'is-incomplete',
  not_recorded: 'is-not-recorded',
};

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  completed: 'Completed',
  on_track: 'On Track',
  monitoring: 'Needs Monitoring',
  behind: 'Behind',
  not_started: 'Not Started',
};

export const PROGRESS_COLORS: Record<ProgressStatus, string> = {
  completed: '#0d9488',
  on_track: '#10b981',
  monitoring: '#f59e0b',
  behind: '#ef4444',
  not_started: '#94a3b8',
};

/** How urgent an issue looks. Ranks 1-3 are the ones that need action today. */
export const issueTone = (rank: number): 'danger' | 'warning' | 'info' =>
  rank <= 2 ? 'danger' : rank <= 5 ? 'warning' : 'info';

/**
 * The attendance filters, which run across ALL of the adviser's sections —
 * the report is never scoped to one section.
 */
export type AttendanceFilter =
  | 'all'
  | 'present'
  | 'absent'
  | 'incomplete'
  | 'missing_clock_out'
  | 'missing_clock_in'
  | 'over_limit'
  | 'not_recorded';

export const ATTENDANCE_FILTER_LABELS: Record<AttendanceFilter, string> = {
  all: 'All',
  present: 'Present',
  absent: 'Absent',
  incomplete: 'Incomplete',
  missing_clock_out: 'Missing Clock-out',
  missing_clock_in: 'Missing Clock-in',
  over_limit: 'Exceeded Daily Limit',
  not_recorded: 'Not Recorded',
};

/** True when a student's row belongs in the chosen attendance filter. */
export const matchesAttendanceFilter = (
  filter: AttendanceFilter,
  student: Pick<ReportStudent, 'status' | 'issues'>,
): boolean => {
  const has = (code: IssueCode) => student.issues.some(i => i.code === code);
  switch (filter) {
    case 'present':           return student.status === 'present' || student.status === 'late';
    case 'absent':            return student.status === 'absent';
    case 'incomplete':        return student.status === 'incomplete';
    case 'missing_clock_out': return has('missing_clock_out');
    case 'missing_clock_in':  return has('missing_clock_in');
    case 'over_limit':        return has('over_limit');
    case 'not_recorded':      return student.status === null;
    default:                  return true;
  }
};

/** An alert's code maps onto the tab and filter that shows the students behind it. */
export const ALERT_TARGET: Record<string, { tab: string; filter?: AttendanceFilter }> = {
  missing_clock_out: { tab: 'attendance', filter: 'missing_clock_out' },
  missing_clock_in:  { tab: 'attendance', filter: 'missing_clock_in' },
  over_limit:        { tab: 'attendance', filter: 'over_limit' },
  suspicious:        { tab: 'attendance', filter: 'all' },
  absent:            { tab: 'attendance', filter: 'absent' },
  behind_ojt:        { tab: 'ojt' },
  journals_pending:  { tab: 'journals' },
  journals_revision: { tab: 'journals' },
  no_company:        { tab: 'companies' },
};

/** Matches a search term against the student fields shown in the report. */
export const matchesSearch = (
  student: Pick<ReportStudent, 'name' | 'email' | 'section' | 'company'>,
  search: string,
): boolean => {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return (student.name || '').toLowerCase().includes(term)
    || (student.email || '').toLowerCase().includes(term)
    || (student.section || '').toLowerCase().includes(term)
    || (student.company || '').toLowerCase().includes(term);
};

/* ── The narrative ────────────────────────────────────────────────────────────
   The day in the adviser's own words. First person is a matter of voice only:
   every clause reads a figure the database already put in the payload, and none
   states an intent, an opinion or a plan. A clause whose figure is zero is left
   out, and a sentence opens on a word, never a figure — "2026. 3 students" reads
   as one number running into the next. The alert messages are the one thing
   quoted as written: they are the database's own wording.

   Built as segments rather than strings, so the same narrative renders two
   ways: as prose with clickable student names, and as flat text to edit. */

/** How many students needing attention are named before "and N more". */
export const ATTENTION_PREVIEW = 5;
/** How many sections with attendance gaps are named. */
export const SECTION_DETAIL_LIMIT = 3;
/** How many of the students furthest behind on SIL hours are named. */
export const BEHIND_DETAIL_LIMIT = 3;
/** How many students with pending journal entries are named. */
export const JOURNAL_DETAIL_LIMIT = 3;
/** How many companies with absences or flagged students are named. */
export const COMPANY_DETAIL_LIMIT = 3;
/** Mirrors save_my_daily_report_narrative, which holds the real limit. */
export const NARRATIVE_MAX_LENGTH = 20000;

/** `1, 'student'` -> "1 student"; `3, 'student'` -> "3 students". */
export const count = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;

/** Picks the verb form that agrees with `n`. */
export const verb = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** `['a', 'b', 'c']` -> "a, b and c". */
export const joinList = (parts: string[]): string =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/**
 * One run of the narrative. `more` is the attention paragraph's "and N more"
 * expander, present only when the page asked for a capped list.
 */
export type NarrativeSegment =
  | { kind: 'text'; value: string }
  | { kind: 'student'; id: string; name: string }
  | { kind: 'more'; count: number };

export type NarrativeParagraphId =
  | 'coverage'
  | 'attendance'
  | 'attention'
  | 'sil'
  | 'journals'
  | 'companies'
  | 'exceptions'
  | 'closing';

export interface NarrativeParagraph {
  id: NarrativeParagraphId;
  /** null = no heading (closing). */
  label: string | null;
  segments: NarrativeSegment[];
}

export const NARRATIVE_LABELS: Record<Exclude<NarrativeParagraphId, 'closing'>, string> = {
  coverage: 'Coverage',
  attendance: 'Attendance',
  attention: 'Needs my attention',
  sil: 'SIL hours',
  journals: 'Journals',
  companies: 'Companies',
  exceptions: 'Exceptions',
};

export interface NarrativeOptions {
  /**
   * Students named in the attention paragraph before the expander. Uncapped by
   * default, so the editable text and the PDF carry every name.
   */
  attentionLimit?: number;
}

type Sentence = NarrativeSegment[];

const plain = (value: string): NarrativeSegment => ({ kind: 'text', value });

const studentName = (id: string, name: string | null): NarrativeSegment =>
  ({ kind: 'student', id, name: name || 'Unnamed student' });

/** joinList for items that carry segments, so a name stays a link inside the list. */
const joinSegments = (items: Sentence[]): NarrativeSegment[] =>
  items.flatMap((item, i) => (i === 0 ? item : [plain(i === items.length - 1 ? ' and ' : ', '), ...item]));

const joinSentences = (sentences: Sentence[]): NarrativeSegment[] =>
  sentences.flatMap((sentence, i) => (i === 0 ? sentence : [plain(' '), ...sentence]));

/** "Behind SIL Hours" -> "behind SIL hours": a label reads as prose mid-sentence, acronyms intact. */
const inProse = (label: string): string =>
  label.split(' ').map(word => (/^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase())).join(' ');

const coverageSentences = (p: DailyReportPayload): Sentence[] => {
  const s = p.summary;
  const day = formatReportDate(p.report_date);
  if (s.sections === 0) return [[plain(`For ${day}, I have no sections assigned to me.`)]];
  if (s.students === 0) {
    return [[plain(`For ${day}, I have ${count(s.sections, 'section')} assigned to me, with no students enrolled in them yet.`)]];
  }

  const sentences: Sentence[] = [
    [plain(`For ${day}, I am monitoring ${count(s.students, 'student')} across ${count(s.sections, 'section')}.`)],
  ];
  const unplaced = s.students_without_company;
  if (unplaced > 0) {
    sentences.push([plain(`Of them, ${count(unplaced, 'student')} ${verb(unplaced, 'is', 'are')} not yet placed with a company.`)]);
  }
  return sentences;
};

const attendanceSentences = (p: DailyReportPayload): Sentence[] => {
  const s = p.summary;
  if (s.students === 0) return [];

  const sentences: Sentence[] = [];
  const recorded = s.present + s.late + s.absent + s.incomplete + s.on_leave;
  if (recorded === 0) {
    sentences.push([plain('None of them has an attendance record yet for this date.')]);
  } else {
    const parts: string[] = [];
    if (s.present) parts.push(`${s.present} ${verb(s.present, 'was', 'were')} present`);
    if (s.late) parts.push(`${s.late} ${verb(s.late, 'was', 'were')} late`);
    if (s.absent) parts.push(`${s.absent} ${verb(s.absent, 'was', 'were')} absent`);
    if (s.on_leave) parts.push(`${s.on_leave} ${verb(s.on_leave, 'was', 'were')} on leave`);
    if (s.incomplete) parts.push(`${s.incomplete} left an incomplete log`);
    if (s.not_recorded) parts.push(`${s.not_recorded} ${verb(s.not_recorded, 'has', 'have')} no record yet`);
    sentences.push([plain(`Of my students, ${joinList(parts)}.`)]);

    if (s.attendance_rate && s.total_minutes) {
      sentences.push([plain(`The attendance rate is ${s.attendance_rate}%, with ${formatMinutes(s.total_minutes)} rendered in total.`)]);
    } else if (s.attendance_rate) {
      sentences.push([plain(`The attendance rate is ${s.attendance_rate}%.`)]);
    } else if (s.total_minutes) {
      sentences.push([plain(`The hours rendered come to ${formatMinutes(s.total_minutes)} in total.`)]);
    }
  }

  // A section with no students has no gap to report, however many rows the
  // adviser's assignments produce. The sum only orders the list; it is never shown.
  const gaps = p.sections
    .filter(sec => sec.students > 0 && (sec.not_recorded > 0 || sec.absent > 0))
    .sort((a, b) => (b.not_recorded + b.absent) - (a.not_recorded + a.absent));
  if (gaps.length > 0) {
    const named = gaps.slice(0, SECTION_DETAIL_LIMIT).map(sec => {
      const bits: string[] = [];
      if (sec.not_recorded) bits.push(`${sec.not_recorded} not recorded`);
      if (sec.absent) bits.push(`${sec.absent} absent`);
      return `${sec.section} (${joinList(bits)})`;
    });
    const rest = gaps.length - named.length;
    sentences.push([plain(rest > 0
      ? `The sections with the most gaps are ${joinList(named)}, and ${count(rest, 'other section')} also ${verb(rest, 'has', 'have')} gaps.`
      : `The gaps are in ${joinList(named)}.`)]);
  }
  return sentences;
};

const attentionSentences = (p: DailyReportPayload, limit: number): Sentence[] => {
  const rows = p.attention;
  if (rows.length === 0) return [];

  // Payload order is already the database's priority ranking.
  const shown = rows.slice(0, Math.max(1, limit));
  const hidden = rows.length - shown.length;
  const items = shown.map((a): Sentence => {
    const labels = a.issues.length > 0
      ? a.issues.map(i => inProse(i.label))
      : a.issue ? [inProse(a.issue)] : [];
    const where = a.company ? `${a.section} at ${a.company}` : a.section;
    return [studentName(a.student_id, a.name), plain(` (${[where, joinList(labels)].filter(Boolean).join(', ')})`)];
  });
  if (hidden > 0) items.push([{ kind: 'more', count: hidden }]);

  return [[
    plain(`I have ${count(rows.length, 'student')} who ${verb(rows.length, 'needs', 'need')} my attention: `),
    ...joinSegments(items),
    plain('.'),
  ]];
};

const behindDetail = (b: ReportBehindRow): string => {
  const bits = [`${formatDelta(b.delta_minutes)} against the expected hours`];
  if (b.completion_pct) bits.push(`at ${b.completion_pct}% of the requirement`);
  return bits.join(', ');
};

const silSentences = (p: DailyReportPayload): Sentence[] => {
  const o = p.ojt;
  const sentences: Sentence[] = [];

  const parts: string[] = [];
  if (o.behind) parts.push(`${o.behind} ${verb(o.behind, 'is', 'are')} behind schedule`);
  if (o.monitoring) parts.push(`${o.monitoring} ${verb(o.monitoring, 'needs', 'need')} monitoring`);
  if (o.on_track) parts.push(`${o.on_track} ${verb(o.on_track, 'is', 'are')} on track`);
  if (o.completed) parts.push(`${o.completed} ${verb(o.completed, 'has', 'have')} completed their hours`);
  if (o.not_started) parts.push(`${o.not_started} ${verb(o.not_started, 'has', 'have')} not started`);
  if (parts.length > 0) sentences.push([plain(`For SIL hours, ${joinList(parts)}.`)]);

  const behind = [...o.students_behind]
    .sort((a, b) => a.delta_minutes - b.delta_minutes)
    .slice(0, BEHIND_DETAIL_LIMIT);
  if (o.students_behind.length === 1 && behind.length === 1) {
    const [only] = behind;
    sentences.push([studentName(only.student_id, only.name), plain(` is ${behindDetail(only)}.`)]);
  } else if (behind.length > 0) {
    sentences.push([
      plain('The furthest behind are '),
      ...joinSegments(behind.map((b): Sentence => [studentName(b.student_id, b.name), plain(` (${behindDetail(b)})`)])),
      plain('.'),
    ]);
  }
  return sentences;
};

const journalSentences = (p: DailyReportPayload): Sentence[] => {
  const j = p.journals;
  const sentences: Sentence[] = [];

  const dated: string[] = [];
  if (j.submitted_today) {
    dated.push(`${count(j.submitted_today, 'journal entry', 'journal entries')} ${verb(j.submitted_today, 'was', 'were')} submitted`);
  }
  if (j.entries_for_date) {
    const noun = dated.length > 0 ? ['entry', 'entries'] as const : ['journal entry', 'journal entries'] as const;
    dated.push(`${count(j.entries_for_date, noun[0], noun[1])} ${verb(j.entries_for_date, 'covers', 'cover')} the day`);
  }
  if (dated.length > 0) sentences.push([plain(`On this date, ${joinList(dated)}.`)]);

  const waiting: string[] = [];
  if (j.pending) waiting.push(`${count(j.pending, 'journal entry', 'journal entries')} waiting for my approval`);
  if (j.revision) {
    const noun = j.pending ? ['entry', 'entries'] as const : ['journal entry', 'journal entries'] as const;
    waiting.push(`${count(j.revision, noun[0], noun[1])} back with students for revision`);
  }
  if (waiting.length > 0) sentences.push([plain(`I have ${joinList(waiting)}.`)]);

  const pendingRows = j.students
    .filter(r => r.pending > 0)
    .sort((a, b) => b.pending - a.pending);
  if (pendingRows.length > 0) {
    const items = pendingRows.slice(0, JOURNAL_DETAIL_LIMIT).map((r): Sentence => [
      studentName(r.student_id, r.name),
      plain(` (${r.pending > 1 ? `${r.section}, ${count(r.pending, 'entry', 'entries')}` : r.section})`),
    ]);
    const rest = pendingRows.length - items.length;
    if (rest > 0) items.push([plain(count(rest, 'other student'))]);
    sentences.push([
      plain(j.pending === 1 ? 'The pending entry is from ' : 'The pending entries are from '),
      ...joinSegments(items),
      plain('.'),
    ]);
  }

  const decided: string[] = [];
  if (j.approved) decided.push(`${count(j.approved, 'entry', 'entries')} ${verb(j.approved, 'has', 'have')} been approved`);
  if (j.rejected) decided.push(`${count(j.rejected, 'entry', 'entries')} ${verb(j.rejected, 'has', 'have')} been rejected`);
  if (decided.length > 0) sentences.push([plain(`Across my students' journals to date, ${joinList(decided)}.`)]);

  return sentences;
};

const companySentences = (p: DailyReportPayload): Sentence[] => {
  // The builder files unplaced students under a company_id-less "Not yet
  // deployed" row. Coverage already reports them; they are not a placement.
  const placed = p.companies.filter(c => c.company_id !== null && c.students > 0);
  if (placed.length === 0) return [];

  const sentences: Sentence[] = [
    [plain(`My students are placed with ${count(placed.length, 'company', 'companies')}.`)],
  ];
  const flagged = placed
    .filter(c => c.absent > 0 || c.incomplete > 0 || c.issues > 0)
    .sort((a, b) => (b.absent + b.incomplete + b.issues) - (a.absent + a.incomplete + a.issues));
  if (flagged.length > 0) {
    const named = flagged.slice(0, COMPANY_DETAIL_LIMIT).map(c => {
      const bits: string[] = [];
      if (c.absent) bits.push(`${c.absent} absent`);
      if (c.incomplete) bits.push(`${c.incomplete} incomplete`);
      if (c.issues) bits.push(`${c.issues} flagged`);
      return `${c.company} (${joinList(bits)})`;
    });
    const rest = flagged.length - named.length;
    sentences.push([plain(rest > 0
      ? `The ones with absences or flagged students are ${joinList(named)}, and ${count(rest, 'other company', 'other companies')} also ${verb(rest, 'has', 'have')} them.`
      : `The ${verb(named.length, 'one', 'ones')} with absences or flagged students ${verb(named.length, 'is', 'are')} ${joinList(named)}.`)]);
  }
  return sentences;
};

const exceptionSentences = (p: DailyReportPayload): Sentence[] => {
  // Already ranked and worded by the database; only danger is lifted first.
  const ordered = [
    ...p.alerts.filter(a => a.severity === 'danger'),
    ...p.alerts.filter(a => a.severity !== 'danger'),
  ];
  return ordered
    .map(a => a.message.trim())
    .filter(message => message.length > 0)
    .map(message => [plain(/[.!?]$/.test(message) ? message : `${message}.`)]);
};

/** The day as up to eight labelled paragraphs, each omitted when it has nothing to say. */
export const buildDailyNarrative = (
  payload: DailyReportPayload,
  options: NarrativeOptions = {},
): NarrativeParagraph[] => {
  const limit = options.attentionLimit ?? Number.POSITIVE_INFINITY;
  const built: Array<[Exclude<NarrativeParagraphId, 'closing'>, Sentence[]]> = [
    ['coverage', coverageSentences(payload)],
    ['attendance', attendanceSentences(payload)],
    ['attention', attentionSentences(payload, limit)],
    ['sil', silSentences(payload)],
    ['journals', journalSentences(payload)],
    ['companies', companySentences(payload)],
    ['exceptions', exceptionSentences(payload)],
  ];

  const paragraphs: NarrativeParagraph[] = built
    .filter(([, sentences]) => sentences.length > 0)
    .map(([id, sentences]) => ({ id, label: NARRATIVE_LABELS[id], segments: joinSentences(sentences) }));

  if (!paragraphs.some(p => p.id === 'attention' || p.id === 'exceptions')) {
    paragraphs.push({ id: 'closing', label: null, segments: [plain('Nothing else needs my attention today.')] });
  }
  return paragraphs;
};

const segmentText = (segment: NarrativeSegment): string =>
  segment.kind === 'text' ? segment.value
    : segment.kind === 'student' ? segment.name
      : `${segment.count} more`;

/** The same narrative as plain text — blank line between paragraphs, "Label: " prefix kept. */
export const narrativeToText = (paragraphs: NarrativeParagraph[]): string =>
  paragraphs
    .map(p => `${p.label ? `${p.label}: ` : ''}${p.segments.map(segmentText).join('')}`)
    .join('\n\n');

/** The adviser's saved text back into paragraphs for rendering. Splits on blank lines. */
export const textToParagraphs = (value: string): string[] =>
  value
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0);

/**
 * "Journals: I have…" -> `{ label: 'Journals', body: 'I have…' }`, so a saved
 * narrative keeps its quiet labels on screen. Only the labels this module
 * writes are recognised; any other "Word:" opening stays part of the body.
 */
export const splitNarrativeLabel = (paragraph: string): { label: string | null; body: string } => {
  for (const label of Object.values(NARRATIVE_LABELS)) {
    const prefix = `${label}:`;
    if (paragraph.startsWith(prefix)) {
      const body = paragraph.slice(prefix.length).trim();
      if (body) return { label, body };
    }
  }
  return { label: null, body: paragraph };
};

/** True when the figures were rebuilt after the adviser wrote their version. */
export const isNarrativeStale = (generatedAt: string, editedAt: string | null): boolean => {
  if (!editedAt) return false;
  const generated = Date.parse(generatedAt);
  const edited = Date.parse(editedAt);
  if (Number.isNaN(generated) || Number.isNaN(edited)) return false;
  return generated > edited;
};

/**
 * The printable form of the adviser's Automated Daily Report.
 *
 * ONE consolidated PDF for the adviser, never one per section — the document is
 * laid out exactly like the on-screen report: header, summary, students
 * requiring attention, section overview, attendance, OJT progress, journals,
 * companies, alerts.
 *
 * Rendered with html2pdf, which the project already depends on (see
 * waiverTemplate.ts, which uses the same approach and the same institutional
 * artwork). If html2pdf fails for any reason the report opens in a print window
 * instead, so an adviser is never left without a way to obtain it.
 *
 * Every value comes from the stored report payload. Nothing is recomputed here.
 */

import logoUrl from '../assets/ac-horizontal.webp';
import type {
  DailyReport,
  DailyReportPayload,
  ReportStudent,
} from '../services/adviserReportService';
import {
  formatClock,
  formatDelta,
  formatMinutes,
  formatReportDate,
  PROGRESS_LABELS,
  STATUS_LABELS,
} from './adviserReport';

/** How many detail rows the PDF carries per section before it summarises. */
const MAX_ATTENDANCE_ROWS = 400;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * The institutional logo as a data URL.
 *
 * Inlined rather than left as an `<img src>`: html2canvas rasterises the DOM at
 * capture time, so a URL can be captured before it loads and come out blank,
 * and the print window has no origin against which a relative URL resolves.
 */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    // The header falls back to the typeset school name, so a logo that fails to
    // load never blocks an export.
    return null;
  }
}

/**
 * The document's own stylesheet.
 *
 * Exported because the printable report is rendered in three places — the
 * html2pdf capture, the print-window fallback, and any preview of the layout —
 * and all three must use the same rules or the PDF stops matching what was
 * checked. It is plain print CSS: no theme variables, because the document is
 * always on white paper regardless of the portal's light/dark theme.
 */
export const REPORT_STYLE = `
  .dr-doc { width: 297mm; padding: 12mm 12mm 14mm; box-sizing: border-box;
            background: #fff; color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            font-size: 9.5px; line-height: 1.45; }
  .dr-head { display: flex; align-items: flex-start; justify-content: space-between;
             gap: 16px; padding-bottom: 8px; border-bottom: 2px solid #047857; }
  .dr-brand { display: flex; align-items: center; gap: 10px; }
  .dr-brand img { height: 34px; width: auto; }
  .dr-brand-name { font-size: 12px; font-weight: 700; color: #047857; letter-spacing: .2px; }
  .dr-brand-sub { font-size: 8.5px; color: #64748b; }
  .dr-title { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: .3px; text-align: right; }
  .dr-title span { display: block; font-size: 8.5px; font-weight: 600; color: #64748b;
                   letter-spacing: .08em; text-transform: uppercase; margin-top: 2px; }
  .dr-meta { display: flex; flex-wrap: wrap; gap: 4px 22px; margin: 8px 0 12px;
             font-size: 9px; color: #334155; }
  .dr-meta b { color: #0f172a; }
  /* html2pdf's default 'css' page-break mode reads these, which is what keeps a
     section or a table row from being cut in half by a page boundary. The
     legacy alias is there for the print-window fallback, where the browser's
     own paginator does the work. */
  .dr-section { margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
  .dr-section > h2 { margin: 0 0 5px; font-size: 10.5px; font-weight: 800;
                     letter-spacing: .06em; text-transform: uppercase; color: #047857; }
  .dr-cards { display: flex; flex-wrap: wrap; gap: 6px; }
  .dr-card { flex: 1 1 96px; min-width: 96px; padding: 6px 8px; border: 1px solid #e2e8f0;
             border-radius: 6px; background: #f8fafc; }
  .dr-card-label { font-size: 7.5px; font-weight: 700; letter-spacing: .06em;
                   text-transform: uppercase; color: #64748b; }
  .dr-card-value { font-size: 15px; font-weight: 800; line-height: 1.2; }
  .dr-card-sub { font-size: 7.5px; color: #64748b; }
  table.dr-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.dr-table th { padding: 4px 6px; text-align: left; font-size: 7.5px; font-weight: 700;
                      letter-spacing: .05em; text-transform: uppercase; color: #475569;
                      background: #f1f5f9; border: 1px solid #e2e8f0; }
  table.dr-table td { padding: 3.5px 6px; font-size: 8.5px; border: 1px solid #e2e8f0;
                      vertical-align: top; }
  table.dr-table tr { break-inside: avoid; page-break-inside: avoid; }
  table.dr-table thead { display: table-header-group; }
  .dr-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dr-tag { display: inline-block; padding: 1px 5px; border-radius: 999px;
            font-size: 7.5px; font-weight: 700; white-space: nowrap; }
  .dr-tag.is-danger  { background: #fee2e2; color: #b91c1c; }
  .dr-tag.is-warning { background: #fef3c7; color: #b45309; }
  .dr-tag.is-info    { background: #e0f2fe; color: #0369a1; }
  .dr-tag.is-ok      { background: #d1fae5; color: #047857; }
  .dr-tag.is-muted   { background: #f1f5f9; color: #64748b; }
  .dr-alerts { margin: 0; padding-left: 14px; }
  .dr-alerts li { margin-bottom: 2px; font-size: 9px; }
  .dr-note { margin: 4px 0 0; font-size: 8px; color: #64748b; font-style: italic; }
  .dr-foot { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0;
             font-size: 7.5px; color: #64748b; display: flex;
             justify-content: space-between; gap: 12px; }
  .dr-empty { padding: 6px 8px; font-size: 8.5px; color: #64748b;
              background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; }
`;

const statusTag = (status: ReportStudent['status']) => {
  const key = status ?? 'not_recorded';
  const tone = key === 'present' ? 'is-ok'
    : key === 'absent' ? 'is-danger'
      : key === 'incomplete' || key === 'late' ? 'is-warning'
        : key === 'on_leave' ? 'is-info' : 'is-muted';
  return `<span class="dr-tag ${tone}">${escapeHtml(STATUS_LABELS[key])}</span>`;
};

const clockCell = (value: string | null) => {
  if (!value) return '<span style="color:#94a3b8">—</span>';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '<span style="color:#94a3b8">—</span>'
    : escapeHtml(parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
};

const emptyRow = (message: string) => `<div class="dr-empty">${escapeHtml(message)}</div>`;

function summarySection(p: DailyReportPayload): string {
  const s = p.summary;
  const cards: Array<[string, string | number, string]> = [
    ['Sections', s.sections, 'Monitored'],
    ['Students', s.students, 'Monitored'],
    ['Present', s.present, `${s.attendance_rate}% attendance rate`],
    ['Absent', s.absent, 'Recorded absent'],
    ['Incomplete', s.incomplete, 'Logs not closed'],
    ['Not Recorded', s.not_recorded, 'No status yet'],
    ['Total Hours', formatMinutes(s.total_minutes), 'Rendered today'],
    ['Need Attention', s.attention, 'Require review'],
    ['Pending Journals', s.journals_pending, 'Awaiting approval'],
  ];
  return `<div class="dr-section">
    <h2>Overall Summary</h2>
    <div class="dr-cards">
      ${cards.map(([label, value, sub]) => `<div class="dr-card">
        <div class="dr-card-label">${escapeHtml(label)}</div>
        <div class="dr-card-value">${escapeHtml(value)}</div>
        <div class="dr-card-sub">${escapeHtml(sub)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function attentionSection(p: DailyReportPayload): string {
  if (p.attention.length === 0) {
    return `<div class="dr-section"><h2>Students Requiring Attention</h2>
      ${emptyRow('No student requires attention today.')}</div>`;
  }
  const rows = p.attention.map(a => `<tr>
    <td>${escapeHtml(a.name || '—')}</td>
    <td>${escapeHtml(a.section)}</td>
    <td>${escapeHtml(a.company || 'Not yet deployed')}</td>
    <td><span class="dr-tag ${a.priority <= 2 ? 'is-danger' : a.priority <= 5 ? 'is-warning' : 'is-info'}">${escapeHtml(a.issue || '—')}</span></td>
    <td>${escapeHtml(a.issues.slice(1).map(i => i.label).join(', ') || '—')}</td>
  </tr>`).join('');

  return `<div class="dr-section">
    <h2>Students Requiring Attention — ${p.attention.length}</h2>
    <table class="dr-table">
      <thead><tr><th>Student</th><th>Section</th><th>Company</th><th>Primary Issue</th><th>Also Flagged</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function sectionOverview(p: DailyReportPayload): string {
  if (p.sections.length === 0) {
    return `<div class="dr-section"><h2>Section Overview</h2>
      ${emptyRow('No sections are assigned to you.')}</div>`;
  }
  const rows = p.sections.map(s => `<tr>
    <td>${escapeHtml(s.section)}</td>
    <td class="dr-num">${s.students}</td>
    <td class="dr-num">${s.present}</td>
    <td class="dr-num">${s.absent}</td>
    <td class="dr-num">${s.incomplete}</td>
    <td class="dr-num">${s.not_recorded}</td>
    <td class="dr-num">${escapeHtml(formatMinutes(s.avg_minutes))}</td>
    <td class="dr-num">${s.issues}</td>
  </tr>`).join('');

  return `<div class="dr-section">
    <h2>Section Overview</h2>
    <table class="dr-table">
      <thead><tr><th>Section</th><th class="dr-num">Students</th><th class="dr-num">Present</th>
      <th class="dr-num">Absent</th><th class="dr-num">Incomplete</th><th class="dr-num">Not Recorded</th>
      <th class="dr-num">Avg Hours</th><th class="dr-num">Issues</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function attendanceSection(p: DailyReportPayload): string {
  if (p.students.length === 0) {
    return `<div class="dr-section"><h2>Attendance</h2>
      ${emptyRow('There are no students in your assigned sections.')}</div>`;
  }
  const shown = p.students.slice(0, MAX_ATTENDANCE_ROWS);
  const rows = shown.map(s => `<tr>
    <td>${escapeHtml(s.name || '—')}</td>
    <td>${escapeHtml(s.section)}</td>
    <td>${escapeHtml(s.company || '—')}</td>
    <td class="dr-num">${clockCell(s.clock_in)}</td>
    <td class="dr-num">${clockCell(s.clock_out)}</td>
    <td class="dr-num">${escapeHtml(formatMinutes(s.day_minutes))}</td>
    <td>${statusTag(s.status)}</td>
    <td>${escapeHtml(s.issues.map(i => i.label).join(', ') || '—')}</td>
  </tr>`).join('');

  const truncated = p.students.length > shown.length
    ? `<p class="dr-note">Showing the first ${shown.length} of ${p.students.length} students. The full roster is in the portal.</p>`
    : '';

  return `<div class="dr-section">
    <h2>Attendance — ${formatReportDate(p.report_date)}</h2>
    <table class="dr-table">
      <thead><tr><th>Student</th><th>Section</th><th>Company</th><th class="dr-num">Clock In</th>
      <th class="dr-num">Clock Out</th><th class="dr-num">Hours</th><th>Status</th><th>Flags</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${truncated}
  </div>`;
}

function ojtSection(p: DailyReportPayload): string {
  const o = p.ojt;
  const cards: Array<[string, number, string]> = [
    ['On Track', o.on_track, 'Meeting expected progress'],
    ['Completed', o.completed, 'Required hours met'],
    ['Needs Monitoring', o.monitoring, 'Slightly behind'],
    ['Behind', o.behind, 'More than a day behind'],
    ['Not Started', o.not_started, 'No hours logged yet'],
  ];

  const behind = o.students_behind.length === 0
    ? emptyRow('No student is behind expected OJT progress.')
    : `<table class="dr-table">
        <thead><tr><th>Student</th><th>Section</th><th>Company</th><th class="dr-num">Required</th>
        <th class="dr-num">Rendered</th><th class="dr-num">Expected</th><th class="dr-num">Difference</th>
        <th class="dr-num">Complete</th></tr></thead>
        <tbody>${o.students_behind.map(b => `<tr>
          <td>${escapeHtml(b.name || '—')}</td>
          <td>${escapeHtml(b.section)}</td>
          <td>${escapeHtml(b.company || '—')}</td>
          <td class="dr-num">${b.required_hours}h</td>
          <td class="dr-num">${escapeHtml(formatMinutes(b.rendered_minutes))}</td>
          <td class="dr-num">${escapeHtml(formatMinutes(b.expected_minutes))}</td>
          <td class="dr-num"><span class="dr-tag is-danger">${escapeHtml(formatDelta(b.delta_minutes))}</span></td>
          <td class="dr-num">${b.completion_pct}%</td>
        </tr>`).join('')}</tbody>
      </table>`;

  return `<div class="dr-section">
    <h2>OJT Progress</h2>
    <div class="dr-cards">
      ${cards.map(([label, value, sub]) => `<div class="dr-card">
        <div class="dr-card-label">${escapeHtml(label)}</div>
        <div class="dr-card-value">${value}</div>
        <div class="dr-card-sub">${escapeHtml(sub)}</div>
      </div>`).join('')}
    </div>
    <h2 style="margin-top:8px">Students Behind Expected Progress</h2>
    ${behind}
    <p class="dr-note">Expected hours are ${p.settings.daily_limit_minutes / 60} hours per OJT working day
    from a student's first logged day through ${formatReportDate(p.settings.expected_through)},
    capped at their required hours. A day still in progress is never counted.</p>
  </div>`;
}

function journalSection(p: DailyReportPayload): string {
  const j = p.journals;
  const cards: Array<[string, number, string]> = [
    ['Submitted Today', j.submitted_today, 'Entries created today'],
    ['For This Date', j.entries_for_date, 'Covering the report date'],
    ['Pending Approval', j.pending, 'Across all sections'],
    ['Approved', j.approved, 'All time'],
    ['Rejected', j.rejected, 'All time'],
    ['Revision Required', j.revision, 'Awaiting the student'],
  ];

  const rows = j.students.length === 0
    ? emptyRow('No journal activity to report.')
    : `<table class="dr-table">
        <thead><tr><th>Student</th><th>Section</th><th class="dr-num">Pending</th>
        <th class="dr-num">Revision</th><th class="dr-num">Rejected</th>
        <th class="dr-num">Submitted Today</th><th>Last Entry</th></tr></thead>
        <tbody>${j.students.map(s => `<tr>
          <td>${escapeHtml(s.name || '—')}</td>
          <td>${escapeHtml(s.section)}</td>
          <td class="dr-num">${s.pending}</td>
          <td class="dr-num">${s.revision}</td>
          <td class="dr-num">${s.rejected}</td>
          <td class="dr-num">${s.submitted_today}</td>
          <td>${escapeHtml(s.last_entry_date ? formatReportDate(s.last_entry_date) : '—')}</td>
        </tr>`).join('')}</tbody>
      </table>`;

  return `<div class="dr-section">
    <h2>Journal Activity</h2>
    <div class="dr-cards">
      ${cards.map(([label, value, sub]) => `<div class="dr-card">
        <div class="dr-card-label">${escapeHtml(label)}</div>
        <div class="dr-card-value">${value}</div>
        <div class="dr-card-sub">${escapeHtml(sub)}</div>
      </div>`).join('')}
    </div>
    ${rows}
  </div>`;
}

function companySection(p: DailyReportPayload): string {
  if (p.companies.length === 0) {
    return `<div class="dr-section"><h2>Company Monitoring</h2>
      ${emptyRow('No companies to report.')}</div>`;
  }
  const rows = p.companies.map(c => `<tr>
    <td>${escapeHtml(c.company)}</td>
    <td class="dr-num">${c.students}</td>
    <td class="dr-num">${c.present}</td>
    <td class="dr-num">${c.absent}</td>
    <td class="dr-num">${c.incomplete}</td>
    <td class="dr-num">${escapeHtml(formatMinutes(c.avg_minutes))}</td>
    <td class="dr-num">${c.issues}</td>
  </tr>`).join('');

  return `<div class="dr-section">
    <h2>Company Monitoring</h2>
    <table class="dr-table">
      <thead><tr><th>Company</th><th class="dr-num">Students</th><th class="dr-num">Present</th>
      <th class="dr-num">Absent</th><th class="dr-num">Incomplete</th><th class="dr-num">Avg Hours</th>
      <th class="dr-num">Issues</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function alertSection(p: DailyReportPayload): string {
  if (p.alerts.length === 0) {
    return `<div class="dr-section"><h2>Alerts &amp; Exceptions</h2>
      ${emptyRow('No exceptions were detected today.')}</div>`;
  }
  return `<div class="dr-section">
    <h2>Alerts &amp; Exceptions</h2>
    <ul class="dr-alerts">
      ${p.alerts.map(a => `<li>${escapeHtml(a.message)}</li>`).join('')}
    </ul>
  </div>`;
}

/** The whole document body, without the page wrapper. */
export function buildDailyReportHtml(report: DailyReport, logo: string | null): string {
  const p = report.report;
  const adviserName = p.adviser.name || 'Section Adviser';

  return `<div class="dr-doc">
    <div class="dr-head">
      <div class="dr-brand">
        ${/* The wordmark below already names the school, so a missing logo
              leaves a gap rather than repeating it. */
          logo ? `<img src="${logo}" alt="Asian College">` : ''}
        <div>
          <div class="dr-brand-name">Asian College — Dumaguete</div>
          <div class="dr-brand-sub">SIL / OJT Monitoring System</div>
        </div>
      </div>
      <h1 class="dr-title">Daily SIL/OJT Monitoring Report<span>Section Adviser Report</span></h1>
    </div>

    <div class="dr-meta">
      <div><b>Adviser:</b> ${escapeHtml(adviserName)}${p.adviser.adviser_type ? ` (${escapeHtml(p.adviser.adviser_type)})` : ''}</div>
      <div><b>Date:</b> ${escapeHtml(formatReportDate(p.report_date))}</div>
      <div><b>Sections Monitored:</b> ${report.sections_count}</div>
      <div><b>Students Monitored:</b> ${report.students_count}</div>
      <div><b>Generated:</b> ${escapeHtml(formatClock(report.generated_at))} (${escapeHtml(p.time_zone)})</div>
    </div>

    ${summarySection(p)}
    ${attentionSection(p)}
    ${sectionOverview(p)}
    ${attendanceSection(p)}
    ${ojtSection(p)}
    ${journalSection(p)}
    ${companySection(p)}
    ${alertSection(p)}

    <div class="dr-foot">
      <span>Generated by the Asian College SIL/OJT Monitoring System for ${escapeHtml(adviserName)}.</span>
      <span>Confidential — for the named adviser's use.</span>
    </div>
  </div>`;
}

export const dailyReportFilename = (report: DailyReport): string =>
  `SIL-OJT-Daily-Report-${report.report_date}.pdf`;

/** Progress statuses in a stable order, exported for the legend in the UI. */
export const PROGRESS_ORDER = Object.keys(PROGRESS_LABELS) as Array<keyof typeof PROGRESS_LABELS>;

/**
 * Download the report as ONE consolidated A4-landscape PDF.
 *
 * Landscape because the attendance and section tables are wide; portrait would
 * force either a smaller type size or a horizontal split across pages.
 */
export async function downloadDailyReportPdf(report: DailyReport): Promise<void> {
  const host = document.createElement('div');
  // Off-screen rather than hidden: html2canvas cannot rasterise display:none.
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:297mm;background:#fff;';
  const logo = await loadLogoDataUrl();
  host.innerHTML = `<style>${REPORT_STYLE}</style>${buildDailyReportHtml(report, logo)}`;
  document.body.appendChild(host);

  const doc = host.querySelector<HTMLElement>('.dr-doc');

  try {
    const { default: html2pdf } = await import('html2pdf.js');
    await html2pdf()
      .set({
        margin: 0,
        filename: dailyReportFilename(report),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      })
      .from(doc ?? host)
      .save();
  } catch (error) {
    console.error('Falling back to the print view for the daily report:', error);
    openDailyReportForPrinting(report, logo);
  } finally {
    host.remove();
  }
}

/** Open the report in a new tab, ready to print. */
export function openDailyReportForPrinting(report: DailyReport, logo: string | null): void {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return;
  win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(`Daily SIL/OJT Report — ${formatReportDate(report.report_date)}`)}</title>
<style>@page { size: A4 landscape; margin: 0; } body { margin: 0; background: #fff; }
${REPORT_STYLE}</style></head><body>${buildDailyReportHtml(report, logo)}</body></html>`);
  win.document.close();
  win.focus();
  // Give the layout a beat to settle before the print dialog appears.
  window.setTimeout(() => win.print(), 350);
}

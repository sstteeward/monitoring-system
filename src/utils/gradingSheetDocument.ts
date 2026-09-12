/**
 * The Official Grading Sheet as a printed document.
 *
 * This is the institutional artefact, not the portal: it reproduces the school's
 * paper form — letterhead, the Subject Code / Instructor block, the bordered
 * grade table, "- Nothing follows -", and the Prepared / Verified / Noted
 * signature blocks. The adviser's on-screen editor deliberately looks nothing
 * like it.
 *
 * Rendered with html2pdf, the same approach the Automated Daily Report uses
 * (see adviserReportPdf.ts), with a print-window fallback so an adviser is
 * never left without a way to obtain the document.
 *
 * Every value comes from the stored sheet. Nothing is recalculated here — in
 * particular the remarks are the ones the database derived, so the printed
 * record and the stored record can never disagree.
 */

import logoUrl from '../assets/ac-horizontal.webp';
import type { GradingSheet, GradingSheetItem } from '../services/gradingService';
import { formatGrade } from './grading';

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
export async function loadLogoDataUrl(): Promise<string | null> {
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
        // The header falls back to the typeset school name, so a logo that fails
        // to load never blocks an export.
        return null;
    }
}

/**
 * The document's own stylesheet.
 *
 * Exported because the sheet is rendered in three places — the on-screen
 * preview, the html2pdf capture and the print-window fallback — and all three
 * must use the same rules or the PDF stops matching what was checked. Plain
 * print CSS with no theme variables: the document is always black on white
 * paper, whatever theme the portal is in.
 */
export const GRADING_SHEET_STYLE = `
  .gs-doc { width: 210mm; min-height: 297mm; padding: 14mm 14mm 12mm; box-sizing: border-box;
            background: #fff; color: #000;
            font-family: 'Times New Roman', Times, Georgia, serif;
            font-size: 10.5px; line-height: 1.35; }
  .gs-letterhead { text-align: center; padding-bottom: 6px; border-bottom: 2px solid #000; }
  .gs-letterhead img { height: 42px; width: auto; }
  .gs-school { font-size: 15px; font-weight: 700; letter-spacing: .04em; }
  .gs-tagline { font-size: 8.5px; font-style: italic; color: #333; }
  .gs-address { font-size: 8.5px; color: #333; margin-top: 1px; }
  .gs-title { text-align: center; font-size: 13px; font-weight: 700; letter-spacing: .12em;
              text-transform: uppercase; margin: 9px 0 8px; }

  /* The information block: two columns of label/value pairs, boxed like the
     printed form. */
  .gs-info { display: flex; gap: 8mm; margin-bottom: 8px; }
  .gs-info-col { flex: 1; }
  table.gs-info-table { width: 100%; border-collapse: collapse; }
  table.gs-info-table td { padding: 2.5px 5px; font-size: 10px; border: 1px solid #000;
                           vertical-align: middle; }
  table.gs-info-table td.gs-label { width: 42%; text-align: right; font-weight: 600;
                                    background: #f2f2f2; white-space: nowrap; }
  table.gs-info-table td.gs-value { font-weight: 700; text-transform: uppercase; }

  table.gs-grades { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.gs-grades th { border: 1px solid #000; padding: 4px 5px; font-size: 9.5px;
                       font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
                       background: #e9e9e9; text-align: center; }
  table.gs-grades td { border: 1px solid #000; padding: 3px 5px; font-size: 10px;
                       vertical-align: middle; }
  /* Repeat the header on every page when the roster spills over. */
  table.gs-grades thead { display: table-header-group; }
  table.gs-grades tr { break-inside: avoid; page-break-inside: avoid; }
  .gs-c-num    { width: 7%;  text-align: center; }
  .gs-c-sno    { width: 20%; text-align: center; font-variant-numeric: tabular-nums; }
  .gs-c-name   { width: 41%; text-transform: uppercase; }
  .gs-c-grade  { width: 12%; text-align: center; font-weight: 700;
                 font-variant-numeric: tabular-nums; }
  .gs-c-remark { width: 20%; text-align: center; font-weight: 600; letter-spacing: .04em; }
  .gs-blank { color: #666; font-style: italic; font-weight: 400; letter-spacing: 0; }
  .gs-nothing { text-align: center; font-style: italic; font-size: 9.5px; letter-spacing: .06em; }

  .gs-signatures { margin-top: 14px; display: flex; gap: 6mm;
                   break-inside: avoid; page-break-inside: avoid; }
  .gs-sig { flex: 1; border: 1px solid #000; padding: 6px 8px 8px; }
  .gs-sig-caption { font-size: 9px; font-weight: 700; margin-bottom: 20px; }
  .gs-sig-line { border-top: 1px solid #000; padding-top: 2px; text-align: center; }
  .gs-sig-name { font-size: 10px; font-weight: 700; text-transform: uppercase; min-height: 12px; }
  .gs-sig-role { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #333; }
  .gs-sig-date { margin-top: 10px; font-size: 8.5px; }

  .gs-foot { margin-top: 10px; padding-top: 4px; border-top: 1px solid #999;
             display: flex; justify-content: space-between; gap: 10px;
             font-size: 7.5px; color: #444; }
  .gs-watermark { margin-top: 6px; text-align: center; font-size: 8px; letter-spacing: .08em;
                  text-transform: uppercase; color: #666; }
`;

const SEMESTER_WORDS: Record<string, string> = {
    FIRST: 'FIRST',
    SECOND: 'SECOND',
    SUMMER: 'SUMMER',
};

/** dd Month yyyy, or a blank rule for a signature that has not been given yet. */
function signatureDate(value: string | null | undefined): string {
    if (!value) return '____________________';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '____________________';
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** One student row of the grade table. */
function gradeRow(item: GradingSheetItem, index: number): string {
    const grade = formatGrade(item.final_grade);
    return `<tr>
    <td class="gs-c-num">${index + 1}</td>
    <td class="gs-c-sno">${escapeHtml(item.student_number || '—')}</td>
    <td class="gs-c-name">${escapeHtml(item.student_name || '—')}</td>
    <td class="gs-c-grade">${grade ? escapeHtml(grade) : '<span class="gs-blank">—</span>'}</td>
    <td class="gs-c-remark">${item.remarks ? escapeHtml(item.remarks) : '<span class="gs-blank">Not yet graded</span>'}</td>
  </tr>`;
}

export interface GradingSheetDocumentOptions {
    /** Watermark an unfinalized sheet so a draft print is never mistaken for the record. */
    showDraftNotice?: boolean;
}

/**
 * The whole document body, without the page wrapper.
 *
 * "- Nothing follows -" is appended once, after the last student, and never in
 * the middle: it is a single row at the end of the one table, so a roster that
 * runs onto a second page still carries the marker only at its true end.
 */
export function buildGradingSheetHtml(
    sheet: GradingSheet,
    logo: string | null,
    options: GradingSheetDocumentOptions = {},
): string {
    const term = SEMESTER_WORDS[sheet.school_year.semester] || sheet.school_year.semester;
    const adviserName = sheet.adviser?.name?.trim() || '';
    const isFinal = sheet.status === 'finalized';
    const showDraftNotice = options.showDraftNotice ?? !isFinal;

    const rows = sheet.items.map(gradeRow).join('');

    return `<div class="gs-doc">
    <div class="gs-letterhead">
      ${logo
        ? `<img src="${logo}" alt="Asian College">`
        : `<div class="gs-school">ASIAN COLLEGE</div>`}
      ${logo ? '' : `<div class="gs-tagline">Developing Leaders in IT and Management</div>`}
      <div class="gs-address">Dumaguete City, Negros Oriental</div>
    </div>

    <div class="gs-title">Official Grading Sheet</div>

    <div class="gs-info">
      <div class="gs-info-col">
        <table class="gs-info-table">
          <tbody>
            <tr><td class="gs-label">Subject Code:</td><td class="gs-value">${escapeHtml(sheet.subject_code)}</td></tr>
            <tr><td class="gs-label">Course Description:</td><td class="gs-value">${escapeHtml(sheet.course_description)}</td></tr>
            <tr><td class="gs-label">School Year:</td><td class="gs-value">${escapeHtml(sheet.school_year.school_year)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="gs-info-col">
        <table class="gs-info-table">
          <tbody>
            <tr><td class="gs-label">Instructor:</td><td class="gs-value">${escapeHtml(adviserName || '—')}</td></tr>
            <tr><td class="gs-label">Section:</td><td class="gs-value">${escapeHtml(sheet.section.name)}</td></tr>
            <tr><td class="gs-label">Semester:</td><td class="gs-value">${escapeHtml(term)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <table class="gs-grades">
      <thead>
        <tr>
          <th class="gs-c-num">Cnt</th>
          <th class="gs-c-sno">Student No.</th>
          <th class="gs-c-name">Name</th>
          <th class="gs-c-grade">Final Grades</th>
          <th class="gs-c-remark">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td class="gs-nothing" colspan="5">No students are enrolled in this section.</td></tr>`}
        ${sheet.items.length > 0
        ? `<tr><td class="gs-nothing" colspan="5">- Nothing follows -</td></tr>`
        : ''}
      </tbody>
    </table>

    <div class="gs-signatures">
      <div class="gs-sig">
        <div class="gs-sig-caption">Prepared &amp; Certified Correct by:</div>
        <div class="gs-sig-line">
          <div class="gs-sig-name">${escapeHtml(adviserName)}</div>
          <div class="gs-sig-role">Adviser / Subject Instructor</div>
        </div>
        <div class="gs-sig-date">Date: ${escapeHtml(signatureDate(sheet.submitted_at))}</div>
      </div>
      <div class="gs-sig">
        <div class="gs-sig-caption">Verified:</div>
        <div class="gs-sig-line">
          <div class="gs-sig-name">${escapeHtml(sheet.verified_by_name || '')}</div>
          <div class="gs-sig-role">Diploma Program Coordinator</div>
        </div>
        <div class="gs-sig-date">Date: ${escapeHtml(signatureDate(sheet.verified_at))}</div>
      </div>
      <div class="gs-sig">
        <div class="gs-sig-caption">Noted:</div>
        <div class="gs-sig-line">
          <div class="gs-sig-name"></div>
          <div class="gs-sig-role">Dean / Academic Head</div>
        </div>
        <div class="gs-sig-date">Date: ____________________</div>
      </div>
    </div>

    ${showDraftNotice
        ? `<div class="gs-watermark">Unofficial copy — this grading sheet is ${escapeHtml(
            sheet.status.replace('_', ' '),
        )} and has not been finalized.</div>`
        : ''}

    <div class="gs-foot">
      <span>${escapeHtml(sheet.section.name)} · ${escapeHtml(sheet.school_year.school_year)} · ${escapeHtml(term)} Semester · ${sheet.items.length} student${sheet.items.length === 1 ? '' : 's'}</span>
      <span>Asian College SIL Monitoring System</span>
    </div>
  </div>`;
}

export const gradingSheetFilename = (sheet: GradingSheet): string =>
    `Official-Grading-Sheet-${sheet.section.name}-${sheet.school_year.school_year}-${sheet.school_year.semester}.pdf`;

const documentTitle = (sheet: GradingSheet): string =>
    `Official Grading Sheet — ${sheet.section.name} (${sheet.school_year.school_year} ${sheet.school_year.semester})`;

/**
 * Download the sheet as an A4 portrait PDF.
 *
 * Portrait and A4 because that is the paper the registrar files. html2pdf's
 * default break mode ('css' plus the legacy rules) reads the `break-inside`
 * declarations above, which is what keeps a student row, and the signature
 * block, from being cut in half by a page boundary;
 * `thead { display: table-header-group }` repeats the column headers on every
 * page of a long roster.
 */
export async function downloadGradingSheetPdf(sheet: GradingSheet): Promise<void> {
    const host = document.createElement('div');
    // Off-screen rather than hidden: html2canvas cannot rasterise display:none.
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;';
    const logo = await loadLogoDataUrl();
    host.innerHTML = `<style>${GRADING_SHEET_STYLE}</style>${buildGradingSheetHtml(sheet, logo)}`;
    document.body.appendChild(host);

    const doc = host.querySelector<HTMLElement>('.gs-doc');

    try {
        const { default: html2pdf } = await import('html2pdf.js');
        await html2pdf()
            .set({
                margin: 0,
                filename: gradingSheetFilename(sheet),
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            })
            .from(doc ?? host)
            .save();
    } catch (error) {
        console.error('Falling back to the print view for the grading sheet:', error);
        openGradingSheetForPrinting(sheet, logo);
    } finally {
        host.remove();
    }
}

/**
 * Open the sheet in a new tab, ready to print.
 *
 * The page number footer is produced by the browser's own paginator rather than
 * drawn into the document, so it stays correct however the roster paginates.
 */
export function openGradingSheetForPrinting(sheet: GradingSheet, logo: string | null): void {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(documentTitle(sheet))}</title>
<style>
@page { size: A4 portrait; margin: 0; }
body { margin: 0; background: #fff; }
${GRADING_SHEET_STYLE}
</style></head><body>${buildGradingSheetHtml(sheet, logo)}</body></html>`);
    win.document.close();
    win.focus();
    // Give the layout a beat to settle before the print dialog appears.
    window.setTimeout(() => win.print(), 350);
}

/** Print the sheet, loading the logo first so the letterhead is never blank. */
export async function printGradingSheet(sheet: GradingSheet): Promise<void> {
    const logo = await loadLogoDataUrl();
    openGradingSheetForPrinting(sheet, logo);
}

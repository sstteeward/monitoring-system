/**
 * The official Parent's Clearance & Waiver form.
 *
 * The certification, safety-protocol, waiver, notes and school footer text below
 * is the school's official wording, reproduced verbatim. Only the line breaks
 * differ: the source copy wrapped mid-sentence to fit its printed column, so the
 * sentences are joined here and left to wrap naturally. Do not paraphrase,
 * shorten or re-order any of it.
 *
 * The student's own details are filled in from their account where the system
 * already knows them. Every signature, printed name and date line is left blank —
 * this is a print-and-sign workflow, and nothing about a signature is ever
 * generated.
 */

export const WAIVER_FORM_TITLE = "Parent's Clearance and Waiver Form";
export const WAIVER_FORM_FILENAME = 'Parents-Clearance-and-Waiver-Form.pdf';

/** What the system already knows about the student, used to pre-fill the form. */
export interface WaiverFormData {
    studentName?: string | null;
    companyName?: string | null;
    course?: string | null;
    section?: string | null;
}

/**
 * The institutional Asian College logo, served from `public/`.
 *
 * Drop the official artwork in as `public/asian-college-logo.png` (or .jpg /
 * .svg) and the form picks it up automatically. Until then the header falls back
 * to the typeset school name, so the form is never blocked on the asset and
 * never prints a broken-image box.
 */
const LOGO_CANDIDATES = [
    '/asian-college-logo.png',
    '/asian-college-logo.jpg',
    '/asian-college-logo.svg',
];

/**
 * Fetch the logo as a data URL.
 *
 * html2canvas rasterises whatever is in the DOM at capture time, so a plain
 * `<img src>` can be captured before it finishes loading and silently come out
 * blank. Inlining the bytes first removes that race.
 */
async function loadLogoDataUrl(): Promise<string | null> {
    for (const url of LOGO_CANDIDATES) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) continue;
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        } catch {
            // Try the next candidate; a missing logo is not an error.
        }
    }
    return null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * An inline blank the school fills in by hand, pre-filled when the system knows
 * the value. `placeholder` is the bracketed label from the official form, shown
 * only when there is nothing to fill in.
 */
function inlineField(value: string | null | undefined, placeholder: string, width: string): string {
    const text = value?.trim()
        ? `<strong>${escapeHtml(value.trim())}</strong>`
        : `<span class="wv-ph">${escapeHtml(placeholder)}</span>`;
    return `<span class="wv-fill" style="min-width:${width}">${text}</span>`;
}

/**
 * A4 page, print-first styling. Rendered off-screen and captured to PDF, so the
 * sizing is fixed in millimetres rather than viewport units.
 */
const WAIVER_FORM_STYLE = `
  .wv-page {
    width: 210mm;
    height: 297mm;
    padding: 12mm 16mm;
    box-sizing: border-box;
    background: #ffffff;
    color: #111827;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10pt;
    line-height: 1.5;
  }
  .wv-head { text-align: center; border-bottom: 2px solid #047857; padding-bottom: 7px; margin-bottom: 9px; }
  .wv-logo { display: block; height: 16mm; width: auto; max-width: 96mm; margin: 0 auto 4px; }
  .wv-school { font-size: 15pt; font-weight: 700; letter-spacing: .5px; color: #065f46; margin: 0; }
  .wv-sub { font-size: 8.5pt; color: #4b5563; margin: 1px 0 0; }
  .wv-title { font-size: 12pt; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; margin: 10px 0 3px; text-align: center; }
  .wv-title-rule { width: 64px; height: 2px; background: #047857; margin: 0 auto 10px; }
  .wv-details { display: flex; flex-wrap: wrap; gap: 3px 18px; margin-bottom: 11px; padding: 7px 10px; border: 1px solid #d1d5db; background: #f9fafb; font-size: 8.5pt; }
  .wv-details div { min-width: 45%; }
  .wv-details b { color: #4b5563; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
  .wv-p { margin: 0 0 9px; text-align: justify; }
  .wv-fill { display: inline-block; border-bottom: 1px solid #111827; text-align: center; padding: 0 4px; }
  .wv-ph { color: #6b7280; font-size: 8.5pt; letter-spacing: .3px; }
  .wv-block-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #065f46; border-bottom: 1px solid #047857; padding-bottom: 2px; margin: 12px 0 7px; }
  .wv-sign-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 9px; font-size: 9.5pt; }
  .wv-sign-row span { white-space: nowrap; }
  .wv-sign-row i { flex: 1; display: block; border-bottom: 1px solid #111827; height: 15px; font-style: normal; }
  .wv-notes { margin-top: 11px; border: 1px solid #d1d5db; background: #f9fafb; padding: 8px 11px; font-size: 8.5pt; }
  .wv-notes-title { font-weight: 700; margin: 0 0 4px; color: #065f46; text-transform: uppercase; letter-spacing: .4px; }
  .wv-notes ol { margin: 0; padding-left: 16px; }
  .wv-notes li { margin-bottom: 3px; text-align: justify; }
  .wv-notes p { margin: 5px 0 0; text-align: justify; }
  .wv-footer { margin-top: 10px; padding-top: 7px; border-top: 1px solid #d1d5db; display: flex; gap: 12px; font-size: 7.5pt; color: #374151; }
  .wv-footer > div { flex: 1; }
  .wv-footer b { display: block; color: #065f46; font-size: 7.5pt; letter-spacing: .5px; margin-bottom: 2px; }
  .wv-footer em { font-style: italic; }
`;

function buildBody(data: WaiverFormData = {}, logo?: string | null): string {
    const student = inlineField(data.studentName, '[NAME OF STUDENT]', '58mm');
    // The certification names the student twice; both are filled from the account.
    const studentAgain = inlineField(data.studentName, '[NAME OF STUDENT]', '52mm');
    const company = inlineField(data.companyName, '[NAME OF COMPANY / TRAINING ESTABLISHMENT]', '72mm');

    const detail = (label: string, value: string | null | undefined) =>
        `<div><b>${label}:</b> ${value?.trim() ? escapeHtml(value.trim()) : '—'}</div>`;

    return `
<div class="wv-page">
  <div class="wv-head">
    ${logo
        ? `<img class="wv-logo" src="${logo}" alt="Asian College">`
        : '<p class="wv-school">ASIAN COLLEGE</p>'}
    <p class="wv-sub">Dumaguete City, Negros Oriental</p>
    <p class="wv-sub">Supervised Industry Learning (SIL) / On-the-Job Training Program</p>
  </div>

  <div class="wv-title">Parent's Clearance and Waiver Form</div>
  <div class="wv-title-rule"></div>

  <div class="wv-details">
    ${detail('Student', data.studentName)}
    ${detail('SIL/OJT Company', data.companyName)}
    ${detail('Course / Program', data.course)}
    ${detail('Section', data.section)}
  </div>

  <p class="wv-p">
    This is to certify that I am allowing ${student} to undergo a
    <strong>SUPERVISED INDUSTRY LEARNING</strong> at ${company}
  </p>

  <p class="wv-p">
    It is understood that ${studentAgain} will follow the safety protocols needed to avoid any
    unwanted incident or transmitted infection.
  </p>

  <p class="wv-p">
    I fully agree to waive any responsibility on the part of Asian College Dumaguete in case of any
    untoward incident that may happen to the Student in the duration of the <strong>INTERNSHIP</strong>.
  </p>

  <div class="wv-block-label">Student</div>
  <div class="wv-sign-row"><span>Signature:</span><i></i></div>
  <div class="wv-sign-row"><span>Name of the Student:</span><i></i></div>
  <div class="wv-sign-row"><span>Date Signed:</span><i></i></div>

  <div class="wv-block-label">Parent / Guardian</div>
  <div class="wv-sign-row"><span>Signature:</span><i></i></div>
  <div class="wv-sign-row"><span>Name of Signatory:</span><i></i></div>
  <div class="wv-sign-row"><span>Relationship of Signatory to Intern:</span><i></i></div>
  <div class="wv-sign-row"><span>Date Signed:</span><i></i></div>

  <div class="wv-notes">
    <p class="wv-notes-title">Important Notes</p>
    <ol>
      <li>The signature/s in this document must match the signatures of the parents on file.</li>
      <li>In the event that a parent cannot sign the waiver form, it must be signed by the legitimate guardian, as evidenced by the letter of guardianship on file.</li>
      <li>This document must be dated, signed and submitted within the week of practice.</li>
    </ol>
    <p>One copy shall be given to the DIPLOMA PROGRAM department, while the other copy must be kept by the parent/guardian.</p>
  </div>

  <div class="wv-footer">
    <div><b>Vision</b><em>&ldquo;To be the leading educational Institution of choice dedicated to the Success of its graduates&rdquo;</em></div>
    <div><b>Mission</b><em>&ldquo;To educate and develop globally competitive future teachers&rdquo;</em></div>
    <div><b>Core Values</b>Self-Leadership<br>Integrity<br>Academic Excellence</div>
  </div>
</div>
`;
}

/** The complete form as a standalone HTML document, used for the print fallback. */
export function buildWaiverFormHtml(data: WaiverFormData = {}, logo?: string | null): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${WAIVER_FORM_TITLE}</title>
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; background: #e5e7eb; }
  @media print { body { background: #fff; } .wv-page { box-shadow: none; } }
  ${WAIVER_FORM_STYLE}
</style></head>
<body>${buildBody(data, logo ?? LOGO_CANDIDATES[0])}</body></html>`;
}

/**
 * Download the blank form as a PDF, pre-filled with the student's details.
 *
 * Rendered with html2pdf, which the project already depends on. If that fails
 * for any reason the form is opened in a print window instead, so a student is
 * never left without a way to obtain it.
 */
export async function downloadWaiverForm(data: WaiverFormData = {}): Promise<void> {
    const host = document.createElement('div');
    // Off-screen rather than hidden: html2canvas cannot rasterise display:none.
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;';
    const logo = await loadLogoDataUrl();
    host.innerHTML = `<style>${WAIVER_FORM_STYLE}</style>${buildBody(data, logo)}`;
    document.body.appendChild(host);

    try {
        const { default: html2pdf } = await import('html2pdf.js');
        await html2pdf()
            .set({
                margin: 0,
                filename: WAIVER_FORM_FILENAME,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            })
            .from(host.querySelector<HTMLElement>('.wv-page') ?? host)
            .save();
    } catch (error) {
        console.error('Falling back to the print view for the waiver form:', error);
        openWaiverFormForPrinting(data);
    } finally {
        host.remove();
    }
}

/** Open the form in a new tab, ready to print. */
export function openWaiverFormForPrinting(data: WaiverFormData = {}): void {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.write(buildWaiverFormHtml(data));
    win.document.close();
    win.focus();
    // Give the layout a beat to settle before the print dialog appears.
    window.setTimeout(() => win.print(), 350);
}

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

import logoUrl from '../assets/ac-horizontal.webp';

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
 * Fetch the institutional logo as a data URL.
 *
 * The artwork is imported through the bundler rather than read from a public
 * path, so it is content-hashed and cannot go missing in a deployed build.
 *
 * It is inlined rather than left as an `<img src>` for two reasons: html2canvas
 * rasterises whatever is in the DOM at capture time, so a URL can be captured
 * before it finishes loading and come out blank; and the print window is a
 * blank document with no origin of its own, where a relative URL would not
 * resolve at all.
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
        // The header falls back to the typeset school name, so a logo that
        // fails to load never blocks a student from obtaining the form.
        return null;
    }
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
/** Height the page is rasterised at, a millimetre short of A4. See downloadWaiverForm. */
const CAPTURE_HEIGHT_MM = 296;

const WAIVER_FORM_STYLE = `
  .wv-page {
    width: 210mm;
    height: 297mm;
    padding: 14mm 18mm;
    box-sizing: border-box;
    background: #ffffff;
    color: #000000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
  }
  .wv-head { margin-bottom: 12mm; text-align: center; }
  /* Sized on width so the mark keeps a consistent presence whatever the
     artwork's own aspect ratio; height follows. */
  .wv-logo { display: block; margin: 0 auto; width: 66mm; height: auto; }
  /*
   * Typographic stand-in for the institutional wordmark, used only if the
   * artwork fails to load. It follows the real mark: "Asian" in the school red,
   * "College" in the school navy, set tight, with the bold italic tagline
   * beneath. The crest is not reproduced — an approximated seal would be worse
   * than none on an official document.
   */
  .wv-school { font-size: 21pt; font-weight: 700; margin: 0; letter-spacing: -.6px; line-height: 1.05; }
  .wv-school .wv-a { color: #e2001a; }
  .wv-school .wv-c { color: #00378a; }
  .wv-school-tag { font-size: 9.5pt; font-weight: 700; font-style: italic; margin: 1px 0 0; color: #111; }
  .wv-title { font-size: 12pt; font-weight: 400; margin: 0 0 7mm; }
  .wv-p { margin: 0 0 6mm; }
  .wv-fill { display: inline-block; border-bottom: 1px solid #000; text-align: center; padding: 0 5px; }
  .wv-ph { font-size: 8.5pt; color: #6b7280; letter-spacing: .2px; }
  /* Label plus open space to write in — the original prints no rule here. */
  .wv-sign-row { margin-bottom: 3.5mm; }
  .wv-sign-group { margin-bottom: 7mm; }
  .wv-notes { margin-top: 2mm; padding-left: 9mm; }
  .wv-notes li { margin-bottom: 2.5mm; padding-left: 2mm; }
  .wv-footer { position: absolute; left: 18mm; right: 18mm; bottom: 14mm; display: flex; gap: 10mm; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 9pt; }
  .wv-footer > div { flex: 1; }
  .wv-footer b { display: block; font-weight: 700; font-style: italic; margin-bottom: 1mm; }
  .wv-footer em { font-style: italic; }
  .wv-footer span { display: block; font-style: italic; }
`;

function buildBody(data: WaiverFormData = {}, logo?: string | null): string {
    const student = inlineField(data.studentName, '[NAME OF STUDENT]', '78mm');
    // The certification names the student twice; both are filled from the account.
    const studentAgain = inlineField(data.studentName, '[NAME OF STUDENT]', '58mm');
    const company = inlineField(data.companyName, '[NAME OF COMPANY]', '68mm');
    // The sentence ends in a full stop. A company name like "Acme, Inc." already
    // carries one, so printing both would read as "Inc..".
    const companyStop = data.companyName?.trim().endsWith('.') ? '' : '.';

    return `
<div class="wv-page" style="position:relative">
  <div class="wv-head">
    ${logo
        ? `<img class="wv-logo" src="${logo}" alt="Asian College">`
        : `<p class="wv-school"><span class="wv-a">Asian</span><span class="wv-c">College</span></p>
           <p class="wv-school-tag">Developing Leaders in IT and Management</p>`}
  </div>

  <p class="wv-title">PARENT'S CLEARANCE AND WAIVER FORM</p>

  <p class="wv-p">
    This is to certify that I am allowing ${student} to undergo a<br>
    <strong>SUPERVISED INDUSTRY LEARNING</strong> at ${company}${companyStop}
  </p>

  <p class="wv-p">
    It is understood that ${studentAgain} will follow the safety protocols needed
    to avoid any unwanted incident or transmitted infection.
  </p>

  <p class="wv-p">
    I fully agree to waive any responsibility on the part of Asian College Dumaguete in case of any
    untoward incident that may happen to the Student in the duration of the <strong>INTERNSHIP</strong>.
  </p>

  <div class="wv-sign-group">
    <div class="wv-sign-row">Signature:</div>
    <div class="wv-sign-row">Name of the Student:</div>
    <div class="wv-sign-row">Date Signed:</div>
  </div>

  <div class="wv-sign-group">
    <div class="wv-sign-row">Signature:</div>
    <div class="wv-sign-row">Name of Signatory :</div>
    <div class="wv-sign-row">Relationship of Signatory to Intern :</div>
    <div class="wv-sign-row">Date Signed:</div>
  </div>

  <ol class="wv-notes">
    <li>The signature/s in this document must match the signatures of the parents on file.</li>
    <li>In the event that a parent cannot sign the waiver form, it must be signed by the legitimate guardian, as evidenced by the letter of guardianship on file.</li>
    <li>This document must be dated, signed and submitted within the week of practice. One copy shall be given to the DIPLOMA PROGRAM department, while the other copy must be kept by the parent/guardian.</li>
  </ol>

  <div class="wv-footer">
    <div><b>VISION</b><em>&ldquo;To be a transformative educational institution committed to the success of its graduates through quality instruction, relevant research, and strong community engagement.&rdquo;</em></div>
    <div><b>MISSION</b><em>&ldquo;To educate and develop globally competitive future teachers&rdquo;</em></div>
    <div><b>CORE VALUES</b><span>Self-Leadership</span><span>Integrity</span><span>Academic Excellence</span></div>
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
<body>${buildBody(data, logo ?? null)}</body></html>`;
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

    const page = host.querySelector<HTMLElement>('.wv-page');
    /*
     * The capture is rendered a millimetre short of A4, and that millimetre is
     * why this form is one page instead of two.
     *
     * html2pdf scales the canvas to the page width and paginates on the
     * resulting height. Millimetres do not land on whole CSS pixels, so a box
     * declared as 210x297mm rasterises to 1588x2246 device pixels, which
     * projects back to 297.015mm against a 297mm page. That 0.015mm of
     * rounding error is enough for html2pdf to emit a second, blank page.
     *
     * The cushion only exists for the raster capture — CAPTURE_HEIGHT_MM is not
     * used by the print stylesheet, which is true A4 and has no such problem.
     * A millimetre is far more than the ~0.26mm worst case (one CSS pixel) and
     * is invisible: the footer already sits 14mm above the bottom edge.
     */
    if (page) page.style.height = `${CAPTURE_HEIGHT_MM}mm`;

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
                .from(page ?? host)
            .save();
    } catch (error) {
        console.error('Falling back to the print view for the waiver form:', error);
        await openWaiverFormForPrinting(data);
    } finally {
        host.remove();
    }
}

/** Open the form in a new tab, ready to print. */
export async function openWaiverFormForPrinting(data: WaiverFormData = {}): Promise<void> {
    // Opened before the await so the click is still the trigger, or pop-up
    // blockers reject the window.
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    // Inlined rather than left as a URL: the print window is a blank document
    // with no origin of its own, and a missing file would print a broken-image
    // box instead of falling back to the wordmark.
    const logo = await loadLogoDataUrl();
    win.document.write(buildWaiverFormHtml(data, logo));
    win.document.close();
    win.focus();
    // Give the layout a beat to settle before the print dialog appears.
    window.setTimeout(() => win.print(), 350);
}

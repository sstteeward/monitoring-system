import React, { useEffect, useState } from 'react';
import type { GradingSheet } from '../services/gradingService';
import {
    GRADING_SHEET_STYLE,
    buildGradingSheetHtml,
    downloadGradingSheetPdf,
    loadLogoDataUrl,
    printGradingSheet,
} from '../utils/gradingSheetDocument';
import './GradingSheet.css';

interface GradingSheetPreviewModalProps {
    sheet: GradingSheet;
    onClose: () => void;
}

/**
 * "Preview Official Grading Sheet".
 *
 * The paper document itself, rendered from exactly the same HTML and CSS the
 * PDF and the print view use — so what the adviser checks here is what the
 * registrar receives. The modal chrome (the toolbar) is outside `.gs-doc` and
 * therefore never reaches the export.
 */
const GradingSheetPreviewModal: React.FC<GradingSheetPreviewModalProps> = ({ sheet, onClose }) => {
    const [html, setHtml] = useState<string | null>(null);
    const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        // The logo is inlined as a data URL for the same reason the export does
        // it: a relative URL can rasterise blank.
        loadLogoDataUrl().then(logo => {
            if (!cancelled) setHtml(buildGradingSheetHtml(sheet, logo));
        });
        return () => { cancelled = true; };
    }, [sheet]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const run = async (action: 'pdf' | 'print') => {
        setBusy(action);
        setError(null);
        try {
            if (action === 'pdf') await downloadGradingSheetPdf(sheet);
            else await printGradingSheet(sheet);
        } catch (err) {
            console.error('Grading sheet export failed:', err);
            setError(err instanceof Error ? err.message : 'The document could not be generated.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="gs-modal-backdrop" role="dialog" aria-modal="true" aria-label="Official Grading Sheet preview">
            <div className="gs-preview-shell">
                <div className="gs-preview-toolbar">
                    <div>
                        <div className="gs-preview-title">Official Grading Sheet</div>
                        <div className="gs-preview-sub">
                            {sheet.section.name} · {sheet.school_year.school_year} · {sheet.school_year.semester} Semester
                        </div>
                    </div>
                    <div className="gs-preview-actions">
                        <button
                            className="cd-btn cd-btn-outline"
                            onClick={() => run('print')}
                            disabled={busy !== null}
                        >
                            {busy === 'print' ? 'Preparing…' : 'Print'}
                        </button>
                        <button
                            className="cd-btn cd-btn-primary"
                            onClick={() => run('pdf')}
                            disabled={busy !== null}
                        >
                            {busy === 'pdf' ? 'Generating…' : 'Export PDF'}
                        </button>
                        <button className="gs-icon-btn" onClick={onClose} aria-label="Close preview">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                </div>

                {error && <div className="gs-alert gs-alert-danger">{error}</div>}

                <div className="gs-preview-page">
                    {html === null ? (
                        <div className="gs-preview-loading">Preparing the document…</div>
                    ) : (
                        <>
                            <style>{GRADING_SHEET_STYLE}</style>
                            {/* The document is generated HTML the app itself built from
                                already-escaped values — never user-supplied markup. */}
                            <div dangerouslySetInnerHTML={{ __html: html }} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GradingSheetPreviewModal;

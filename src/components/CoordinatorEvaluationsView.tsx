import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    evaluationService,
    type CompanyTemplate,
    type EvaluationCompany,
    type EvaluationWorklistRow,
} from '../services/evaluationService';
import {
    DOCUMENT_DESCRIPTION,
    DOCUMENT_LABEL,
    MAX_TEMPLATE_BYTES,
    STATUS_LABEL,
    TEMPLATE_ACCEPT_ATTRIBUTE,
    describeDeadline,
    formatDate,
    formatFileSize,
    isPending,
    type EvaluationDocumentType,
    type EvaluationStatus,
} from '../utils/evaluationForms';
import './Evaluations.css';

/**
 * Coordinator — company evaluations.
 *
 * The official Evaluation, Annex B and Annex C are filed once per company, not
 * once per student. Publishing an evaluation generates one evaluation task for
 * every student that company hosts and tells them all, so a company with thirty
 * interns costs the coordinator one upload.
 *
 * The second tab is the reason this page exists at all: it answers "which
 * companies have not finished evaluating" without opening anybody's document.
 */

const Icon = {
    search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
    building: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

type Tab = 'documents' | 'monitoring';

const MONITOR_FILTERS: { value: EvaluationStatus | 'all' | 'pending'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
];

const CoordinatorEvaluationsView: React.FC = () => {
    const [companies, setCompanies] = useState<EvaluationCompany[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [selected, setSelected] = useState<EvaluationCompany | null>(null);
    const [tab, setTab] = useState<Tab>('documents');

    const [templates, setTemplates] = useState<CompanyTemplate[]>([]);
    const [worklist, setWorklist] = useState<EvaluationWorklistRow[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [publishFor, setPublishFor] = useState<EvaluationDocumentType | null>(null);
    const [viewing, setViewing] = useState<CompanyTemplate | null>(null);
    const [toast, setToast] = useState<{ tone: 'success' | 'warning'; title: string; detail?: string } | null>(null);

    const [monitorFilter, setMonitorFilter] = useState<EvaluationStatus | 'all' | 'pending'>('all');
    const [monitorSearch, setMonitorSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            setCompanies(await evaluationService.getCompanies());
        } catch (err) {
            console.error('Failed to load companies:', err);
            setLoadError(err instanceof Error ? err.message : 'We could not load the company list.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const loadDetail = useCallback(async (companyId: string) => {
        setDetailLoading(true);
        try {
            const [templateRows, worklistRows] = await Promise.all([
                evaluationService.getCompanyTemplates(companyId),
                evaluationService.getWorklist(companyId),
            ]);
            setTemplates(templateRows);
            setWorklist(worklistRows);
        } catch (err) {
            console.error('Failed to load the company detail:', err);
            setToast({ tone: 'warning', title: 'We could not load this company’s evaluations.' });
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!selected) { setTemplates([]); setWorklist([]); return; }
        void loadDetail(selected.company_id);
    }, [selected, loadDetail]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 8000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const visibleCompanies = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return companies;
        return companies.filter(company => company.company_name.toLowerCase().includes(term));
    }, [companies, search]);

    const visibleWorklist = useMemo(() => {
        const term = monitorSearch.trim().toLowerCase();
        return worklist.filter(row => {
            if (monitorFilter === 'pending' && !isPending(row.status)) return false;
            if (monitorFilter !== 'all' && monitorFilter !== 'pending' && row.status !== monitorFilter) return false;
            if (!term) return true;
            return [row.student_name, row.student_email, row.section, row.course]
                .some(field => (field || '').toLowerCase().includes(term));
        });
    }, [worklist, monitorFilter, monitorSearch]);

    const submitted = worklist.filter(row => row.status === 'submitted' || row.status === 'reviewed').length;

    const onPublished = async (documentType: EvaluationDocumentType, version: number, studentCount: number) => {
        setPublishFor(null);
        if (selected) await loadDetail(selected.company_id);
        await load();

        const label = DOCUMENT_LABEL[documentType];
        setToast({
            tone: 'success',
            title: version > 1 ? `${label} replaced (version ${version}).` : `${label} published.`,
            detail: documentType === 'evaluation'
                ? `${studentCount} student${studentCount === 1 ? '' : 's'} at this company now have an evaluation waiting. The company and the students have been notified.`
                : 'The company can now view this document in their portal.',
        });
    };

    return (
        <div className="evx fade-in">
            <header className="evx-head">
                <div>
                    <h2 className="evx-title">Company Evaluations</h2>
                    <p className="evx-sub">
                        Publish the official Evaluation, Annex B and Annex C once per company — the system
                        creates an evaluation for every student it hosts.
                    </p>
                </div>
            </header>

            <div className="evx-layout">
                {/* ── Company picker ─────────────────────────────────────── */}
                <aside className="evx-picker">
                    <div className="evx-search">
                        <span className="evx-search-icon" aria-hidden="true">{Icon.search}</span>
                        <input
                            type="search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search companies"
                            aria-label="Search companies"
                        />
                    </div>

                    <div className="evx-picker-list" role="listbox" aria-label="Companies">
                        {loading ? (
                            <div className="evx-state">Loading companies…</div>
                        ) : loadError ? (
                            <div className="evx-state">
                                <p>{loadError}</p>
                                <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()}>Try again</button>
                            </div>
                        ) : visibleCompanies.length === 0 ? (
                            <div className="evx-state">No companies match that search.</div>
                        ) : visibleCompanies.map(company => (
                            <button
                                key={company.company_id}
                                type="button"
                                role="option"
                                aria-selected={selected?.company_id === company.company_id}
                                className={`evx-picker-item${selected?.company_id === company.company_id ? ' active' : ''}`}
                                onClick={() => setSelected(company)}
                            >
                                <span className="evx-picker-name">{company.company_name}</span>
                                <span className="evx-picker-meta">
                                    {company.student_count} student{company.student_count === 1 ? '' : 's'}
                                    {company.templates_on_file > 0 && ` · ${company.templates_on_file}/3 documents`}
                                </span>
                                {company.total_evaluations > 0 && (
                                    <span className="evx-meter">
                                        <span className="evx-meter-track">
                                            <span
                                                className="evx-meter-fill"
                                                style={{ width: `${(company.submitted_count / company.total_evaluations) * 100}%` }}
                                            />
                                        </span>
                                        <span className="evx-meter-text">{company.submitted_count}/{company.total_evaluations}</span>
                                    </span>
                                )}
                                <span className={`evx-count${company.templates_on_file === 3 ? ' complete' : ''}`}>
                                    {company.templates_on_file}/3
                                </span>
                            </button>
                        ))}
                    </div>
                </aside>

                {/* ── Company detail ─────────────────────────────────────── */}
                <section className="evx-panel">
                    {!selected ? (
                        <div className="evx-empty">
                            <span className="evx-empty-icon" aria-hidden="true">{Icon.building}</span>
                            <p className="evx-empty-title">Select a company</p>
                            <p className="evx-empty-sub">
                                Choose a company to publish its official documents and track how far its
                                student evaluations have got.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="evx-context">
                                <div className="evx-context-name">
                                    {selected.company_name}
                                    <span className="evx-context-email">
                                        {selected.student_count} assigned student{selected.student_count === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div className="evx-row-actions">
                                    <button
                                        type="button"
                                        className={`evx-tab${tab === 'documents' ? ' active' : ''}`}
                                        onClick={() => setTab('documents')}
                                    >
                                        Documents
                                    </button>
                                    <button
                                        type="button"
                                        className={`evx-tab${tab === 'monitoring' ? ' active' : ''}`}
                                        onClick={() => setTab('monitoring')}
                                    >
                                        Evaluations {worklist.length > 0 && `(${submitted}/${worklist.length})`}
                                    </button>
                                </div>
                            </div>

                            {!selected.has_portal_account && (
                                <p className="evx-hint">
                                    This company has no portal account, so nobody there can sign in to complete
                                    an evaluation. Approve or create their account under Companies first.
                                </p>
                            )}

                            {tab === 'documents' ? (
                                <div className="evx-table-wrap">
                                    <table className="evx-table">
                                        <thead>
                                            <tr>
                                                <th>Document</th>
                                                <th>Status</th>
                                                <th>Published</th>
                                                <th aria-label="Actions" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detailLoading && templates.length === 0 ? (
                                                <tr><td colSpan={4}><div className="evx-state">Loading documents…</div></td></tr>
                                            ) : templates.map(row => (
                                                <tr key={row.document_type}>
                                                    <td>
                                                        <span className="evx-doc-name">{DOCUMENT_LABEL[row.document_type]}</span>
                                                        <span className="evx-doc-file">
                                                            {row.file_name
                                                                ? `${row.file_name} · ${formatFileSize(row.file_size)}${(row.version ?? 1) > 1 ? ` · v${row.version}` : ''}`
                                                                : DOCUMENT_DESCRIPTION[row.document_type]}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`evx-status evx-status-${row.template_id ? 'uploaded' : 'not_uploaded'}`}>
                                                            <span className="evx-status-dot" aria-hidden="true" />
                                                            {row.template_id ? 'Published' : 'Not Uploaded'}
                                                        </span>
                                                        {row.document_type === 'evaluation' && row.evaluation_deadline && (
                                                            <span className={`evx-deadline evx-deadline-${describeDeadline(row.evaluation_deadline).tone}`} style={{ marginTop: '0.3rem' }}>
                                                                {describeDeadline(row.evaluation_deadline).text}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {formatDate(row.uploaded_at)}
                                                        {row.uploaded_by_name && <span className="evx-doc-file">by {row.uploaded_by_name}</span>}
                                                        {row.previous_versions > 0 && (
                                                            <span className="evx-doc-file">
                                                                {row.previous_versions} earlier version{row.previous_versions === 1 ? '' : 's'} kept
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="evx-row-actions">
                                                            {row.template_id ? (
                                                                <>
                                                                    <button type="button" className="evx-btn evx-btn-quiet" onClick={() => setViewing(row)}>View</button>
                                                                    <button type="button" className="evx-btn evx-btn-quiet" onClick={() => setPublishFor(row.document_type)}>Replace</button>
                                                                </>
                                                            ) : (
                                                                <button type="button" className="evx-btn evx-btn-primary" onClick={() => setPublishFor(row.document_type)}>
                                                                    {Icon.upload} Upload
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <>
                                    <div className="evx-toolbar">
                                        <div className="evx-search" style={{ flex: '1 1 220px', padding: 0, border: 0 }}>
                                            <span className="evx-search-icon" aria-hidden="true" style={{ left: '0.65rem' }}>{Icon.search}</span>
                                            <input
                                                type="search"
                                                value={monitorSearch}
                                                onChange={e => setMonitorSearch(e.target.value)}
                                                placeholder="Search student…"
                                                aria-label="Search students"
                                            />
                                        </div>
                                        <div className="evx-filters" role="group" aria-label="Filter by status">
                                            {MONITOR_FILTERS.map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={`evx-filter${monitorFilter === option.value ? ' active' : ''}`}
                                                    aria-pressed={monitorFilter === option.value}
                                                    onClick={() => setMonitorFilter(option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="evx-table-wrap">
                                        <table className="evx-table">
                                            <thead>
                                                <tr>
                                                    <th>Student</th>
                                                    <th>Program</th>
                                                    <th>Status</th>
                                                    <th>Submitted</th>
                                                    <th>Score</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detailLoading && worklist.length === 0 ? (
                                                    <tr><td colSpan={5}><div className="evx-state">Loading evaluations…</div></td></tr>
                                                ) : !selected.has_evaluation ? (
                                                    <tr><td colSpan={5}>
                                                        <div className="evx-state">
                                                            No evaluation has been published for this company yet.
                                                            Upload one under Documents and every assigned student gets an evaluation.
                                                        </div>
                                                    </td></tr>
                                                ) : visibleWorklist.length === 0 ? (
                                                    <tr><td colSpan={5}><div className="evx-state">No students match this filter.</div></td></tr>
                                                ) : visibleWorklist.map(row => (
                                                    <tr key={row.student_id}>
                                                        <td>
                                                            <span className="evx-doc-name">{row.student_name || 'Unnamed student'}</span>
                                                            <span className="evx-doc-file">{row.student_email}</span>
                                                        </td>
                                                        <td>
                                                            {row.course || '—'}
                                                            <span className="evx-doc-file">{row.section || 'No section'}</span>
                                                        </td>
                                                        <td>
                                                            <span className={`evx-status evx-status-${row.status}`}>
                                                                <span className="evx-status-dot" aria-hidden="true" />
                                                                {STATUS_LABEL[row.status]}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            {formatDate(row.submitted_at)}
                                                            {row.evaluator_name && <span className="evx-doc-file">by {row.evaluator_name}</span>}
                                                        </td>
                                                        <td>
                                                            {row.total_score !== null && row.total_score !== undefined
                                                                ? <strong>{Number(row.total_score).toFixed(0)}%</strong>
                                                                : <span className="evx-doc-file">—</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {selected.has_evaluation && worklist.length > 0 && (
                                        <p className="evx-sub" style={{ margin: 0 }}>
                                            Completion: {submitted} / {worklist.length}
                                        </p>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </section>
            </div>

            {toast && (
                <div className={`evx-toast evx-toast-${toast.tone}`} role="status">
                    <div>
                        <strong>{toast.title}</strong>
                        {toast.detail && <p>{toast.detail}</p>}
                    </div>
                    <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">{Icon.close}</button>
                </div>
            )}

            {publishFor && selected && (
                <PublishDialog
                    company={selected}
                    documentType={publishFor}
                    existing={templates.find(row => row.document_type === publishFor) ?? null}
                    onClose={() => setPublishFor(null)}
                    onPublished={(version) => void onPublished(publishFor, version, selected.student_count)}
                />
            )}

            {viewing?.file_path && (
                <TemplateViewer template={viewing} companyName={selected?.company_name ?? ''} onClose={() => setViewing(null)} />
            )}
        </div>
    );
};

// ─── Publish / Replace ───────────────────────────────────────────────────────

const PublishDialog: React.FC<{
    company: EvaluationCompany;
    documentType: EvaluationDocumentType;
    existing: CompanyTemplate | null;
    onClose: () => void;
    onPublished: (version: number) => void;
}> = ({ company, documentType, existing, onClose, onPublished }) => {
    const [file, setFile] = useState<File | null>(null);
    const [deadline, setDeadline] = useState(existing?.evaluation_deadline?.slice(0, 10) ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isReplacement = Boolean(existing?.template_id);

    const choose = async (candidate: File | null) => {
        setError(null);
        if (!candidate) { setFile(null); return; }
        try {
            await evaluationService.validateFile(candidate);
            setFile(candidate);
        } catch (err) {
            setFile(null);
            setError(err instanceof Error ? err.message : 'That file cannot be uploaded.');
        }
    };

    const submit = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const result = await evaluationService.publishTemplate(
                company.company_id, documentType, file, documentType === 'evaluation' ? deadline || null : null,
            );
            onPublished(result.version);
        } catch (err) {
            console.error('Publish failed:', err);
            setError(err instanceof Error ? err.message : 'The upload did not complete. Nothing was published and nobody was notified.');
            setBusy(false);
        }
    };

    return (
        <div className="evx-overlay" role="presentation" onClick={() => !busy && onClose()}>
            <div
                className="evx-modal"
                style={{ maxWidth: 500 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="evx-publish-title"
                onClick={e => e.stopPropagation()}
            >
                <header className="evx-modal-head">
                    <h3 id="evx-publish-title">
                        {isReplacement ? `Replace ${DOCUMENT_LABEL[documentType]}?` : `Publish ${DOCUMENT_LABEL[documentType]}`}
                    </h3>
                    <button type="button" className="evx-icon-btn" onClick={onClose} disabled={busy} aria-label="Close">{Icon.close}</button>
                </header>

                <div className="evx-modal-body">
                    <dl className="evx-modal-facts">
                        <div><dt>Company</dt><dd>{company.company_name}</dd></div>
                        <div><dt>Applies to</dt><dd>{company.student_count} assigned student{company.student_count === 1 ? '' : 's'}</dd></div>
                    </dl>

                    <p className="evx-field-hint" style={{ marginBottom: '0.9rem' }}>
                        {documentType === 'evaluation'
                            ? 'Uploaded once for the whole company. Every assigned student gets their own evaluation to be completed digitally — the file is not copied per student.'
                            : DOCUMENT_DESCRIPTION[documentType]}
                    </p>

                    {isReplacement && (
                        <p className="evx-warning">
                            The current {DOCUMENT_LABEL[documentType]} ({existing?.file_name}) becomes version{' '}
                            {existing?.version ?? 1} in the archive and stays attached to the evaluations already
                            answered from it. Students already evaluated keep their result; only students who have
                            not been evaluated yet use the new version.
                        </p>
                    )}

                    <label className="evx-field-label" htmlFor="evx-file">PDF file</label>
                    <div className="evx-file-row">
                        <input
                            ref={inputRef}
                            id="evx-file"
                            type="file"
                            accept={TEMPLATE_ACCEPT_ATTRIBUTE}
                            disabled={busy}
                            onChange={e => void choose(e.target.files?.[0] ?? null)}
                        />
                    </div>
                    <p className="evx-field-hint">PDF format only · Maximum file size {formatFileSize(MAX_TEMPLATE_BYTES)}</p>

                    {documentType === 'evaluation' && (
                        <>
                            <label className="evx-field-label" htmlFor="evx-deadline" style={{ marginTop: '0.9rem' }}>
                                Evaluation deadline <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span>
                            </label>
                            <input
                                id="evx-deadline"
                                type="date"
                                className="evx-textarea"
                                style={{ minHeight: 0, height: 38 }}
                                value={deadline}
                                disabled={busy}
                                onChange={e => setDeadline(e.target.value)}
                            />
                            <p className="evx-field-hint">Shown to the company as a countdown, and flagged here once overdue.</p>
                        </>
                    )}

                    {file && <p className="evx-file-chosen">{file.name} · {formatFileSize(file.size)}</p>}
                    {error && <p className="evx-error">{error}</p>}
                    {busy && (
                        <div className="evx-progress" role="status" aria-live="polite">
                            <span className="evx-progress-bar" />
                            <span>Publishing and notifying the company and its students…</span>
                        </div>
                    )}
                </div>

                <footer className="evx-modal-foot">
                    <button type="button" className="evx-btn evx-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="evx-btn evx-btn-primary" onClick={() => void submit()} disabled={!file || busy}>
                        {busy ? 'Publishing…' : isReplacement ? 'Replace Document' : 'Publish Document'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

// ─── Viewer ──────────────────────────────────────────────────────────────────

const TemplateViewer: React.FC<{
    template: CompanyTemplate;
    companyName: string;
    onClose: () => void;
}> = ({ template, companyName, onClose }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!template.file_path) return;
        let cancelled = false;
        void Promise.all([
            evaluationService.getTemplateUrl(template.file_path),
            evaluationService.getTemplateDownloadUrl(template.file_path, template.file_name ?? 'document.pdf'),
        ]).then(([viewLink, saveLink]) => {
            if (cancelled) return;
            setUrl(viewLink);
            setDownloadUrl(saveLink);
        }).catch(err => {
            if (cancelled) return;
            console.error('Failed to open the document:', err);
            setError('We could not open this document.');
        });
        return () => { cancelled = true; };
    }, [template]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    return (
        <div className="evx-overlay" role="presentation" onClick={onClose}>
            <div
                className="evx-modal tall"
                style={{ maxWidth: 940 }}
                role="dialog"
                aria-modal="true"
                aria-label={`${DOCUMENT_LABEL[template.document_type]} for ${companyName}`}
                onClick={e => e.stopPropagation()}
            >
                <header className="evx-modal-head">
                    <div>
                        <h3>{DOCUMENT_LABEL[template.document_type]}</h3>
                        <p className="evx-modal-sub">
                            {companyName} · {template.file_name} · {formatFileSize(template.file_size)}
                            {(template.version ?? 1) > 1 && ` · v${template.version}`}
                        </p>
                    </div>
                    <button type="button" className="evx-icon-btn" onClick={onClose} aria-label="Close">{Icon.close}</button>
                </header>

                <div className="evx-viewer">
                    {error ? (
                        <div className="evx-state">{error}</div>
                    ) : !url ? (
                        <div className="evx-state">Opening document…</div>
                    ) : (
                        <iframe src={url} title={`${DOCUMENT_LABEL[template.document_type]} for ${companyName}`} />
                    )}
                </div>

                <footer className="evx-modal-foot">
                    {downloadUrl && (
                        <a className="evx-btn evx-btn-ghost" href={downloadUrl} target="_blank" rel="noopener noreferrer">Download</a>
                    )}
                    <button type="button" className="evx-btn evx-btn-primary" onClick={onClose}>Done</button>
                </footer>
            </div>
        </div>
    );
};

export default CoordinatorEvaluationsView;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { yearLevelService, type YearLevel } from '../services/yearLevelService';
import { ordinalYearLabel } from '../utils/sections';
import './AdminCoursesView.css';

/**
 * Admin screen for the year-levels catalog. Adds a year level and activates /
 * deactivates one; every screen that offers a year choice reads the active rows
 * (yearLevelService.list(true)). Deactivating never hides existing data —
 * matching resolves by the digit inside a section name, not this catalog.
 *
 * Rendered stacked under the Courses catalog, so it borrows the same `.acv-*`
 * visual language (AdminCoursesView.css) to read as one screen.
 */

/** The full range a section name can carry (single year digit). */
const ALL_YEAR_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const svg = (path: React.ReactNode, size = 15) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
    </svg>
);
const Icon = {
    plus: () => svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
    close: () => svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, 18),
    alert: () => svg(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, 16),
    refresh: () => svg(<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>),
    calendar: (s = 22) => svg(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>, s),
};

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const AdminYearLevelsView: React.FC = () => {
    const [levels, setLevels] = useState<YearLevel[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [rowBusyId, setRowBusyId] = useState<string | null>(null);

    // Add dialog
    const [showAdd, setShowAdd] = useState(false);
    const [addYear, setAddYear] = useState<number | null>(null);
    const [addError, setAddError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const dialogRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => { void loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            setLevels(await yearLevelService.list(false));
        } catch (err) {
            console.error('Error loading year levels:', err);
            setLoadError(err instanceof Error ? err.message : 'Could not load year levels.');
        } finally {
            setLoading(false);
        }
    };

    const usedNumbers = useMemo(() => new Set(levels.map(l => l.year_number)), [levels]);
    const unusedNumbers = useMemo(
        () => ALL_YEAR_NUMBERS.filter(n => !usedNumbers.has(n)),
        [usedNumbers]
    );
    const allExist = unusedNumbers.length === 0;
    const activeCount = levels.filter(l => l.is_active).length;

    const openAdd = () => {
        setAddYear(unusedNumbers[0] ?? null);
        setAddError(null);
        setShowAdd(true);
    };
    const closeAdd = () => {
        if (saving) return;
        setShowAdd(false);
    };

    // Escape / body-scroll lock while the dialog is open.
    useEffect(() => {
        if (!showAdd) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdd(); };
        window.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAdd, saving]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (addYear === null) return;
        setSaving(true);
        setAddError(null);
        try {
            await yearLevelService.create(addYear);
            setShowAdd(false);
            await loadData();
        } catch (err) {
            setAddError(err instanceof Error ? err.message : 'Failed to add the year level.');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (level: YearLevel) => {
        const next = !level.is_active;
        if (!next) {
            const ok = window.confirm(
                `Students and sections already in ${level.label} keep working. ${level.label} will no longer be offered in new selections.`
            );
            if (!ok) return;
        }
        setRowBusyId(level.id);
        try {
            await yearLevelService.setActive(level.id, next);
            await loadData();
        } catch (err) {
            // Surface the server rule (e.g. last active level) without losing the row.
            window.alert(err instanceof Error ? err.message : 'Failed to update the year level.');
        } finally {
            setRowBusyId(null);
        }
    };

    return (
        <div className="acv-page" style={{ display: 'grid', gap: '1.25rem' }}>
            <header className="acv-header">
                <div>
                    <h1 className="acv-title">Year Levels</h1>
                    <p className="acv-subtitle">
                        Year levels the programme offers. Active levels appear in every year choice; deactivated
                        ones stay out of new selections but keep existing data intact.
                    </p>
                </div>
                <div className="acv-header-actions">
                    <button
                        type="button"
                        className="acv-btn acv-btn-primary"
                        onClick={openAdd}
                        disabled={loading || allExist}
                        title={allExist ? 'All year levels (1–9) already exist.' : undefined}
                    >
                        {Icon.plus()} Add Year Level
                    </button>
                </div>
            </header>

            {loadError && (
                <div className="acv-toast acv-toast-error" role="alert">
                    {Icon.alert()}
                    <span className="acv-toast-body">{loadError}</span>
                    <button type="button" className="acv-btn acv-btn-sm" onClick={loadData}>
                        {Icon.refresh()} Try Again
                    </button>
                </div>
            )}

            <section className="acv-panel" aria-label="Year level catalogue">
                {loading ? (
                    <div className="acv-skel-rows" aria-hidden="true" style={{ padding: '0.5rem 0' }}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div className="acv-skel-row" key={i}>
                                <div className="acv-skeleton" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
                                <div style={{ flex: 2 }}>
                                    <div className="acv-skeleton" style={{ height: 10, width: '40%' }} />
                                </div>
                                <div className="acv-skeleton" style={{ width: 70, height: 20, borderRadius: 999 }} />
                                <div className="acv-skeleton" style={{ flex: 1, height: 10 }} />
                                <div className="acv-skeleton" style={{ width: 90, height: 28, borderRadius: 8 }} />
                            </div>
                        ))}
                    </div>
                ) : levels.length === 0 && !loadError ? (
                    <div className="acv-empty">
                        <div className="acv-empty-icon">{Icon.calendar(24)}</div>
                        <div className="acv-empty-title">No year levels yet</div>
                        <p className="acv-empty-text">Add a year level to make it selectable across the portal.</p>
                        <div className="acv-empty-actions">
                            <button type="button" className="acv-btn acv-btn-primary" onClick={openAdd} disabled={allExist}>
                                {Icon.plus()} Add Year Level
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="acv-table-wrap">
                        <table className="acv-table" style={{ minWidth: 560 }}>
                            <caption className="acv-sr">Year levels with their label, status and creation date</caption>
                            <thead>
                                <tr>
                                    <th scope="col">Year</th>
                                    <th scope="col">Label</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Created</th>
                                    <th scope="col" className="acv-col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {levels.map(level => (
                                    <tr key={level.id} data-inactive={!level.is_active}>
                                        <td><span className="acv-metric">{level.year_number}</span></td>
                                        <td><span className="acv-course-name">{level.label}</span></td>
                                        <td>
                                            <span className="acv-badge" data-tone={level.is_active ? 'ok' : 'muted'}>
                                                <span className="acv-badge-dot" />
                                                {level.is_active ? 'ACTIVE' : 'INACTIVE'}
                                            </span>
                                        </td>
                                        <td>{formatDate(level.created_at)}</td>
                                        <td className="acv-col-actions">
                                            <div className="acv-row-actions">
                                                <button
                                                    type="button"
                                                    className="acv-btn acv-btn-sm"
                                                    onClick={() => handleToggle(level)}
                                                    disabled={rowBusyId === level.id || (level.is_active && activeCount <= 1)}
                                                    title={level.is_active && activeCount <= 1 ? 'At least one year level must remain active.' : undefined}
                                                >
                                                    {rowBusyId === level.id ? 'Working…' : level.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {showAdd && (
                <div className="acv-scrim" onMouseDown={closeAdd}>
                    <div
                        className="acv-dialog acv-dialog-sm"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ayl-add-title"
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div className="acv-dialog-head">
                            <div>
                                <h2 className="acv-dialog-title" id="ayl-add-title">Add Year Level</h2>
                                <p className="acv-dialog-sub">
                                    Pick a year number. Its label is set automatically and it becomes selectable straight away.
                                </p>
                            </div>
                            <button type="button" className="acv-dialog-close" onClick={closeAdd} aria-label="Close dialog">
                                {Icon.close()}
                            </button>
                        </div>

                        <form onSubmit={handleAdd}>
                            <div className="acv-dialog-body">
                                <div className="acv-field">
                                    <label className="acv-label" htmlFor="ayl-year">Year Number</label>
                                    <select
                                        id="ayl-year"
                                        className="acv-input"
                                        value={addYear ?? ''}
                                        onChange={e => setAddYear(Number(e.target.value))}
                                        disabled={saving}
                                        autoFocus
                                    >
                                        {unusedNumbers.map(n => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                    <p className="acv-hint">
                                        Label preview: <strong style={{ color: 'var(--admin-text-primary, var(--text-primary))' }}>
                                            {addYear === null ? '—' : ordinalYearLabel(addYear)}
                                        </strong>
                                    </p>
                                </div>

                                {addError && (
                                    <div className="acv-note" data-tone="danger" role="alert">
                                        {Icon.alert()} <span>{addError}</span>
                                    </div>
                                )}
                            </div>

                            <div className="acv-dialog-foot">
                                <button type="button" className="acv-btn" onClick={closeAdd} disabled={saving}>Cancel</button>
                                <button type="submit" className="acv-btn acv-btn-primary" disabled={saving || addYear === null}>
                                    {saving ? 'Adding…' : 'Add Year Level'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminYearLevelsView;

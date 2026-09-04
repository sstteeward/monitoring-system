import React, { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { adminService, type Course, type CourseUsage } from '../services/adminService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import './AdminCoursesView.css';

/** Which dialog, if any, is open. */
type DialogState =
    | { kind: 'create' }
    | { kind: 'edit'; course: Course }
    | { kind: 'details'; course: Course }
    | { kind: 'delete'; course: Course }
    | null;

type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'name-asc' | 'name-desc' | 'students-desc' | 'newest';

// ─── Icons ───────────────────────────────────────────────────────────────────
const svg = (path: React.ReactNode, size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
    </svg>
);

const Icon = {
    cap: (s = 16) => svg(<><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></>, s),
    check: (s = 16) => svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>, s),
    pause: (s = 16) => svg(<><circle cx="12" cy="12" r="10" /><line x1="10" y1="15" x2="10" y2="9" /><line x1="14" y1="15" x2="14" y2="9" /></>, s),
    users: (s = 16) => svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, s),
    search: (s = 15) => svg(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, s),
    plus: (s = 15) => svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, s),
    close: (s = 18) => svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, s),
    more: (s = 16) => svg(<><circle cx="12" cy="5" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="19" r="1.6" fill="currentColor" /></>, s),
    edit: (s = 16) => svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>, s),
    eye: (s = 16) => svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, s),
    trash: (s = 16) => svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, s),
    alert: (s = 16) => svg(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, s),
    warn: (s = 18) => svg(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, s),
    refresh: (s = 15) => svg(<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>, s),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tracks a media query so the table can be swapped for cards on small screens. */
const supportsMatchMedia = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((onStoreChange: () => void) => {
        if (!supportsMatchMedia()) return () => { };
        const mql = window.matchMedia(query);
        mql.addEventListener('change', onStoreChange);
        return () => mql.removeEventListener('change', onStoreChange);
    }, [query]);

    const getSnapshot = useCallback(
        () => (supportsMatchMedia() ? window.matchMedia(query).matches : false),
        [query]
    );

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Names and codes are compared case- and whitespace-insensitively. */
const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const codeOf = (course: Course) => (course.code || course.name || '').trim().toUpperCase();

const EMPTY_USAGE: CourseUsage = { students: 0, profiles: 0, sections: 0, inUse: false };

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** Reads as a sentence in the delete dialog: "45 students and 10 sections". */
const describeUsage = (usage: CourseUsage) => {
    const parts: string[] = [];
    if (usage.profiles > 0) {
        const others = usage.profiles - usage.students;
        if (usage.students > 0) parts.push(`${usage.students} student${usage.students === 1 ? '' : 's'}`);
        if (others > 0) parts.push(`${others} other account${others === 1 ? '' : 's'}`);
    }
    if (usage.sections > 0) parts.push(`${usage.sections} section${usage.sections === 1 ? '' : 's'}`);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

// ─── Component ───────────────────────────────────────────────────────────────
const AdminCoursesView: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [usage, setUsage] = useState<Record<string, CourseUsage>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    // Toolbar
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortKey, setSortKey] = useState<SortKey>('name-asc');

    // Dialogs + row menu
    const [dialog, setDialog] = useState<DialogState>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Form
    const [formName, setFormName] = useState('');
    const [formCode, setFormCode] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formActive, setFormActive] = useState(true);
    const [formErrors, setFormErrors] = useState<{ name?: string; code?: string; form?: string }>({});
    const [submitting, setSubmitting] = useState(false);

    const isNarrow = useMediaQuery('(max-width: 720px)');
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { loadData(); }, []);
    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const loadData = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [courseRows, usageMap] = await Promise.all([
                adminService.getCourses(),
                adminService.getCourseUsage(),
            ]);
            setCourses(courseRows);
            setUsage(usageMap);
        } catch (err: any) {
            console.error('Error loading courses:', err);
            setLoadError(err?.message || 'Unable to load courses. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const notify = (tone: 'success' | 'error', text: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ tone, text });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const usageFor = useCallback(
        (course: Course) => usage[codeOf(course)] ?? EMPTY_USAGE,
        [usage]
    );

    // ── Filtering / sorting ──────────────────────────────────────────────────
    const query = norm(searchTerm);

    const visibleCourses = useMemo(() => {
        const filtered = courses.filter(c => {
            const matchesStatus = statusFilter === 'all'
                || (statusFilter === 'active' && c.is_active !== false)
                || (statusFilter === 'inactive' && c.is_active === false);

            const haystack = `${c.name} ${c.code || ''} ${c.description || ''}`.toLowerCase();
            return matchesStatus && (!query || haystack.includes(query));
        });

        const sorted = [...filtered];
        sorted.sort((a, b) => {
            switch (sortKey) {
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'students-desc':
                    return usageFor(b).students - usageFor(a).students || a.name.localeCompare(b.name);
                case 'newest':
                    return (b.created_at || '').localeCompare(a.created_at || '') || a.name.localeCompare(b.name);
                default:
                    return a.name.localeCompare(b.name);
            }
        });
        return sorted;
    }, [courses, statusFilter, query, sortKey, usageFor]);

    const {
        currentPage, setCurrentPage, totalPages,
        paginatedItems: pageCourses, totalItems, itemsPerPage,
    } = usePagination(visibleCourses, 10);

    // ── Statistics, all derived from the loaded rows ─────────────────────────
    const activeCount = courses.filter(c => c.is_active !== false).length;
    const inactiveCount = courses.length - activeCount;
    const studentsUsingCourses = useMemo(() => {
        // Only students whose course matches a course in the catalogue, counted
        // once each — an orphaned value like "BSIT" is deliberately excluded.
        const codes = new Set(courses.map(codeOf));
        return Object.entries(usage)
            .filter(([code]) => codes.has(code))
            .reduce((sum, [, u]) => sum + u.students, 0);
    }, [courses, usage]);

    // ── Form plumbing ────────────────────────────────────────────────────────
    const openCreate = () => {
        setFormName(''); setFormCode(''); setFormDesc(''); setFormActive(true);
        setFormErrors({});
        setOpenMenuId(null);
        setDialog({ kind: 'create' });
    };

    const openEdit = (course: Course) => {
        setFormName(course.name);
        setFormCode(codeOf(course));
        setFormDesc(course.description || '');
        setFormActive(course.is_active !== false);
        setFormErrors({});
        setOpenMenuId(null);
        setDialog({ kind: 'edit', course });
    };

    const closeDialog = () => { setDialog(null); setFormErrors({}); };

    /**
     * Blocks empty submissions and duplicates. Duplicates are checked
     * case-insensitively against every other course; the database enforces the
     * same rule with unique indexes on lower(name) and lower(code), so this
     * exists to produce a readable message rather than a raw constraint error.
     */
    const validate = (excludeId?: string) => {
        const errors: { name?: string; code?: string } = {};
        const name = formName.trim();
        const code = formCode.trim();

        if (!name) errors.name = 'Course name is required.';
        if (!code) errors.code = 'Course abbreviation is required.';

        const others = courses.filter(c => c.id !== excludeId);
        if (name && others.some(c => norm(c.name) === norm(name))) {
            errors.name = 'A course with this name already exists.';
        }
        if (code && others.some(c => norm(codeOf(c)) === norm(code))) {
            errors.code = 'A course with this abbreviation already exists.';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dialog || (dialog.kind !== 'create' && dialog.kind !== 'edit')) return;

        const editing = dialog.kind === 'edit' ? dialog.course : null;
        if (!validate(editing?.id)) return;

        setSubmitting(true);
        setFormErrors({});
        try {
            if (editing) {
                await adminService.updateCourse(editing.id, {
                    name: formName, code: formCode, description: formDesc, isActive: formActive,
                });
                notify('success', 'Course updated successfully.');
            } else {
                await adminService.createCourse({
                    name: formName, code: formCode, description: formDesc, isActive: formActive,
                });
                notify('success', 'Course added successfully.');
            }
            closeDialog();
            await loadData();
        } catch (err: any) {
            // A unique-violation that slipped past the client check (another
            // admin saved the same code first) still gets a readable message.
            const message = String(err?.message || '');
            if (err?.code === '23505' || /duplicate key|unique/i.test(message)) {
                setFormErrors({
                    form: /code/i.test(message)
                        ? 'A course with this abbreviation already exists.'
                        : 'A course with this name or abbreviation already exists.',
                });
            } else {
                setFormErrors({ form: 'Unable to save course. Please try again.' });
            }
            console.error('Error saving course:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async (course: Course) => {
        const next = course.is_active === false;
        setOpenMenuId(null);
        try {
            await adminService.setCourseStatus(course.id, next, course.name);
            notify('success', `Course ${next ? 'activated' : 'deactivated'} successfully.`);
            await loadData();
        } catch (err) {
            console.error('Error changing course status:', err);
            notify('error', 'Unable to update the course status. Please try again.');
        }
    };

    const handleDelete = async (course: Course) => {
        setSubmitting(true);
        try {
            await adminService.deleteCourse(course.id, course.name);
            notify('success', 'Course deleted successfully.');
            closeDialog();
            await loadData();
        } catch (err) {
            console.error('Error deleting course:', err);
            notify('error', 'Unable to delete course. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    /** Offered from inside the delete dialog when the course cannot be removed. */
    const handleDeactivateFromDelete = async (course: Course) => {
        setSubmitting(true);
        try {
            await adminService.setCourseStatus(course.id, false, course.name);
            notify('success', 'Course deactivated successfully.');
            closeDialog();
            await loadData();
        } catch (err) {
            console.error('Error deactivating course:', err);
            notify('error', 'Unable to deactivate the course. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Overlay behaviour ────────────────────────────────────────────────────
    useEffect(() => {
        if (!dialog && !openMenuId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (openMenuId) { setOpenMenuId(null); return; }
            if (dialog) closeDialog();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dialog, openMenuId]);

    useEffect(() => {
        if (!dialog) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();
        return () => { document.body.style.overflow = previous; };
    }, [dialog]);

    // ── Reusable fragments ───────────────────────────────────────────────────
    const statusBadge = (course: Course) => (
        <span className="acv-badge" data-tone={course.is_active !== false ? 'ok' : 'muted'}>
            <span className="acv-badge-dot" />
            {course.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
        </span>
    );

    const rowMenu = (course: Course) => {
        const open = openMenuId === course.id;
        const isActive = course.is_active !== false;
        return (
            <div className="acv-menu-wrap">
                <button
                    type="button"
                    className="acv-icon-btn"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label={`More actions for ${course.name}`}
                    title="More actions"
                    onClick={() => setOpenMenuId(open ? null : course.id)}
                >
                    {Icon.more()}
                </button>
                {open && (
                    <>
                        <div className="acv-menu-scrim" onClick={() => setOpenMenuId(null)} />
                        <div className="acv-menu" role="menu" aria-label={`Actions for ${course.name}`}>
                            <button type="button" role="menuitem" className="acv-menu-item"
                                onClick={() => openEdit(course)}>
                                {Icon.edit()} Edit course
                            </button>
                            <button type="button" role="menuitem" className="acv-menu-item"
                                onClick={() => { setOpenMenuId(null); setDialog({ kind: 'details', course }); }}>
                                {Icon.eye()} View details
                            </button>
                            <button type="button" role="menuitem" className="acv-menu-item"
                                data-tone={isActive ? undefined : 'ok'}
                                onClick={() => handleToggleStatus(course)}>
                                {isActive ? Icon.pause() : Icon.check()}
                                {isActive ? 'Deactivate course' : 'Activate course'}
                            </button>
                            <div className="acv-menu-sep" />
                            <button type="button" role="menuitem" className="acv-menu-item" data-tone="danger"
                                onClick={() => { setOpenMenuId(null); setDialog({ kind: 'delete', course }); }}>
                                {Icon.trash()} Delete course
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const hasFilters = query !== '' || statusFilter !== 'all';

    const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); };

    // Shared by the create and edit dialogs.
    const courseForm = (mode: 'create' | 'edit') => (
        <form onSubmit={handleSubmit} className="acv-dialog-form" noValidate>
            <div className="acv-dialog-body">
                <div className="acv-field">
                    <label className="acv-label" htmlFor="acv-name">
                        Course Name<span className="acv-req" aria-hidden="true">*</span>
                    </label>
                    <input
                        id="acv-name"
                        className="acv-input"
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        placeholder="e.g. Information Technology"
                        data-invalid={!!formErrors.name}
                        aria-invalid={!!formErrors.name}
                        aria-describedby={formErrors.name ? 'acv-name-err' : undefined}
                        autoFocus
                    />
                    {formErrors.name && (
                        <p className="acv-error-text" id="acv-name-err">{Icon.alert(13)} {formErrors.name}</p>
                    )}
                </div>

                <div className="acv-field">
                    <label className="acv-label" htmlFor="acv-code">
                        Course Abbreviation<span className="acv-req" aria-hidden="true">*</span>
                    </label>
                    <input
                        id="acv-code"
                        className="acv-input acv-input-code"
                        value={formCode}
                        onChange={e => setFormCode(e.target.value.toUpperCase())}
                        placeholder="e.g. DIT"
                        maxLength={10}
                        data-invalid={!!formErrors.code}
                        aria-invalid={!!formErrors.code}
                        aria-describedby={formErrors.code ? 'acv-code-err' : 'acv-code-hint'}
                    />
                    {formErrors.code ? (
                        <p className="acv-error-text" id="acv-code-err">{Icon.alert(13)} {formErrors.code}</p>
                    ) : (
                        <p className="acv-hint" id="acv-code-hint">
                            {mode === 'edit'
                                ? 'Student and section records are linked to this code. Changing it will detach the records that use the old one.'
                                : 'Stored on every student record in this course, and used to name its sections (e.g. DIT-1A).'}
                        </p>
                    )}
                </div>

                <div className="acv-field">
                    <label className="acv-label" htmlFor="acv-desc">Description <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(optional)</span></label>
                    <textarea
                        id="acv-desc"
                        className="acv-input"
                        value={formDesc}
                        onChange={e => setFormDesc(e.target.value)}
                        placeholder="Short description of the course…"
                        rows={3}
                    />
                </div>

                <div className="acv-field">
                    <label className="acv-label" htmlFor="acv-status">Status</label>
                    <select
                        id="acv-status"
                        className="acv-input"
                        value={formActive ? 'active' : 'inactive'}
                        onChange={e => setFormActive(e.target.value === 'active')}
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <p className="acv-hint">
                        Inactive courses stay in the system and keep serving existing records, but are not
                        offered to students choosing a course for the first time.
                    </p>
                </div>

                {/* Renaming is free, but the code is the value other tables store.
                    Changing one that records already reference would orphan them,
                    so say so in as many words before the admin saves. */}
                {mode === 'edit' && dialog?.kind === 'edit'
                    && norm(formCode) !== norm(codeOf(dialog.course))
                    && usageFor(dialog.course).inUse && (
                        <div className="acv-note" data-tone="danger" style={{ marginBottom: '1rem' }}>
                            {Icon.warn(16)}
                            <span>
                                Changing the abbreviation from <strong>{codeOf(dialog.course)}</strong> to{' '}
                                <strong>{formCode.trim().toUpperCase() || '—'}</strong> will detach the{' '}
                                {describeUsage(usageFor(dialog.course))} that reference the old code. Rename the course
                                instead — the name can be changed freely.
                            </span>
                        </div>
                    )}

                {/* An edit that would hide a course still in use is worth flagging. */}
                {mode === 'edit' && dialog?.kind === 'edit'
                    && dialog.course.is_active !== false && !formActive
                    && usageFor(dialog.course).inUse && (
                        <div className="acv-note" data-tone="warn">
                            {Icon.warn(16)}
                            <span>
                                {describeUsage(usageFor(dialog.course))} currently use this course. They keep working —
                                only new selections are affected.
                            </span>
                        </div>
                    )}

                {formErrors.form && (
                    <div className="acv-note" data-tone="danger" role="alert" style={{ marginTop: '1rem' }}>
                        {Icon.alert()} <span>{formErrors.form}</span>
                    </div>
                )}
            </div>

            <div className="acv-dialog-foot">
                <button type="button" className="acv-btn" onClick={closeDialog}>Cancel</button>
                <button type="submit" className="acv-btn acv-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Add Course'}
                </button>
            </div>
        </form>
    );

    // ═══════════════════════════════════════════════════════════════════════
    return (
        <div className="acv-page">
            {/* ── Header ── */}
            <header className="acv-header">
                <div>
                    <h1 className="acv-title">Courses</h1>
                    <p className="acv-subtitle">
                        Manage and organize the academic courses available throughout the system.
                    </p>
                </div>
                <div className="acv-header-actions">
                    <button type="button" className="acv-btn acv-btn-primary" onClick={openCreate}>
                        {Icon.plus()} Add Course
                    </button>
                </div>
            </header>

            {/* ── Feedback ── */}
            {toast && (
                <div className={`acv-toast acv-toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                    {toast.tone === 'success' ? Icon.check() : Icon.alert()}
                    <span className="acv-toast-body">{toast.text}</span>
                    <button type="button" className="acv-dialog-close" onClick={() => setToast(null)} aria-label="Dismiss message">
                        {Icon.close(15)}
                    </button>
                </div>
            )}

            {loadError && (
                <div className="acv-toast acv-toast-error" role="alert">
                    {Icon.alert()}
                    <span className="acv-toast-body">{loadError}</span>
                    <button type="button" className="acv-btn acv-btn-sm" onClick={loadData}>
                        {Icon.refresh()} Retry
                    </button>
                </div>
            )}

            {/* ── Statistics ── */}
            <div className="acv-stats">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div className="acv-stat" key={i} aria-hidden="true">
                            <div className="acv-skeleton" style={{ width: 34, height: 34, borderRadius: 10 }} />
                            <div className="acv-stat-body" style={{ flex: 1 }}>
                                <div className="acv-skeleton" style={{ height: 8, width: '60%' }} />
                                <div className="acv-skeleton" style={{ height: 20, width: 40, marginTop: 9 }} />
                            </div>
                        </div>
                    ))
                ) : (
                    <>
                        <div className="acv-stat">
                            <div className="acv-stat-icon" data-tone="brand">{Icon.cap(18)}</div>
                            <div className="acv-stat-body">
                                <div className="acv-stat-label">Total Courses</div>
                                <div className="acv-stat-value">{courses.length}</div>
                            </div>
                        </div>
                        <div className="acv-stat">
                            <div className="acv-stat-icon" data-tone="ok">{Icon.check(18)}</div>
                            <div className="acv-stat-body">
                                <div className="acv-stat-label">Active</div>
                                <div className="acv-stat-value">{activeCount}</div>
                            </div>
                        </div>
                        <div className="acv-stat">
                            <div className="acv-stat-icon" data-tone="muted">{Icon.pause(18)}</div>
                            <div className="acv-stat-body">
                                <div className="acv-stat-label">Inactive</div>
                                <div className="acv-stat-value">{inactiveCount}</div>
                            </div>
                        </div>
                        <div className="acv-stat">
                            <div className="acv-stat-icon" data-tone="brand">{Icon.users(18)}</div>
                            <div className="acv-stat-body">
                                <div className="acv-stat-label">Students Enrolled</div>
                                <div className="acv-stat-value">{studentsUsingCourses}</div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Panel ── */}
            <section className="acv-panel" aria-label="Course catalogue">
                <div className="acv-toolbar">
                    <div className="acv-search">
                        <span className="acv-search-icon">{Icon.search()}</span>
                        <label className="acv-sr" htmlFor="acv-search-input">Search courses</label>
                        <input
                            id="acv-search-input"
                            type="search"
                            placeholder="Search courses by name or abbreviation…"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button type="button" className="acv-search-clear"
                                onClick={() => setSearchTerm('')} aria-label="Clear search">×</button>
                        )}
                    </div>

                    <div className="acv-toolbar-controls">
                        <label className="acv-sr" htmlFor="acv-status-filter">Filter by status</label>
                        <select
                            id="acv-status-filter"
                            className="acv-select"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                        >
                            <option value="all">Status: All</option>
                            <option value="active">Status: Active</option>
                            <option value="inactive">Status: Inactive</option>
                        </select>

                        <label className="acv-sr" htmlFor="acv-sort">Sort courses</label>
                        <select
                            id="acv-sort"
                            className="acv-select"
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)}
                        >
                            <option value="name-asc">Sort: Name A–Z</option>
                            <option value="name-desc">Sort: Name Z–A</option>
                            <option value="students-desc">Sort: Most students</option>
                            <option value="newest">Sort: Newest first</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="acv-skel-rows" aria-hidden="true">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div className="acv-skel-row" key={i}>
                                <div className="acv-skeleton" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
                                <div style={{ flex: 2 }}>
                                    <div className="acv-skeleton" style={{ height: 10, width: '55%', marginBottom: 8 }} />
                                    <div className="acv-skeleton" style={{ height: 8, width: '30%' }} />
                                </div>
                                <div className="acv-skeleton" style={{ flex: 1, height: 10 }} />
                                <div className="acv-skeleton" style={{ width: 70, height: 20, borderRadius: 999 }} />
                                <div className="acv-skeleton" style={{ width: 80, height: 28, borderRadius: 8 }} />
                            </div>
                        ))}
                    </div>
                ) : pageCourses.length === 0 ? (
                    <div className="acv-empty">
                        <div className="acv-empty-icon">{Icon.cap(24)}</div>
                        <div className="acv-empty-title">
                            {courses.length === 0 ? 'No courses available' : 'No courses match your filters'}
                        </div>
                        <p className="acv-empty-text">
                            {courses.length === 0
                                ? 'Create your first course to make it available for student onboarding.'
                                : 'Try a different search term, or reset the filters to see the full catalogue.'}
                        </p>
                        <div className="acv-empty-actions">
                            {courses.length === 0 ? (
                                <button type="button" className="acv-btn acv-btn-primary" onClick={openCreate}>
                                    {Icon.plus()} Add Course
                                </button>
                            ) : hasFilters && (
                                <button type="button" className="acv-btn" onClick={clearFilters}>Reset filters</button>
                            )}
                        </div>
                    </div>
                ) : isNarrow ? (
                    /* ── Mobile cards ── */
                    <div className="acv-cards">
                        {pageCourses.map(course => {
                            const u = usageFor(course);
                            return (
                                <article className="acv-card" key={course.id} data-inactive={course.is_active === false}>
                                    <div className="acv-card-top">
                                        <div className="acv-course-mark" aria-hidden="true">{codeOf(course).slice(0, 4)}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="acv-course-name">{course.name}</div>
                                            <div className="acv-course-sub">{codeOf(course)}</div>
                                        </div>
                                        {rowMenu(course)}
                                    </div>

                                    <div className="acv-card-badges">
                                        {statusBadge(course)}
                                        <span className="acv-badge" data-tone="muted">
                                            {u.students} student{u.students === 1 ? '' : 's'}
                                        </span>
                                    </div>

                                    {course.description && (
                                        <div className="acv-card-meta">
                                            <p className="acv-desc" style={{ maxWidth: 'none' }}>{course.description}</p>
                                        </div>
                                    )}

                                    <div className="acv-card-actions">
                                        <button type="button" className="acv-btn acv-btn-sm" onClick={() => setDialog({ kind: 'details', course })}>
                                            Details
                                        </button>
                                        <button type="button" className="acv-btn acv-btn-sm acv-btn-primary" onClick={() => openEdit(course)}>
                                            Edit
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    /* ── Desktop table ── */
                    <div className="acv-table-wrap">
                        <table className="acv-table">
                            <caption className="acv-sr">
                                Courses with their abbreviation, description, status and enrolled student count
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">Course</th>
                                    <th scope="col">Description</th>
                                    <th scope="col">Abbreviation</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Students</th>
                                    <th scope="col" className="acv-col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageCourses.map(course => {
                                    const u = usageFor(course);
                                    return (
                                        <tr key={course.id} data-inactive={course.is_active === false}>
                                            <td>
                                                <div className="acv-course-cell">
                                                    <div className="acv-course-mark" aria-hidden="true">{codeOf(course).slice(0, 4)}</div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="acv-course-name">{course.name}</div>
                                                        <div className="acv-course-sub">{codeOf(course)}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                {course.description
                                                    ? <p className="acv-desc">{course.description}</p>
                                                    : <span className="acv-muted">No description</span>}
                                            </td>
                                            <td><span className="acv-badge" data-tone="code">{codeOf(course)}</span></td>
                                            <td>{statusBadge(course)}</td>
                                            <td>
                                                <div className="acv-metric">{u.students}</div>
                                                <div className="acv-metric-sub">enrolled</div>
                                            </td>
                                            <td className="acv-col-actions">
                                                <div className="acv-row-actions">
                                                    <button type="button" className="acv-btn acv-btn-sm" onClick={() => openEdit(course)}>
                                                        {Icon.edit(13)} Edit
                                                    </button>
                                                    {rowMenu(course)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && pageCourses.length > 0 && (
                    <div style={{ padding: '0 1rem 1rem' }}>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                            itemName="courses"
                        />
                    </div>
                )}
            </section>

            {/* ══ DIALOG: ADD / EDIT ══ */}
            {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
                <div className="acv-scrim" onMouseDown={closeDialog}>
                    <div
                        className="acv-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="acv-form-title"
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div className="acv-dialog-head">
                            <div>
                                <h2 className="acv-dialog-title" id="acv-form-title">
                                    {dialog.kind === 'edit' ? 'Edit Course' : 'Add New Course'}
                                </h2>
                                <p className="acv-dialog-sub">
                                    {dialog.kind === 'edit'
                                        ? 'Changes apply across the portal as soon as they are saved.'
                                        : 'The course becomes selectable in student onboarding straight away.'}
                                </p>
                            </div>
                            <button type="button" className="acv-dialog-close" onClick={closeDialog} aria-label="Close dialog">
                                {Icon.close()}
                            </button>
                        </div>
                        {courseForm(dialog.kind)}
                    </div>
                </div>
            )}

            {/* ══ DIALOG: DETAILS ══ */}
            {dialog?.kind === 'details' && (() => {
                const course = dialog.course;
                const u = usageFor(course);
                return (
                    <div className="acv-scrim" onMouseDown={closeDialog}>
                        <div
                            className="acv-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="acv-detail-title"
                            tabIndex={-1}
                            ref={dialogRef}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <div className="acv-dialog-head">
                                <h2 className="acv-dialog-title" id="acv-detail-title">Course Details</h2>
                                <button type="button" className="acv-dialog-close" onClick={closeDialog} aria-label="Close dialog">
                                    {Icon.close()}
                                </button>
                            </div>

                            <div className="acv-dialog-body">
                                <div className="acv-detail-head">
                                    <div className="acv-detail-mark" aria-hidden="true">{codeOf(course).slice(0, 4)}</div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--admin-text-primary, var(--text-primary))' }}>
                                            {course.name}
                                        </div>
                                        <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <span className="acv-badge" data-tone="code">{codeOf(course)}</span>
                                            {statusBadge(course)}
                                        </div>
                                    </div>
                                </div>

                                <div className="acv-detail-block">
                                    <div className="acv-detail-key">Description</div>
                                    <div className="acv-detail-value" style={{ fontWeight: 500 }}>
                                        {course.description || <span className="acv-muted">No description provided.</span>}
                                    </div>
                                </div>

                                <div className="acv-detail-grid">
                                    <div className="acv-detail-cell">
                                        <div className="acv-detail-key">Students</div>
                                        <div className="acv-detail-value">{u.students}</div>
                                    </div>
                                    <div className="acv-detail-cell">
                                        <div className="acv-detail-key">Sections</div>
                                        <div className="acv-detail-value">{u.sections}</div>
                                    </div>
                                    <div className="acv-detail-cell">
                                        <div className="acv-detail-key">Created</div>
                                        <div className="acv-detail-value">{formatDate(course.created_at)}</div>
                                    </div>
                                    <div className="acv-detail-cell">
                                        <div className="acv-detail-key">Last Updated</div>
                                        <div className="acv-detail-value">{formatDate(course.updated_at)}</div>
                                    </div>
                                </div>

                                {course.is_active === false && (
                                    <div className="acv-note" data-tone="warn" style={{ marginTop: '1.1rem' }}>
                                        {Icon.warn(16)}
                                        <span>
                                            This course is inactive. Existing records keep it, but students choosing a
                                            course for the first time will not see it.
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="acv-dialog-foot">
                                <button type="button" className="acv-btn" onClick={closeDialog}>Close</button>
                                <button type="button" className="acv-btn acv-btn-primary" onClick={() => openEdit(course)}>
                                    {Icon.edit(13)} Edit Course
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ══ DIALOG: DELETE ══ */}
            {dialog?.kind === 'delete' && (() => {
                const course = dialog.course;
                const u = usageFor(course);
                const blocked = u.inUse;
                return (
                    <div className="acv-scrim" onMouseDown={closeDialog}>
                        <div
                            className="acv-dialog acv-dialog-sm"
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="acv-delete-title"
                            aria-describedby="acv-delete-desc"
                            tabIndex={-1}
                            ref={dialogRef}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <div className="acv-dialog-head">
                                <h2 className="acv-dialog-title" id="acv-delete-title">
                                    {blocked ? 'Course Is In Use' : 'Delete Course?'}
                                </h2>
                                <button type="button" className="acv-dialog-close" onClick={closeDialog} aria-label="Close dialog">
                                    {Icon.close()}
                                </button>
                            </div>

                            <div className="acv-dialog-body" id="acv-delete-desc">
                                {blocked ? (
                                    <>
                                        <div className="acv-note" data-tone="warn">
                                            {Icon.warn(16)}
                                            <span>
                                                <strong>{course.name} ({codeOf(course)})</strong> is currently being used by
                                                existing records. You cannot delete it. Deactivate the course instead.
                                            </span>
                                        </div>
                                        <p className="acv-hint" style={{ marginTop: '0.85rem' }}>
                                            In use by {describeUsage(u)}. Deleting it would leave those records pointing at a
                                            course that no longer exists.
                                        </p>
                                        {course.is_active === false && (
                                            <div className="acv-note" data-tone="info" style={{ marginTop: '0.85rem' }}>
                                                {Icon.alert(15)}
                                                <span>This course is already inactive, so it is not offered to new students.</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                                            Are you sure you want to delete <strong>&ldquo;{course.name}&rdquo; ({codeOf(course)})</strong>?
                                        </p>
                                        <div className="acv-note" data-tone="danger" style={{ marginTop: '0.85rem' }}>
                                            {Icon.warn(16)}
                                            <span>This action cannot be undone.</span>
                                        </div>
                                        <p className="acv-hint" style={{ marginTop: '0.85rem' }}>
                                            No students, accounts or sections reference this course, so removing it is safe.
                                        </p>
                                    </>
                                )}
                            </div>

                            <div className="acv-dialog-foot">
                                <button type="button" className="acv-btn" onClick={closeDialog}>Cancel</button>
                                {blocked ? (
                                    course.is_active !== false && (
                                        <button
                                            type="button"
                                            className="acv-btn acv-btn-primary"
                                            disabled={submitting}
                                            onClick={() => handleDeactivateFromDelete(course)}
                                        >
                                            {submitting ? 'Working…' : 'Deactivate Course'}
                                        </button>
                                    )
                                ) : (
                                    <button
                                        type="button"
                                        className="acv-btn acv-btn-danger"
                                        disabled={submitting}
                                        onClick={() => handleDelete(course)}
                                    >
                                        {submitting ? 'Deleting…' : 'Delete Course'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default AdminCoursesView;

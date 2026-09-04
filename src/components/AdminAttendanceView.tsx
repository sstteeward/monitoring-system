import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    attendanceService,
    type AttendanceStatus,
    type AdminAttendanceRow,
    type AdminStudentSummary,
    type AdminStudentHistoryRow,
    type AttendanceAuditEntry,
} from '../services/attendanceService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import AttendanceRecordModal from './AttendanceRecordModal';
import {
    ATTENDANCE_STATUS_CONFIG,
    formatDate,
    formatTime,
    formatDuration,
    toDateString,
    shiftDate,
    deriveAttendance,
    type Derived,
} from './attendanceConstants';
// AttendanceRecordModal's styles live in AttendanceView.css. Imported here
// explicitly rather than relying on another view happening to have loaded it.
import './AttendanceView.css';
import './AdminAttendanceView.css';

type StatusFilter = 'all' | AttendanceStatus | 'not_recorded' | 'flagged';
type Row = Derived<AdminAttendanceRow>;

/** The drawer shows either one day's record or a whole-student summary. */
type DrawerState =
    | { kind: 'detail'; row: Row }
    | { kind: 'summary'; row: Row }
    | null;

const HISTORY_PAGE_SIZE = 10;

// ─── Icons ───────────────────────────────────────────────────────────────────
const svg = (path: React.ReactNode, size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
    </svg>
);

const Icon = {
    users: (s = 16) => svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, s),
    check: (s = 16) => svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>, s),
    clock: (s = 16) => svg(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>, s),
    userX: (s = 16) => svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></>, s),
    warn: (s = 16) => svg(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, s),
    search: (s = 15) => svg(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, s),
    close: (s = 18) => svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, s),
    left: (s = 16) => svg(<polyline points="15 18 9 12 15 6" />, s),
    right: (s = 16) => svg(<polyline points="9 18 15 12 9 6" />, s),
    download: (s = 15) => svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>, s),
    eye: (s = 15) => svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, s),
    edit: (s = 15) => svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>, s),
    chart: (s = 15) => svg(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>, s),
    inbox: (s = 22) => svg(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>, s),
    refresh: (s = 15) => svg(<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>, s),
    alert: (s = 15) => svg(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, s),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

const fullName = (r: { first_name: string | null; last_name: string | null; email?: string | null }) =>
    `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || 'Unnamed student';

const initials = (r: { first_name: string | null; last_name: string | null; email?: string | null }) => {
    const a = r.first_name?.trim()?.[0];
    const b = r.last_name?.trim()?.[0];
    if (a || b) return `${a || ''}${b || ''}`.toUpperCase();
    return (r.email?.[0] || 'S').toUpperCase();
};

const longDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const statusTone = (status: AttendanceStatus | null) => status ?? 'not_recorded';

// ─── Component ───────────────────────────────────────────────────────────────
const AdminAttendanceView: React.FC = () => {
    const today = toDateString(new Date());

    const [date, setDate] = useState(today);
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    // Toolbar
    const [search, setSearch] = useState('');
    const [courseFilter, setCourseFilter] = useState('all');
    const [sectionFilter, setSectionFilter] = useState('all');
    const [companyFilter, setCompanyFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    // Drawer + correction
    const [drawer, setDrawer] = useState<DrawerState>(null);
    const [audit, setAudit] = useState<AttendanceAuditEntry[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [summary, setSummary] = useState<AdminStudentSummary | null>(null);
    const [history, setHistory] = useState<AdminStudentHistoryRow[]>([]);
    const [historyPage, setHistoryPage] = useState(0);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [correctTarget, setCorrectTarget] = useState<Row | null>(null);
    const [correctKey, setCorrectKey] = useState(0);

    const isNarrow = useMediaQuery('(max-width: 760px)');
    const drawerRef = useRef<HTMLDivElement | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const notify = (tone: 'success' | 'error', text: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ tone, text });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const load = useCallback(async (selectedDate: string) => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await attendanceService.getAdminAttendance(selectedDate);
            setRows(data.map(deriveAttendance));
        } catch (err) {
            console.error('Failed to load admin attendance:', err);
            setLoadError(
                err instanceof Error && /unauthor/i.test(err.message)
                    ? 'You are not authorized to view system-wide attendance.'
                    : 'Unable to load attendance records. Please try again.'
            );
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Changing the date refetches only this view — the shell is untouched.
    useEffect(() => { load(date); }, [date, load]);

    // ── Filter option lists, built from the loaded day ───────────────────────
    const courses = useMemo(
        () => Array.from(new Set(rows.map(r => r.program).filter(Boolean) as string[])).sort(),
        [rows]
    );
    const sections = useMemo(
        () => Array.from(new Set(rows.map(r => r.section_name).filter(Boolean) as string[])).sort(),
        [rows]
    );
    const companies = useMemo(
        () => Array.from(new Set(rows.map(r => r.company_name).filter(Boolean) as string[])).sort(),
        [rows]
    );

    // ── Filtering ────────────────────────────────────────────────────────────
    const term = search.trim().toLowerCase();

    const filtered = useMemo(() => rows.filter(r => {
        if (courseFilter !== 'all' && r.program !== courseFilter) return false;
        if (sectionFilter !== 'all' && r.section_name !== sectionFilter) return false;
        if (companyFilter !== 'all' && r.company_name !== companyFilter) return false;

        if (statusFilter === 'flagged') {
            if (r.anomalies.length === 0) return false;
        } else if (statusFilter === 'not_recorded') {
            if (r.effective_status !== null) return false;
        } else if (statusFilter !== 'all' && r.effective_status !== statusFilter) {
            return false;
        }

        if (!term) return true;
        const haystack = [
            fullName(r), r.email, r.section_name, r.program,
            r.department, r.company_name, r.year_level,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(term);
    }), [rows, courseFilter, sectionFilter, companyFilter, statusFilter, term]);

    const {
        currentPage, setCurrentPage, totalPages,
        paginatedItems: pageRows, totalItems, itemsPerPage,
    } = usePagination(filtered, 12);

    // ── Statistics for the selected date ─────────────────────────────────────
    const stats = useMemo(() => {
        const count = (s: AttendanceStatus) => rows.filter(r => r.effective_status === s).length;
        return {
            total: rows.length,
            present: count('present'),
            late: count('late'),
            absent: count('absent'),
            incomplete: count('incomplete'),
            onLeave: count('on_leave'),
            notRecorded: rows.filter(r => r.effective_status === null).length,
            flagged: rows.filter(r => r.anomalies.length > 0).length,
            hours: rows.reduce((sum, r) => sum + r.worked_hours, 0),
        };
    }, [rows]);

    // ── Drawer data ──────────────────────────────────────────────────────────
    const openDetail = (row: Row) => {
        setDrawer({ kind: 'detail', row });
        setAudit([]);
        if (row.attendance_id) {
            setLoadingAudit(true);
            attendanceService.getAttendanceAudit(row.attendance_id)
                .then(setAudit)
                .catch(err => console.error('Failed to load attendance audit:', err))
                .finally(() => setLoadingAudit(false));
        }
    };

    const loadSummary = useCallback(async (row: Row, page: number) => {
        setLoadingSummary(true);
        try {
            const [sum, hist] = await Promise.all([
                page === 0
                    ? attendanceService.getAdminStudentSummary(row.student_auth_id)
                    : Promise.resolve(null),
                attendanceService.getAdminStudentHistory(
                    row.student_auth_id, HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE
                ),
            ]);
            if (sum) setSummary(sum);
            setHistory(hist);
        } catch (err) {
            console.error('Failed to load student attendance summary:', err);
            notify('error', 'Unable to load this student’s attendance summary.');
        } finally {
            setLoadingSummary(false);
        }
    }, []);

    const openSummary = (row: Row) => {
        setDrawer({ kind: 'summary', row });
        setSummary(null);
        setHistory([]);
        setHistoryPage(0);
        loadSummary(row, 0);
    };

    const goHistoryPage = (page: number) => {
        if (!drawer || drawer.kind !== 'summary') return;
        setHistoryPage(page);
        loadSummary(drawer.row, page);
    };

    // ── Correction ───────────────────────────────────────────────────────────
    /**
     * Writes through the same `record_attendance` RPC the company and adviser
     * portals use, so the correction lands in `company_attendance` and is
     * mirrored into `company_attendance_audit` with the acting admin and a
     * timestamp. No separate admin write path exists.
     */
    const submitCorrection = async (
        status: AttendanceStatus,
        reason: string | null,
        remarks: string | null
    ) => {
        if (!correctTarget) return;
        await attendanceService.recordAttendance(
            correctTarget.student_auth_id, date, status, reason, remarks
        );
        setCorrectTarget(null);
        notify('success', `Attendance updated for ${fullName(correctTarget)}.`);
        await load(date);
        setDrawer(null);
    };

    // ── Export ───────────────────────────────────────────────────────────────
    /** Exports exactly what the filters currently show, never the whole table. */
    const exportCsv = () => {
        const header = [
            'Date', 'Section', 'Year Level', 'Course', 'Last Name', 'First Name', 'Email',
            'Company', 'Time In', 'Time Out', 'Hours Today', 'Total Rendered', 'Required Hours',
            'Status', 'Status Source', 'Reason', 'Remarks', 'Recorded By', 'Flags',
        ];
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = filtered.map(r => [
            date, r.section_name, r.year_level, r.program, r.last_name, r.first_name, r.email,
            r.company_name,
            r.time_in ? formatTime(r.time_in) : '',
            r.time_out ? formatTime(r.time_out) : '',
            r.worked_hours.toFixed(2),
            r.total_rendered_hours.toFixed(2),
            r.required_hours,
            ATTENDANCE_STATUS_CONFIG[statusTone(r.effective_status)].label,
            r.status ? 'Recorded' : r.effective_status ? 'Inferred from clock records' : 'Not recorded',
            r.reason, r.remarks, r.recorded_by_name,
            r.anomalies.join('; '),
        ].map(escape).join(','));

        const csv = [header.map(escape).join(','), ...lines].join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        notify('success', `Exported ${filtered.length} record${filtered.length === 1 ? '' : 's'} for ${formatDate(date)}.`);
    };

    // ── Overlay behaviour ────────────────────────────────────────────────────
    useEffect(() => {
        if (!drawer) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
        window.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        drawerRef.current?.focus();
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [drawer]);

    // ── Fragments ────────────────────────────────────────────────────────────
    const statusBadge = (row: Row) => {
        const key = statusTone(row.effective_status);
        const cfg = ATTENDANCE_STATUS_CONFIG[key];
        return (
            <>
                <span className="aav-badge" data-tone={key}>
                    <span className="aav-badge-dot" />
                    {cfg.label.toUpperCase()}
                </span>
                {/* A status the supervisor never recorded is labelled as inferred,
                    so an admin never mistakes it for an explicit judgement. */}
                {!row.status && row.effective_status && (
                    <div className="aav-inferred">from clock records</div>
                )}
            </>
        );
    };

    const hasFilters = term !== '' || courseFilter !== 'all' || sectionFilter !== 'all'
        || companyFilter !== 'all' || statusFilter !== 'all';

    const clearFilters = () => {
        setSearch(''); setCourseFilter('all'); setSectionFilter('all');
        setCompanyFilter('all'); setStatusFilter('all');
    };

    const toggleStatFilter = (key: StatusFilter) =>
        setStatusFilter(prev => (prev === key ? 'all' : key));

    const statCard = (
        key: StatusFilter,
        label: string,
        value: number | string,
        tone: string,
        icon: React.ReactNode,
        sub?: string
    ) => (
        <button
            type="button"
            className="aav-stat"
            aria-pressed={statusFilter === key}
            onClick={() => toggleStatFilter(key)}
            title={statusFilter === key ? 'Clear this filter' : `Show only ${label.toLowerCase()}`}
        >
            <span className="aav-stat-icon" data-tone={tone}>{icon}</span>
            <span className="aav-stat-body">
                <span className="aav-stat-label">{label}</span>
                <span className="aav-stat-value">{value}</span>
                {sub && <span className="aav-stat-sub">{sub}</span>}
            </span>
        </button>
    );

    // ═══════════════════════════════════════════════════════════════════════
    return (
        <div className="aav-page">
            {/* ── Header ── */}
            <header className="aav-header">
                <div>
                    <h1 className="aav-title">Attendance</h1>
                    <p className="aav-subtitle">
                        Monitor student attendance, time logs, and attendance status across all sections and companies.
                    </p>
                </div>
                <div className="aav-header-actions">
                    <div className="aav-datebar">
                        <button
                            type="button"
                            className="aav-step"
                            onClick={() => setDate(d => shiftDate(d, -1))}
                            aria-label="Previous day"
                            title="Previous day"
                        >
                            {Icon.left()}
                        </button>
                        <label className="aav-sr" htmlFor="aav-date">Attendance date</label>
                        <input
                            id="aav-date"
                            type="date"
                            value={date}
                            max={today}
                            onChange={e => e.target.value && setDate(e.target.value)}
                        />
                        <button
                            type="button"
                            className="aav-step"
                            onClick={() => setDate(d => shiftDate(d, 1))}
                            disabled={date >= today}
                            aria-label="Next day"
                            title="Next day"
                        >
                            {Icon.right()}
                        </button>
                    </div>
                    <button
                        type="button"
                        className="aav-btn"
                        onClick={() => setDate(today)}
                        disabled={date === today}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        className="aav-btn"
                        onClick={exportCsv}
                        disabled={loading || filtered.length === 0}
                        title="Exports the records currently shown by your filters"
                    >
                        {Icon.download()} Export CSV
                    </button>
                </div>
            </header>

            {/* ── Feedback ── */}
            {toast && (
                <div className={`aav-toast aav-toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                    {toast.tone === 'success' ? Icon.check() : Icon.alert()}
                    <span className="aav-toast-body">{toast.text}</span>
                    <button type="button" className="aav-drawer-close" onClick={() => setToast(null)} aria-label="Dismiss message">
                        {Icon.close(15)}
                    </button>
                </div>
            )}

            {loadError && (
                <div className="aav-toast aav-toast-error" role="alert">
                    {Icon.alert()}
                    <span className="aav-toast-body">{loadError}</span>
                    <button type="button" className="aav-btn aav-btn-sm" onClick={() => load(date)}>
                        {Icon.refresh()} Retry
                    </button>
                </div>
            )}

            {/* ── Statistics ── */}
            <div className="aav-stats" role="group" aria-label={`Attendance overview for ${longDate(date)}`}>
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div className="aav-stat" key={i} aria-hidden="true" style={{ cursor: 'default' }}>
                            <div className="aav-skeleton" style={{ width: 32, height: 32, borderRadius: 10 }} />
                            <div className="aav-stat-body" style={{ flex: 1 }}>
                                <div className="aav-skeleton" style={{ height: 8, width: '60%' }} />
                                <div className="aav-skeleton" style={{ height: 19, width: 38, marginTop: 9 }} />
                            </div>
                        </div>
                    ))
                ) : (
                    <>
                        {statCard('all', 'Total Students', stats.total, 'brand', Icon.users(17),
                            `${formatDuration(stats.hours)} rendered`)}
                        {statCard('present', 'Present', stats.present, 'ok', Icon.check(17),
                            stats.total > 0 ? `${Math.round((stats.present / stats.total) * 100)}% of roster` : undefined)}
                        {statCard('late', 'Late', stats.late, 'late', Icon.clock(17))}
                        {statCard('absent', 'Absent', stats.absent, 'danger', Icon.userX(17),
                            stats.notRecorded > 0 ? `${stats.notRecorded} not recorded` : undefined)}
                        {statCard('incomplete', 'Incomplete', stats.incomplete, 'late', Icon.warn(17),
                            stats.onLeave > 0 ? `${stats.onLeave} on leave` : undefined)}
                    </>
                )}
            </div>

            {/* ── Attention needed ── */}
            {!loading && stats.flagged > 0 && (
                <div className="aav-alert">
                    <span className="aav-alert-icon">{Icon.warn(17)}</span>
                    <div className="aav-alert-body">
                        <div className="aav-alert-title">
                            {stats.flagged} record{stats.flagged === 1 ? '' : 's'} need attention
                        </div>
                        <div className="aav-alert-text">
                            Their clock entries trip a check — a missing clock-out, an out-of-order pair,
                            several entries on one day, or an unusual length. Flagged rows carry a marker in the table.
                        </div>
                    </div>
                    <button
                        type="button"
                        className="aav-btn aav-btn-sm aav-btn-primary"
                        onClick={() => setStatusFilter(statusFilter === 'flagged' ? 'all' : 'flagged')}
                    >
                        {statusFilter === 'flagged' ? 'Show all records' : 'Review flagged'}
                    </button>
                </div>
            )}

            {/* ── Panel ── */}
            <section className="aav-panel" aria-label={`Attendance for ${longDate(date)}`}>
                <div className="aav-toolbar">
                    <div className="aav-search">
                        <span className="aav-search-icon">{Icon.search()}</span>
                        <label className="aav-sr" htmlFor="aav-search-input">Search attendance</label>
                        <input
                            id="aav-search-input"
                            type="search"
                            placeholder="Search student, section, company…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button type="button" className="aav-search-clear"
                                onClick={() => setSearch('')} aria-label="Clear search">×</button>
                        )}
                    </div>

                    <div className="aav-filters">
                        <label className="aav-sr" htmlFor="aav-course">Filter by course</label>
                        <select id="aav-course" className="aav-select" value={courseFilter}
                            onChange={e => setCourseFilter(e.target.value)}>
                            <option value="all">All Courses</option>
                            {courses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <label className="aav-sr" htmlFor="aav-section">Filter by section</label>
                        <select id="aav-section" className="aav-select" value={sectionFilter}
                            onChange={e => setSectionFilter(e.target.value)}>
                            <option value="all">All Sections</option>
                            {sections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <label className="aav-sr" htmlFor="aav-company">Filter by company</label>
                        <select id="aav-company" className="aav-select" value={companyFilter}
                            onChange={e => setCompanyFilter(e.target.value)}>
                            <option value="all">All Companies</option>
                            {companies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <label className="aav-sr" htmlFor="aav-status">Filter by status</label>
                        <select id="aav-status" className="aav-select" value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
                            <option value="all">All Status</option>
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="absent">Absent</option>
                            <option value="incomplete">Incomplete</option>
                            <option value="on_leave">On Leave</option>
                            <option value="not_recorded">Not Recorded</option>
                            <option value="flagged">Needs attention</option>
                        </select>

                        {hasFilters && (
                            <button type="button" className="aav-btn aav-btn-sm" onClick={clearFilters}>Clear</button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="aav-skel-rows" aria-hidden="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div className="aav-skel-row" key={i}>
                                <div className="aav-skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                                <div style={{ flex: 2 }}>
                                    <div className="aav-skeleton" style={{ height: 9, width: '50%', marginBottom: 8 }} />
                                    <div className="aav-skeleton" style={{ height: 8, width: '30%' }} />
                                </div>
                                <div className="aav-skeleton" style={{ flex: 1, height: 9 }} />
                                <div className="aav-skeleton" style={{ flex: 1, height: 9 }} />
                                <div className="aav-skeleton" style={{ width: 68, height: 19, borderRadius: 999 }} />
                                <div className="aav-skeleton" style={{ width: 58, height: 26, borderRadius: 8 }} />
                            </div>
                        ))}
                    </div>
                ) : pageRows.length === 0 ? (
                    <div className="aav-empty">
                        <div className="aav-empty-icon">{Icon.inbox()}</div>
                        <div className="aav-empty-title">
                            {rows.length === 0
                                ? 'No attendance records found for this date.'
                                : 'No records match your filters'}
                        </div>
                        <p className="aav-empty-text">
                            {rows.length === 0
                                ? `Nothing has been recorded or clocked for ${longDate(date)}, and no student is deployed. Try another date.`
                                : 'Try a different search term, or clear the filters to see every record for this date.'}
                        </p>
                        <div className="aav-empty-actions">
                            {rows.length === 0 ? (
                                date !== today && (
                                    <button type="button" className="aav-btn aav-btn-primary" onClick={() => setDate(today)}>
                                        Go to today
                                    </button>
                                )
                            ) : hasFilters && (
                                <button type="button" className="aav-btn" onClick={clearFilters}>Clear filters</button>
                            )}
                        </div>
                    </div>
                ) : isNarrow ? (
                    /* ── Mobile cards ── */
                    <div className="aav-cards">
                        {pageRows.map(r => (
                            <article className="aav-card" key={r.student_auth_id} data-flagged={r.anomalies.length > 0}>
                                <div className="aav-card-top">
                                    <div className="aav-avatar" aria-hidden="true">{initials(r)}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="aav-student-name">{fullName(r)}</div>
                                        <div className="aav-student-sub" style={{ maxWidth: 'none' }}>
                                            {[r.section_name, r.program].filter(Boolean).join(' • ') || '—'}
                                        </div>
                                        <div className="aav-student-sub" style={{ maxWidth: 'none' }}>
                                            {r.company_name || 'No company'}
                                        </div>
                                    </div>
                                    <div>{statusBadge(r)}</div>
                                </div>

                                <div className="aav-card-meta">
                                    <span className="aav-time">
                                        {r.time_in ? formatTime(r.time_in) : '—'} → {r.time_out ? formatTime(r.time_out) : '—'}
                                    </span>
                                    <span className="aav-metric">{formatDuration(r.worked_hours)}</span>
                                </div>

                                {r.anomalies.length > 0 && (
                                    <div style={{ marginTop: '0.6rem' }}>
                                        <span className="aav-badge" data-tone="flag">
                                            {Icon.warn(11)} {r.anomalies.length} flag{r.anomalies.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                )}

                                <div className="aav-card-actions">
                                    <button type="button" className="aav-btn aav-btn-sm" onClick={() => openSummary(r)}>
                                        {Icon.chart()} Summary
                                    </button>
                                    <button type="button" className="aav-btn aav-btn-sm aav-btn-primary" onClick={() => openDetail(r)}>
                                        {Icon.eye()} View
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    /* ── Desktop table ── */
                    <div className="aav-table-wrap">
                        <table className="aav-table">
                            <caption className="aav-sr">
                                Student attendance for {longDate(date)}, with section, course, company, clock times, hours and status
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">Student</th>
                                    <th scope="col">Section</th>
                                    <th scope="col">Course</th>
                                    <th scope="col">Company</th>
                                    <th scope="col">Time In</th>
                                    <th scope="col">Time Out</th>
                                    <th scope="col">Total Hours</th>
                                    <th scope="col">Status</th>
                                    <th scope="col" className="aav-col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map(r => (
                                    <tr key={r.student_auth_id} data-flagged={r.anomalies.length > 0}>
                                        <td>
                                            <div className="aav-student">
                                                <div className="aav-avatar" aria-hidden="true">{initials(r)}</div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="aav-student-name">{fullName(r)}</div>
                                                    <div className="aav-student-sub" title={r.email || ''}>{r.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div>{r.section_name || <span className="aav-muted">—</span>}</div>
                                            {r.year_level && <div className="aav-metric-sub">{r.year_level}</div>}
                                        </td>
                                        <td>{r.program || <span className="aav-muted">—</span>}</td>
                                        <td>{r.company_name || <span className="aav-muted">Not deployed</span>}</td>
                                        <td className="aav-time">{r.time_in ? formatTime(r.time_in) : <span className="aav-muted">—</span>}</td>
                                        <td className="aav-time">
                                            {r.time_out
                                                ? formatTime(r.time_out)
                                                : r.time_in
                                                    ? <span className="aav-badge" data-tone="flag">{Icon.warn(11)} Missing</span>
                                                    : <span className="aav-muted">—</span>}
                                        </td>
                                        <td>
                                            <div className="aav-metric">{formatDuration(r.worked_hours)}</div>
                                            {r.anomalies.length > 0 && (
                                                <div className="aav-metric-sub" style={{ color: 'var(--aav-late)' }}>
                                                    {r.anomalies.length} flag{r.anomalies.length === 1 ? '' : 's'}
                                                </div>
                                            )}
                                        </td>
                                        <td>{statusBadge(r)}</td>
                                        <td className="aav-col-actions">
                                            <div className="aav-row-actions">
                                                <button type="button" className="aav-icon-btn"
                                                    onClick={() => openSummary(r)}
                                                    aria-label={`Attendance summary for ${fullName(r)}`}
                                                    title="Attendance summary">
                                                    {Icon.chart()}
                                                </button>
                                                <button type="button" className="aav-btn aav-btn-sm"
                                                    onClick={() => openDetail(r)}>
                                                    {Icon.eye()} View
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && pageRows.length > 0 && (
                    <div style={{ padding: '0 1rem 1rem' }}>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                            itemName="records"
                        />
                    </div>
                )}
            </section>

            {/* ══ DRAWER ══ */}
            {drawer && (
                <div className="aav-scrim" onMouseDown={() => setDrawer(null)}>
                    <div
                        className="aav-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="aav-drawer-title"
                        tabIndex={-1}
                        ref={drawerRef}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        {drawer.kind === 'detail' ? (() => {
                            const r = drawer.row;
                            return (
                                <>
                                    <div className="aav-drawer-head">
                                        <div>
                                            <h2 className="aav-drawer-title" id="aav-drawer-title">Attendance Details</h2>
                                            <p className="aav-drawer-sub">{longDate(date)}</p>
                                        </div>
                                        <button type="button" className="aav-drawer-close" onClick={() => setDrawer(null)} aria-label="Close details">
                                            {Icon.close()}
                                        </button>
                                    </div>

                                    <div className="aav-drawer-body">
                                        <div className="aav-detail-head">
                                            <div className="aav-avatar aav-avatar-lg" aria-hidden="true">{initials(r)}</div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--admin-text-primary, var(--text-primary))' }}>
                                                    {fullName(r)}
                                                </div>
                                                <div className="aav-student-sub" style={{ maxWidth: '100%' }}>{r.email}</div>
                                                <div style={{ marginTop: '0.45rem' }}>{statusBadge(r)}</div>
                                            </div>
                                        </div>

                                        <div className="aav-detail-grid">
                                            <div className="aav-detail-cell">
                                                <div className="aav-detail-key">Course</div>
                                                <div className="aav-detail-value">{r.program || '—'}</div>
                                            </div>
                                            <div className="aav-detail-cell">
                                                <div className="aav-detail-key">Section</div>
                                                <div className="aav-detail-value">{r.section_name || '—'}</div>
                                            </div>
                                            <div className="aav-detail-cell" data-span="2">
                                                <div className="aav-detail-key">Company</div>
                                                <div className="aav-detail-value">{r.company_name || 'Not deployed'}</div>
                                            </div>
                                            <div className="aav-detail-cell">
                                                <div className="aav-detail-key">Time In</div>
                                                <div className="aav-detail-value">{r.time_in ? formatTime(r.time_in) : '—'}</div>
                                            </div>
                                            <div className="aav-detail-cell">
                                                <div className="aav-detail-key">Time Out</div>
                                                <div className="aav-detail-value">{r.time_out ? formatTime(r.time_out) : '—'}</div>
                                            </div>
                                            <div className="aav-detail-cell">
                                                <div className="aav-detail-key">Total Hours</div>
                                                <div className="aav-detail-value">{formatDuration(r.worked_hours)}</div>
                                            </div>
                                            <div className="aav-detail-cell">
                                                <div className="aav-detail-key">Scheduled</div>
                                                <div className="aav-detail-value">
                                                    {r.schedule_start && r.schedule_end
                                                        ? `${r.schedule_start.slice(0, 5)} – ${r.schedule_end.slice(0, 5)}`
                                                        : '—'}
                                                </div>
                                            </div>
                                            {r.reason && (
                                                <div className="aav-detail-cell" data-span="2">
                                                    <div className="aav-detail-key">Reason</div>
                                                    <div className="aav-detail-value" style={{ fontWeight: 500 }}>{r.reason}</div>
                                                </div>
                                            )}
                                            {r.remarks && (
                                                <div className="aav-detail-cell" data-span="2">
                                                    <div className="aav-detail-key">Remarks</div>
                                                    <div className="aav-detail-value" style={{ fontWeight: 500 }}>{r.remarks}</div>
                                                </div>
                                            )}
                                        </div>

                                        {r.anomalies.length > 0 && (
                                            <>
                                                <div className="aav-section-title">Needs Attention</div>
                                                <div className="aav-note" data-tone="warn">
                                                    {Icon.warn(15)}
                                                    <ul className="aav-flag-list">
                                                        {r.anomalies.map(a => <li key={a}>{a}</li>)}
                                                    </ul>
                                                </div>
                                            </>
                                        )}

                                        {!r.status && (
                                            <div className="aav-note" data-tone="info" style={{ marginTop: '1.1rem' }}>
                                                {Icon.alert(14)}
                                                <span>
                                                    No status has been recorded for this student on this date. Anything shown
                                                    above comes from their clock records.
                                                </span>
                                            </div>
                                        )}

                                        <div className="aav-section-title">
                                            Change History
                                            {r.recorded_by_name && <span style={{ textTransform: 'none', letterSpacing: 0 }}>Recorded by {r.recorded_by_name}</span>}
                                        </div>
                                        {!r.attendance_id ? (
                                            <p className="aav-muted" style={{ fontSize: '0.82rem' }}>
                                                No attendance record exists yet, so there is nothing to audit.
                                            </p>
                                        ) : loadingAudit ? (
                                            <div className="aav-skeleton" style={{ height: 46 }} />
                                        ) : audit.length === 0 ? (
                                            <p className="aav-muted" style={{ fontSize: '0.82rem' }}>No changes recorded.</p>
                                        ) : (
                                            <div className="aav-history">
                                                {audit.map(entry => (
                                                    <div className="aav-history-row" key={entry.id}>
                                                        <span className="aav-history-date">
                                                            {formatDate(entry.changed_at)}
                                                        </span>
                                                        <span className="aav-history-times">
                                                            {entry.action === 'created' ? 'Recorded as ' : `Changed from ${entry.old_status ?? '—'} to `}
                                                            <strong>{entry.new_status}</strong>
                                                            {entry.changed_by_name ? ` by ${entry.changed_by_name}` : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="aav-drawer-foot">
                                        <button type="button" className="aav-btn" onClick={() => openSummary(r)}>
                                            {Icon.chart()} Student Summary
                                        </button>
                                        <button
                                            type="button"
                                            className="aav-btn aav-btn-primary"
                                            disabled={!r.company_id}
                                            title={r.company_id
                                                ? 'Correct the recorded status for this date'
                                                : 'This student is not deployed to a company, so attendance cannot be recorded'}
                                            onClick={() => { setCorrectKey(k => k + 1); setCorrectTarget(r); }}
                                        >
                                            {Icon.edit()} {r.status ? 'Edit Attendance' : 'Record Attendance'}
                                        </button>
                                    </div>
                                </>
                            );
                        })() : (() => {
                            const r = drawer.row;
                            const recorded = summary
                                ? summary.present_count + summary.late_count + summary.absent_count
                                + summary.on_leave_count + summary.incomplete_count
                                : 0;
                            const attended = summary ? summary.present_count + summary.late_count : 0;
                            const rate = recorded > 0 ? Math.round((attended / recorded) * 100) : 0;
                            const totalPages = history.length > 0
                                ? Math.max(1, Math.ceil(history[0].total_count / HISTORY_PAGE_SIZE))
                                : 1;
                            return (
                                <>
                                    <div className="aav-drawer-head">
                                        <div>
                                            <h2 className="aav-drawer-title" id="aav-drawer-title">{fullName(r)}</h2>
                                            <p className="aav-drawer-sub">
                                                {[r.section_name, r.program, r.company_name].filter(Boolean).join(' • ') || 'Attendance summary'}
                                            </p>
                                        </div>
                                        <button type="button" className="aav-drawer-close" onClick={() => setDrawer(null)} aria-label="Close summary">
                                            {Icon.close()}
                                        </button>
                                    </div>

                                    <div className="aav-drawer-body">
                                        <div className="aav-section-title">Attendance Summary</div>
                                        {loadingSummary && !summary ? (
                                            <div className="aav-skeleton" style={{ height: 76 }} />
                                        ) : summary ? (
                                            <>
                                                <div className="aav-summary-grid">
                                                    <div className="aav-summary-cell">
                                                        <div className="aav-summary-value">{summary.present_count}</div>
                                                        <div className="aav-summary-label">Present</div>
                                                    </div>
                                                    <div className="aav-summary-cell">
                                                        <div className="aav-summary-value">{summary.late_count}</div>
                                                        <div className="aav-summary-label">Late</div>
                                                    </div>
                                                    <div className="aav-summary-cell">
                                                        <div className="aav-summary-value">{summary.absent_count}</div>
                                                        <div className="aav-summary-label">Absent</div>
                                                    </div>
                                                    <div className="aav-summary-cell">
                                                        <div className="aav-summary-value">{summary.incomplete_count}</div>
                                                        <div className="aav-summary-label">Incomplete</div>
                                                    </div>
                                                </div>

                                                <div className="aav-detail-grid">
                                                    <div className="aav-detail-cell">
                                                        <div className="aav-detail-key">Total Hours</div>
                                                        <div className="aav-detail-value">{formatDuration(summary.total_rendered_hours)}</div>
                                                        <div className="aav-metric-sub">
                                                            of {summary.required_hours || 0}h required · {summary.logged_days} day{summary.logged_days === 1 ? '' : 's'} logged
                                                        </div>
                                                    </div>
                                                    <div className="aav-detail-cell">
                                                        <div className="aav-detail-key">Attendance Rate</div>
                                                        <div className="aav-detail-value">
                                                            {recorded > 0 ? `${rate}%` : '—'}
                                                        </div>
                                                        <div className="aav-rate" aria-hidden="true">
                                                            <div className="aav-rate-fill" style={{ width: `${rate}%` }} />
                                                        </div>
                                                        <div className="aav-metric-sub" style={{ marginTop: 4 }}>
                                                            {recorded > 0
                                                                ? `${attended} of ${recorded} recorded days`
                                                                : 'No recorded days yet'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="aav-muted" style={{ fontSize: '0.82rem' }}>Summary unavailable.</p>
                                        )}

                                        <div className="aav-section-title">
                                            Attendance History
                                            {history.length > 0 && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{history[0].total_count} day{history[0].total_count === 1 ? '' : 's'}</span>}
                                        </div>
                                        {loadingSummary ? (
                                            <div className="aav-skeleton" style={{ height: 120 }} />
                                        ) : history.length === 0 ? (
                                            <p className="aav-muted" style={{ fontSize: '0.82rem' }}>
                                                No attendance records or clock entries for this student yet.
                                            </p>
                                        ) : (
                                            <>
                                                <div className="aav-history">
                                                    {history.map(h => {
                                                        const derived = deriveAttendance({
                                                            time_in: h.time_in, time_out: h.time_out, status: h.status,
                                                            worked_hours: h.worked_hours,
                                                            timesheet_count: h.timesheet_count,
                                                            open_timesheet_count: h.open_timesheet_count,
                                                        });
                                                        const key = statusTone(derived.effective_status);
                                                        return (
                                                            <div className="aav-history-row" key={h.record_date}>
                                                                <span className="aav-history-date">{formatDate(h.record_date)}</span>
                                                                <span className="aav-history-times">
                                                                    {h.time_in ? formatTime(h.time_in) : '—'} → {h.time_out ? formatTime(h.time_out) : '—'}
                                                                    {' · '}{formatDuration(h.worked_hours)}
                                                                </span>
                                                                <span className="aav-badge" data-tone={key}>
                                                                    <span className="aav-badge-dot" />
                                                                    {ATTENDANCE_STATUS_CONFIG[key].label}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {totalPages > 1 && (
                                                    <div className="aav-pager">
                                                        <span>Page {historyPage + 1} of {totalPages}</span>
                                                        <span style={{ display: 'flex', gap: '0.4rem' }}>
                                                            <button type="button" className="aav-btn aav-btn-sm"
                                                                disabled={historyPage === 0 || loadingSummary}
                                                                onClick={() => goHistoryPage(historyPage - 1)}>
                                                                Previous
                                                            </button>
                                                            <button type="button" className="aav-btn aav-btn-sm"
                                                                disabled={historyPage + 1 >= totalPages || loadingSummary}
                                                                onClick={() => goHistoryPage(historyPage + 1)}>
                                                                Next
                                                            </button>
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div className="aav-drawer-foot">
                                        <button type="button" className="aav-btn" onClick={() => openDetail(r)}>
                                            {Icon.eye()} This Day&rsquo;s Record
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* ══ CORRECTION ══ reuses the portal's shared record/edit dialog ══ */}
            {correctTarget && (
                <AttendanceRecordModal
                    key={correctKey}
                    open
                    studentName={fullName(correctTarget)}
                    studentEmail={correctTarget.email}
                    date={date}
                    existingStatus={correctTarget.status}
                    existingReason={correctTarget.reason}
                    existingRemarks={correctTarget.remarks}
                    defaultStatus={correctTarget.status ?? correctTarget.effective_status ?? 'present'}
                    isEditing={!!correctTarget.status}
                    onClose={() => setCorrectTarget(null)}
                    onSubmit={submitCorrection}
                />
            )}
        </div>
    );
};

export default AdminAttendanceView;

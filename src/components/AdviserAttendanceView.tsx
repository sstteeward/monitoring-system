import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { attendanceService, type AttendanceStatus, type AdviserAttendanceRow } from '../services/attendanceService';
import { adviserService, type Section } from '../services/adviserService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableSkeleton, TableRowSkeleton } from './Skeletons';
import AttendanceDetailModal from './AttendanceDetailModal';
import {
    ATTENDANCE_STATUS_CONFIG,
    formatTime,
    formatHours,
    toDateString,
    shiftDate,
    deriveAttendance,
    type Derived,
} from './attendanceConstants';
import './AttendanceView.css';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

type StatusFilter = 'all' | AttendanceStatus | 'not_recorded';

/* ── Icons ──────────────────────────────────────────────────────────────────
   The project has no icon package; every view draws feather-style inline SVGs.
   These follow that convention so the page needs no new dependency, and they
   replace the emoji this page previously used. */
type IconProps = { size?: number; color?: string };

const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 16, color = 'currentColor', children }) => (
    <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"
    >
        {children}
    </svg>
);

const IconAlert: React.FC<IconProps> = p => (
    <Svg {...p}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
);
const IconChevronLeft: React.FC<IconProps> = p => (<Svg {...p}><polyline points="15 18 9 12 15 6" /></Svg>);
const IconChevronRight: React.FC<IconProps> = p => (<Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>);
const IconRefresh: React.FC<IconProps> = p => (
    <Svg {...p}>
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Svg>
);
const IconEye: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>
);

/* The status/anomaly rules, the date helpers and the hour formatter now live
   in attendanceConstants so the adviser and admin monitors flag identically.
   Behaviour here is unchanged apart from one added rule: a day over 16 hours
   is now flagged as excessive. */
type DerivedRow = Derived<AdviserAttendanceRow>;
const derive = deriveAttendance<AdviserAttendanceRow>;

const AdviserAttendanceView: React.FC = () => {
    const todayStr = toDateString(new Date());

    const [date, setDate] = useState(todayStr);
    const [sections, setSections] = useState<Section[]>([]);
    const [sectionId, setSectionId] = useState<string>('');
    const [rows, setRows] = useState<DerivedRow[]>([]);

    const [sectionsLoading, setSectionsLoading] = useState(true);
    const [sectionsError, setSectionsError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const [detailTarget, setDetailTarget] = useState<DerivedRow | null>(null);
    const [detailModalKey, setDetailModalKey] = useState(0);

    // ── Assigned sections ───────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setSectionsLoading(true);
        setSectionsError(null);

        adviserService.getMySections()
            .then(data => {
                if (cancelled) return;
                setSections(data);
                // Open on the first assigned section so the page is useful immediately.
                if (data.length > 0) setSectionId(prev => prev || data[0].id);
                setSectionsLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                console.error('Failed to load assigned sections:', err);
                setSectionsError(err instanceof Error ? err.message : 'Failed to load your assigned sections.');
                setSectionsLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    // ── Attendance for the selected section + date ──────────────────────────
    const loadAttendance = useCallback(async (signal: { cancelled: boolean }) => {
        if (!sectionId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await attendanceService.getAdviserAttendance(date, sectionId);
            if (signal.cancelled) return;
            setRows(data.map(derive));
        } catch (err) {
            if (signal.cancelled) return;
            console.error('Failed to load attendance:', err);
            setError(err instanceof Error ? err.message : 'Failed to load attendance.');
            setRows([]);
        } finally {
            if (!signal.cancelled) setLoading(false);
        }
    }, [sectionId, date]);

    useEffect(() => {
        const signal = { cancelled: false };
        loadAttendance(signal);
        return () => { signal.cancelled = true; };
    }, [loadAttendance]);

    const refresh = () => loadAttendance({ cancelled: false });

    const selectedSection = sections.find(s => s.id === sectionId) ?? null;

    // ── Summary ─────────────────────────────────────────────────────────────
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
            avgHours: rows.length ? rows.reduce((sum, r) => sum + r.worked_hours, 0) / rows.length : 0,
        };
    }, [rows]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (statusFilter === 'not_recorded') {
                if (r.effective_status !== null) return false;
            } else if (statusFilter !== 'all' && r.effective_status !== statusFilter) {
                return false;
            }
            if (!q) return true;
            const name = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
            return name.includes(q)
                || (r.email || '').toLowerCase().includes(q);
        });
    }, [rows, statusFilter, search]);

    const {
        currentPage, setCurrentPage, totalPages, paginatedItems, totalItems, itemsPerPage,
    } = usePagination(filteredRows, 12);

    const openDetail = (row: DerivedRow) => {
        setDetailModalKey(k => k + 1);
        setDetailTarget(row);
    };

    const statusBadge = (status: AttendanceStatus | null) => {
        const key = status ?? 'not_recorded';
        const cfg = ATTENDANCE_STATUS_CONFIG[key];
        return (
            <span className={`ad-att-badge ${cfg.className}`}>
                <i /> {cfg.label}
            </span>
        );
    };

    // ── Section-level states ────────────────────────────────────────────────
    if (sectionsLoading) {
        return (
            <div className="fade-in">
                <TableSkeleton rows={4} cols={5} />
            </div>
        );
    }

    if (sectionsError) {
        return (
            <div className="fade-in ad-att-card">
                <div className="ad-att-empty">
                    <h3>Failed to Load</h3>
                    <p>{sectionsError}</p>
                    <button type="button" className="ad-att-btn" onClick={() => window.location.reload()}>
                        <IconRefresh size={14} /> Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (sections.length === 0) {
        return (
            <div className="fade-in ad-att-card">
                <div className="ad-att-empty">
                    <h3>No Sections Assigned</h3>
                    <p>You currently don't have any sections assigned to you. Please contact the SIL Coordinator.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            {/* ── Toolbar ── */}
            <div className="ad-att-toolbar">
                <div className="ad-att-field">
                    <label className="ad-att-field-label" htmlFor="ad-att-section">Section</label>
                    <select
                        id="ad-att-section"
                        className="ad-att-input"
                        value={sectionId}
                        onChange={e => { setSectionId(e.target.value); setCurrentPage(1); }}
                    >
                        {sections.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} — {s.student_count ?? 0} student{(s.student_count ?? 0) !== 1 ? 's' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="ad-att-field">
                    <label className="ad-att-field-label" htmlFor="ad-att-date">Date</label>
                    <input
                        id="ad-att-date"
                        type="date"
                        className="ad-att-input"
                        value={date}
                        max={todayStr}
                        onChange={e => { if (e.target.value) { setDate(e.target.value); setCurrentPage(1); } }}
                    />
                </div>

                <div className="ad-att-group">
                    <button
                        type="button" className="ad-att-btn ad-att-btn--icon" aria-label="Previous day"
                        onClick={() => { setDate(d => shiftDate(d, -1)); setCurrentPage(1); }}
                    >
                        <IconChevronLeft size={15} />
                    </button>
                    <button
                        type="button" className="ad-att-btn"
                        disabled={date === todayStr}
                        onClick={() => { setDate(todayStr); setCurrentPage(1); }}
                    >
                        Today
                    </button>
                    <button
                        type="button" className="ad-att-btn ad-att-btn--icon" aria-label="Next day"
                        disabled={date >= todayStr}
                        onClick={() => { setDate(d => shiftDate(d, 1)); setCurrentPage(1); }}
                    >
                        <IconChevronRight size={15} />
                    </button>
                </div>

                <div className="ad-att-group ad-att-push">
                    <button type="button" className="ad-att-btn" onClick={refresh} disabled={loading}>
                        <IconRefresh size={14} /> {loading ? 'Refreshing' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* ── Summary ── */}
            {!loading && !error && rows.length > 0 && (
                <div className="ad-att-card">
                    <div className="ad-att-strip">
                        <div className="ad-att-metric"><span>Students</span><strong>{stats.total}</strong></div>
                        <div className="ad-att-metric"><span>Present</span><strong>{stats.present}</strong></div>
                        <div className="ad-att-metric"><span>Late</span><strong>{stats.late}</strong></div>
                        <div className="ad-att-metric"><span>Absent</span><strong>{stats.absent}</strong></div>
                    </div>
                </div>
            )}

            {/* ── Roster ── */}
            <div className="ad-att-card">
                <div className="ad-att-card-head">
                    <div>
                        <h2>Daily Attendance Monitoring</h2>
                        <p>{selectedSection?.name} · time records and SIL progress</p>
                    </div>
                    <div className="ad-att-tools">
                        <input
                            type="text"
                            className="ad-att-input ad-att-search"
                            placeholder="Search student name or email"
                            aria-label="Search students by name or email"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        />
                        <select
                            className="ad-att-input"
                            aria-label="Filter by status"
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1); }}
                        >
                            <option value="all">All Statuses</option>
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="absent">Absent</option>
                            <option value="on_leave">On Leave</option>
                            <option value="incomplete">Incomplete</option>
                            <option value="not_recorded">Not Recorded</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="ad-att-scroll">
                        <table className="ad-att-table">
                            <tbody>
                                <TableRowSkeleton rows={5} cols={7} />
                            </tbody>
                        </table>
                    </div>
                ) : error ? (
                    <div className="ad-att-empty">
                        <h3>Failed to Load</h3>
                        <p>We couldn't load attendance data. {error}</p>
                        <button type="button" className="ad-att-btn" onClick={refresh}>
                            <IconRefresh size={14} /> Try Again
                        </button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="ad-att-empty">
                        <h3>No Students</h3>
                        <p>There are no students assigned to {selectedSection?.name ?? 'this section'}.</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="ad-att-empty">
                        <h3>No Matching Records</h3>
                        <p>No students in {selectedSection?.name} match the current search and filter.</p>
                    </div>
                ) : (
                    <>
                        <div className="ad-att-scroll">
                            <table className="ad-att-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Time In</th>
                                        <th>Time Out</th>
                                        <th>Hours</th>
                                        <th>SIL Progress</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedItems.map(row => {
                                        const pct = row.required_hours > 0
                                            ? Math.min(100, Math.round((row.total_rendered_hours / row.required_hours) * 1000) / 10)
                                            : 0;
                                        return (
                                            <tr key={row.student_auth_id}>
                                                <td>
                                                    <div className="ad-att-name">{row.first_name} {row.last_name}</div>
                                                    <div className="ad-att-mail">{row.email}</div>
                                                    {row.anomalies.length > 0 && (
                                                        <span className="ad-att-flag" title={row.anomalies.join('\n')}>
                                                            <IconAlert size={11} /> {row.anomalies[0]}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="ad-att-num">{row.time_in ? formatTime(row.time_in) : '—'}</td>
                                                <td className="ad-att-num">{row.time_out ? formatTime(row.time_out) : '—'}</td>
                                                <td className="ad-att-num">{formatHours(row.worked_hours)}</td>
                                                <td>
                                                    <div className="ad-att-ojt">
                                                        <div className="ad-att-ojt-top">
                                                            {Math.round(row.total_rendered_hours)} / {row.required_hours}h
                                                        </div>
                                                        <div className="ad-att-ojt-bar">
                                                            <span style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <div className="ad-att-ojt-sub">{pct}%</div>
                                                    </div>
                                                </td>
                                                <td>{statusBadge(row.effective_status)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button type="button" className="ad-att-view" onClick={() => openDetail(row)}>
                                                        <IconEye size={13} /> View
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ padding: '0.6rem 0.95rem' }}>
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={totalItems}
                                itemsPerPage={itemsPerPage}
                                onPageChange={setCurrentPage}
                                itemName="students"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Read-only for advisers: `record_attendance` accepts only company,
                coordinator and admin callers, so offering a write action here
                would fail on every click. The detail modal still shows the full
                record and its change history. */}
            {detailTarget && (
                <AttendanceDetailModal
                    key={detailModalKey}
                    open={Boolean(detailTarget)}
                    row={detailTarget}
                    date={date}
                    companyName={detailTarget.company_name}
                    canRecord={false}
                    onClose={() => setDetailTarget(null)}
                    onRecord={() => { /* advisers cannot record attendance */ }}
                />
            )}
        </div>
    );
};

export default AdviserAttendanceView;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { attendanceService, type AttendanceStatus, type AdviserAttendanceRow } from '../services/attendanceService';
import { adviserService, type Section } from '../services/adviserService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableRowSkeleton } from './Skeletons';
import AttendanceDetailModal from './AttendanceDetailModal';
import { ATTENDANCE_STATUS_CONFIG, formatTime } from './attendanceConstants';
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

const IconUsers: React.FC<IconProps> = p => (
    <Svg {...p}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </Svg>
);
const IconCheck: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></Svg>
);
const IconClock: React.FC<IconProps> = p => (
    <Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>
);
const IconAbsent: React.FC<IconProps> = p => (
    <Svg {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></Svg>
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
const IconDownload: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>
);
const IconEye: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>
);

/** A row plus the status and anomalies derived from its clock records. */
interface DerivedRow extends AdviserAttendanceRow {
    effective_status: AttendanceStatus | null;
    anomalies: string[];
}

const toDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const shiftDate = (dateStr: string, days: number) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toDateString(d);
};

const formatHours = (hours: number) => `${(Math.round(hours * 100) / 100).toFixed(2)}h`;

/**
 * Resolves the status shown for a student, and flags clock records that need a
 * second look.
 *
 * A recorded status always wins — it is the supervisor's explicit judgement.
 * Only when nothing has been recorded is a status inferred from the day's
 * timesheets, so an unrecorded student reads as "Not Recorded" rather than
 * being silently reported as absent.
 */
function derive(row: AdviserAttendanceRow): DerivedRow {
    const anomalies: string[] = [];

    if (row.time_in && !row.time_out) anomalies.push('Clocked in without clocking out');
    if (row.open_timesheet_count > 0) anomalies.push(`${row.open_timesheet_count} open timesheet entr${row.open_timesheet_count === 1 ? 'y' : 'ies'}`);
    if (row.time_in && row.time_out && new Date(row.time_out) < new Date(row.time_in)) {
        anomalies.push('Clock-out is before clock-in');
    }
    if (row.timesheet_count > 1) anomalies.push(`${row.timesheet_count} separate entries on this date`);
    if (row.time_in && row.time_out && row.worked_hours > 0 && row.worked_hours < 1) {
        anomalies.push('Unusually short rendered time');
    }

    let effective_status: AttendanceStatus | null = row.status;
    if (!effective_status) {
        if (row.open_timesheet_count > 0) effective_status = 'incomplete';
        else if (row.time_in && row.time_out) effective_status = 'present';
    }

    return { ...row, effective_status, anomalies };
}

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

    /** Share of the roster with an accounted-for, non-absent status. */
    const attendanceRate = stats.total
        ? Math.round(((stats.present + stats.late + stats.onLeave) / stats.total) * 100)
        : 0;

    const kpis = [
        { label: 'Total Students', value: stats.total, sub: `In ${selectedSection?.name ?? 'section'}`, color: '#3b82f6', Icon: IconUsers },
        { label: 'Present', value: stats.present, sub: `${attendanceRate}% attendance rate`, color: '#10b981', Icon: IconCheck },
        { label: 'Late', value: stats.late, sub: 'Past grace period', color: '#f59e0b', Icon: IconClock },
        { label: 'Absent', value: stats.absent, sub: `${stats.notRecorded} not yet recorded`, color: '#ef4444', Icon: IconAbsent },
        { label: 'Incomplete', value: stats.incomplete, sub: `${stats.flagged} flagged`, color: '#fb923c', Icon: IconAlert },
    ];

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
                || (r.email || '').toLowerCase().includes(q)
                || (r.student_profile_id || '').toLowerCase().includes(q);
        });
    }, [rows, statusFilter, search]);

    const {
        currentPage, setCurrentPage, totalPages, paginatedItems, totalItems, itemsPerPage,
    } = usePagination(filteredRows, 12);

    const openDetail = (row: DerivedRow) => {
        setDetailModalKey(k => k + 1);
        setDetailTarget(row);
    };

    const exportCsv = () => {
        const header = [
            'Section', 'Student ID', 'Last Name', 'First Name', 'Email',
            'Date', 'Time In', 'Time Out', 'Hours Today',
            'Total Rendered', 'Required Hours', 'Status', 'Reason', 'Remarks', 'Flags',
        ];
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = filteredRows.map(r => [
            r.section_name, r.student_profile_id, r.last_name, r.first_name, r.email,
            date,
            r.time_in ? formatTime(r.time_in) : '',
            r.time_out ? formatTime(r.time_out) : '',
            r.worked_hours.toFixed(2),
            r.total_rendered_hours.toFixed(2),
            r.required_hours,
            ATTENDANCE_STATUS_CONFIG[(r.effective_status ?? 'not_recorded')].label,
            r.reason, r.remarks, r.anomalies.join('; '),
        ].map(escape).join(','));

        const csv = [header.map(escape).join(','), ...lines].join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-${selectedSection?.name ?? 'section'}-${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
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
            <div className="fade-in ad-att-card" style={{ padding: '0.75rem' }}>
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
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
                    <p>You currently don't have any sections assigned to you. Please contact the SIL/OJT Coordinator.</p>
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
                                {s.name} ({s.course_code}) — {s.student_count ?? 0} students
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
                    <button type="button" className="ad-att-btn" onClick={exportCsv} disabled={filteredRows.length === 0}>
                        <IconDownload size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {/* ── Summary ── */}
            <div className="ad-att-kpis">
                {kpis.map(({ label, value, sub, color, Icon }) => (
                    <div className="ad-att-kpi" key={label}>
                        <span className="ad-att-kpi-icon" style={{ background: `${color}1f` }}>
                            <Icon size={17} color={color} />
                        </span>
                        <div className="ad-att-kpi-body">
                            <div className="ad-att-kpi-label">{label}</div>
                            <div className="ad-att-kpi-value" style={{ color: value > 0 ? color : undefined }}>
                                {loading ? '—' : value}
                            </div>
                            <div className="ad-att-kpi-sub">{loading ? '' : sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Roster ── */}
            <div className="ad-att-card">
                <div className="ad-att-card-head">
                    <div>
                        <h2>Daily Attendance Monitoring</h2>
                        <p>{selectedSection?.name} · time records and OJT progress</p>
                    </div>
                    <div className="ad-att-tools">
                        <input
                            type="text"
                            className="ad-att-input ad-att-search"
                            placeholder="Search student name or ID"
                            aria-label="Search students by name or ID"
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
                    <div style={{ padding: '0.75rem' }}>
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                        <TableRowSkeleton />
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
                                        <th>ID</th>
                                        <th>Time In</th>
                                        <th>Time Out</th>
                                        <th>Hours</th>
                                        <th>OJT Progress</th>
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
                                                <td><code className="ad-att-id">{row.student_profile_id.slice(0, 8)}</code></td>
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

            {/* ── Overview ── */}
            {!loading && !error && rows.length > 0 && (
                <div className="ad-att-card">
                    <div className="ad-att-strip">
                        <div className="ad-att-metric"><span>Attendance Rate</span><strong>{attendanceRate}%</strong></div>
                        <div className="ad-att-metric"><span>Absences</span><strong>{stats.absent}</strong></div>
                        <div className="ad-att-metric"><span>Late Arrivals</span><strong>{stats.late}</strong></div>
                        <div className="ad-att-metric"><span>Average Hours</span><strong>{formatHours(stats.avgHours)}</strong></div>
                        <div className="ad-att-metric"><span>Incomplete Logs</span><strong>{stats.incomplete}</strong></div>
                        <div className="ad-att-metric"><span>Not Yet Recorded</span><strong>{stats.notRecorded}</strong></div>

                        <div className="ad-att-dist">
                            <div className="ad-att-bar">
                                <span className="is-present" style={{ width: `${(stats.present / stats.total) * 100}%` }} />
                                <span className="is-late" style={{ width: `${(stats.late / stats.total) * 100}%` }} />
                                <span className="is-incomplete" style={{ width: `${(stats.incomplete / stats.total) * 100}%` }} />
                                <span className="is-absent" style={{ width: `${(stats.absent / stats.total) * 100}%` }} />
                            </div>
                            <div className="ad-att-legend">
                                <span><i className="is-present" /> Present</span>
                                <span><i className="is-late" /> Late</span>
                                <span><i className="is-incomplete" /> Incomplete</span>
                                <span><i className="is-absent" /> Absent</span>
                                <span><i className="is-not-recorded" /> Not recorded</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

import React, { useEffect, useMemo, useState } from 'react';
import { attendanceService, type AttendanceStatus, type AllAttendanceRow } from '../services/attendanceService';
import { adviserService, type Section } from '../services/adviserService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableRowSkeleton } from './Skeletons';
import AttendanceDetailModal from './AttendanceDetailModal';
import AttendanceRecordModal from './AttendanceRecordModal';
import { ATTENDANCE_STATUS_CONFIG, formatTime } from './attendanceConstants';
import './AttendanceView.css';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

type StatusFilter = 'all' | AttendanceStatus | 'not_recorded';

interface AdviserAttendanceRow extends AllAttendanceRow {
    section?: string | null;
}

const AdviserAttendanceView: React.FC = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const [date, setDate] = useState(todayStr);
    const [rows, setRows] = useState<AdviserAttendanceRow[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [sectionFilter, setSectionFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [companyFilter, setCompanyFilter] = useState('all');

    const [detailTarget, setDetailTarget] = useState<AdviserAttendanceRow | null>(null);
    const [detailModalKey, setDetailModalKey] = useState(0);

    const [recordTarget, setRecordTarget] = useState<{
        row: AdviserAttendanceRow;
        defaultStatus: AttendanceStatus;
        isEditing: boolean;
    } | null>(null);
    const [recordModalKey, setRecordModalKey] = useState(0);

    useEffect(() => {
        loadData(date);
    }, [date]);

    const loadData = async (selectedDate: string) => {
        setLoading(true);
        setError(null);
        try {
            const [mySections, myStudents, allAttendance] = await Promise.all([
                adviserService.getMySections(),
                adviserService.getMyStudents(),
                attendanceService.getAllAttendance(selectedDate)
            ]);

            setSections(mySections);

            // Create a lookup map for adviser students
            const studentMap = new Map<string, any>();
            myStudents.forEach(st => {
                if (st.auth_user_id) studentMap.set(st.auth_user_id, st);
                if (st.id) studentMap.set(st.id, st);
            });

            // Filter attendance rows to only include students in assigned sections
            const filteredToMySections: AdviserAttendanceRow[] = [];
            allAttendance.forEach(r => {
                const matchedStudent = studentMap.get(r.student_auth_id) || studentMap.get(r.student_profile_id);
                if (matchedStudent) {
                    filteredToMySections.push({
                        ...r,
                        section: matchedStudent.section || null,
                        program: matchedStudent.course || r.program || null
                    });
                }
            });

            setRows(filteredToMySections);
        } catch (err) {
            console.error('Failed to load attendance:', err);
            const message = err instanceof Error ? err.message : 'Failed to load attendance.';
            setError(message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        const present = rows.filter(r => r.status === 'present').length;
        const absent = rows.filter(r => r.status === 'absent').length;
        const late = rows.filter(r => r.status === 'late').length;
        return { total: rows.length, present, absent, late };
    }, [rows]);

    const companies = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => { if (r.company_name) set.add(r.company_name); });
        return Array.from(set).sort();
    }, [rows]);

    const filteredRows = useMemo(() => {
        return rows.filter(r => {
            if (sectionFilter !== 'all' && r.section !== sectionFilter) return false;
            if (statusFilter === 'not_recorded') {
                if (r.status !== null) return false;
            } else if (statusFilter !== 'all' && r.status !== statusFilter) {
                return false;
            }
            if (companyFilter !== 'all' && r.company_name !== companyFilter) return false;

            if (search.trim()) {
                const q = search.toLowerCase();
                const name = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
                const email = (r.email || '').toLowerCase();
                const comp = (r.company_name || '').toLowerCase();
                const sec = (r.section || '').toLowerCase();
                if (!name.includes(q) && !email.includes(q) && !comp.includes(q) && !sec.includes(q)) {
                    return false;
                }
            }
            return true;
        });
    }, [rows, sectionFilter, statusFilter, companyFilter, search]);

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems,
        totalItems,
        itemsPerPage
    } = usePagination(filteredRows, 10);

    const openDetail = (row: AdviserAttendanceRow) => {
        setDetailModalKey(k => k + 1);
        setDetailTarget(row);
    };

    const openRecord = (row: AdviserAttendanceRow) => {
        setRecordModalKey(k => k + 1);
        setRecordTarget({
            row,
            defaultStatus: row.status ?? 'absent',
            isEditing: Boolean(row.attendance_id)
        });
    };

    const handleRecordSubmit = async (status: AttendanceStatus, reason: string | null, remarks: string | null) => {
        if (!recordTarget) return;
        await attendanceService.recordAttendance(
            recordTarget.row.student_auth_id,
            date,
            status,
            reason,
            remarks
        );
        setRecordTarget(null);
        setDetailTarget(null);
        await loadData(date);
    };

    const renderStatusBadge = (status: AttendanceStatus | null) => {
        const key = (status ?? 'not_recorded') as AttendanceStatus | 'not_recorded';
        const cfg = ATTENDANCE_STATUS_CONFIG[key];
        return (
            <span className={`attendance-badge ${cfg.className}`}>
                <span>{cfg.emoji}</span> {cfg.label}
            </span>
        );
    };

    if (error) {
        return (
            <div className="view-container fade-in">
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                    <strong>Error:</strong> {error}
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            {/* Top Attendance Stats */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-label">Assigned Students</div>
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-sub">Across your sections</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Present Today</div>
                    <div className="stat-value" style={{ color: '#10b981' }}>{stats.present}</div>
                    <div className="stat-sub">Active clock-ins</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Late Clock-Ins</div>
                    <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.late}</div>
                    <div className="stat-sub">Past grace period</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Absences Recorded</div>
                    <div className="stat-value" style={{ color: stats.absent > 0 ? '#ef4444' : 'var(--text-primary)' }}>{stats.absent}</div>
                    <div className="stat-sub">Unexcused or missing</div>
                </div>
            </div>

            {/* Attendance Filter Card */}
            <div className="admin-table-card">
                <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                            Daily Attendance Monitoring
                        </div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>
                            View time records and attendance status for your assigned sections.
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Date Picker */}
                        <input
                            type="date"
                            value={date}
                            max={todayStr}
                            onChange={e => {
                                if (e.target.value) {
                                    setDate(e.target.value);
                                    setCurrentPage(1);
                                }
                            }}
                            style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem'
                            }}
                        />

                        {/* Section Filter */}
                        <select
                            value={sectionFilter}
                            onChange={e => { setSectionFilter(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="all">All Sections ({sections.length})</option>
                            {sections.map(s => (
                                <option key={s.id} value={s.name}>{s.name} ({s.course_code})</option>
                            ))}
                        </select>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1); }}
                            style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="all">All Statuses</option>
                            <option value="present">🟢 Present</option>
                            <option value="late">🟡 Late</option>
                            <option value="absent">🔴 Absent</option>
                            <option value="on_leave">🔵 On Leave</option>
                            <option value="incomplete">🟠 Incomplete</option>
                            <option value="not_recorded">⚪ Not Recorded</option>
                        </select>

                        {/* Company Filter */}
                        <select
                            value={companyFilter}
                            onChange={e => { setCompanyFilter(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="all">All Companies</option>
                            {companies.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>

                        {/* Search Input */}
                        <input
                            type="text"
                            placeholder="Search student or company…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '0.45rem 0.85rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                width: '200px'
                            }}
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div style={{ padding: '1rem' }}>
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No attendance records found for this date and filter.
                    </div>
                ) : (
                    <>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Section</th>
                                    <th>OJT Company</th>
                                    <th>Time In / Out</th>
                                    <th>Status</th>
                                    <th>Reason / Notes</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedItems.map(row => (
                                    <tr key={`${row.attendance_id ?? 'nr'}-${row.student_auth_id}`}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {row.first_name} {row.last_name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.email}</div>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 600 }}>{row.section || '—'}</span>
                                        </td>
                                        <td>
                                            {row.company_name ? (
                                                <span style={{ fontWeight: 500 }}>{row.company_name}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                    Not deployed
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                {row.time_in ? formatTime(row.time_in) : '—'}
                                                {' - '}
                                                {row.time_out ? formatTime(row.time_out) : '—'}
                                            </div>
                                        </td>
                                        <td>
                                            {renderStatusBadge(row.status)}
                                        </td>
                                        <td style={{ maxWidth: 200 }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.reason || row.remarks || '—'}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                                <button
                                                    className="role-select"
                                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                                                    onClick={() => openDetail(row)}
                                                >
                                                    View
                                                </button>
                                                <button
                                                    className="role-select"
                                                    style={{
                                                        fontSize: '0.75rem',
                                                        padding: '0.3rem 0.65rem',
                                                        background: !row.attendance_id ? 'rgba(239, 68, 68, 0.1)' : undefined,
                                                        color: !row.attendance_id ? '#ef4444' : undefined,
                                                        borderColor: !row.attendance_id ? 'rgba(239, 68, 68, 0.3)' : undefined
                                                    }}
                                                    onClick={() => openRecord(row)}
                                                >
                                                    {row.attendance_id ? 'Edit' : 'Record'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={totalItems}
                                itemsPerPage={itemsPerPage}
                                onPageChange={setCurrentPage}
                                itemName="records"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Attendance Detail Modal */}
            {detailTarget && (
                <AttendanceDetailModal
                    key={detailModalKey}
                    open={Boolean(detailTarget)}
                    row={detailTarget}
                    date={date}
                    companyName={detailTarget.company_name}
                    canRecord={true}
                    onClose={() => setDetailTarget(null)}
                    onRecord={() => {
                        setRecordTarget({
                            row: detailTarget,
                            defaultStatus: detailTarget.status ?? 'absent',
                            isEditing: Boolean(detailTarget.attendance_id)
                        });
                        setDetailTarget(null);
                    }}
                />
            )}

            {/* Attendance Record / Edit Modal */}
            {recordTarget && (
                <AttendanceRecordModal
                    key={recordModalKey}
                    open={Boolean(recordTarget)}
                    studentName={`${recordTarget.row.first_name} ${recordTarget.row.last_name}`}
                    studentEmail={recordTarget.row.email}
                    date={date}
                    existingStatus={recordTarget.row.status}
                    existingReason={recordTarget.row.reason}
                    existingRemarks={recordTarget.row.remarks}
                    defaultStatus={recordTarget.defaultStatus}
                    isEditing={recordTarget.isEditing}
                    onClose={() => setRecordTarget(null)}
                    onSubmit={handleRecordSubmit}
                />
            )}
        </div>
    );
};

export default AdviserAttendanceView;

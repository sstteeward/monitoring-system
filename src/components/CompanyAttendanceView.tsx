import React, { useEffect, useMemo, useState } from 'react';
import { attendanceService, type AttendanceStatus, type CompanyAttendanceRow } from '../services/attendanceService';
import { profileService } from '../services/profileService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableRowSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import AttendanceRecordModal from './AttendanceRecordModal';
import AttendanceDetailModal from './AttendanceDetailModal';
import { ATTENDANCE_STATUS_CONFIG, formatTime } from './attendanceConstants';
import './AttendanceView.css';

type StatusFilter = 'all' | AttendanceStatus | 'not_recorded';

const CompanyAttendanceView: React.FC = () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [date, setDate] = useState(todayStr);
  const [rows, setRows] = useState<CompanyAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [recordTarget, setRecordTarget] = useState<{
    row: CompanyAttendanceRow;
    defaultStatus: AttendanceStatus;
    isEditing: boolean;
  } | null>(null);
  const [recordModalKey, setRecordModalKey] = useState(0);
  const [detailTarget, setDetailTarget] = useState<CompanyAttendanceRow | null>(null);
  const [detailModalKey, setDetailModalKey] = useState(0);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  const load = async (selectedDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const profile = await profileService.getCurrentProfile();
      if (!profile || (profile.account_type !== 'company' && !profile.company_id)) {
        throw new Error('You are not associated with any company.');
      }
      const data = await attendanceService.getCompanyAttendance(selectedDate);
      setRows(data);
    } catch (err) {
      console.error('Failed to load attendance:', err);
      const message = err instanceof Error ? err.message : 'Failed to load attendance.';
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(date);
  }, [date]);

  const stats = useMemo(() => {
    const present = rows.filter(r => r.status === 'present').length;
    const absent = rows.filter(r => r.status === 'absent').length;
    const late = rows.filter(r => r.status === 'late').length;
    return { total: rows.length, present, absent, late };
  }, [rows]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      const name = `${r.first_name} ${r.last_name}`.toLowerCase();
      const matchesSearch = !term
        || name.includes(term)
        || (r.email ?? '').toLowerCase().includes(term)
        || (r.program ?? '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'not_recorded' ? !r.status : r.status === statusFilter);
      const matchesDept = departmentFilter === 'all' || r.department === departmentFilter;
      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [rows, search, statusFilter, departmentFilter]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginated,
    totalItems,
    itemsPerPage
  } = usePagination(filtered, 10);

  const openRecord = (row: CompanyAttendanceRow, defaultStatus: AttendanceStatus, isEditing: boolean) => {
    setRecordModalKey(k => k + 1);
    setRecordTarget({ row, defaultStatus, isEditing });
  };

  const openDetail = (row: CompanyAttendanceRow) => {
    setDetailModalKey(k => k + 1);
    setDetailTarget(row);
  };

  const handleSubmit = async (status: AttendanceStatus, reason: string | null, remarks: string | null) => {
    if (!recordTarget) return;
    await attendanceService.recordAttendance(recordTarget.row.student_auth_id, date, status, reason, remarks);
    setRecordTarget(null);
    setDetailTarget(null);
    await load(date);
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

  const renderStatusBadge = (status: AttendanceStatus | null) => {
    const key = (status ?? 'not_recorded') as AttendanceStatus | 'not_recorded';
    const cfg = ATTENDANCE_STATUS_CONFIG[key];
    return (
      <span className={`attendance-badge ${cfg.className}`}>
        <span>{cfg.emoji}</span> {cfg.label}
      </span>
    );
  };

  const renderActions = (row: CompanyAttendanceRow) => {
    if (!row.attendance_id) {
      return (
        <div className="attendance-actions">
          <button className="attendance-btn attendance-btn-danger attendance-btn-sm" onClick={() => openRecord(row, 'absent', false)} type="button">
            Mark Absent
          </button>
          <button className="attendance-btn attendance-btn-ghost attendance-btn-sm" onClick={() => openRecord(row, 'present', false)} type="button">
            Record
          </button>
          <button className="attendance-btn attendance-btn-ghost attendance-btn-sm" onClick={() => openDetail(row)} type="button">
            View
          </button>
        </div>
      );
    }
    return (
      <div className="attendance-actions">
        <button className="attendance-btn attendance-btn-sm" onClick={() => openDetail(row)} type="button">
          View
        </button>
        <button className="attendance-btn attendance-btn-sm" onClick={() => openRecord(row, row.status ?? 'absent', true)} type="button">
          Edit
        </button>
      </div>
    );
  };

  const emptyMessage = search || statusFilter !== 'all' || departmentFilter !== 'all'
    ? 'No records match your filters.'
    : 'No assigned interns yet.';

  return (
    <div className="view-container fade-in attendance-page-compact">
      <div className="view-header attendance-page-header">
        <div>
          <h2 className="view-title">Attendance Monitoring</h2>
          <p className="view-subtitle">
            Record and review your assigned interns' daily attendance
          </p>
        </div>
      </div>

      <div className="attendance-stats-grid">
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <div>
            <div className="attendance-stat-value">{stats.total}</div>
            <div className="attendance-stat-label">Total Students</div>
          </div>
        </div>
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          </div>
          <div>
            <div className="attendance-stat-value">{stats.present}</div>
            <div className="attendance-stat-label">Present</div>
          </div>
        </div>
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          </div>
          <div>
            <div className="attendance-stat-value">{stats.absent}</div>
            <div className="attendance-stat-label">Absent</div>
          </div>
        </div>
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div>
            <div className="attendance-stat-value">{stats.late}</div>
            <div className="attendance-stat-label">Late</div>
          </div>
        </div>
      </div>

      <div className="attendance-toolbar attendance-toolbar-compact">
        <input type="date" className="form-input attendance-filter-date" value={date} max={todayStr} onChange={e => { if (e.target.value) { setDate(e.target.value); setCurrentPage(1); } }} />
        <div className="attendance-search-wrap">
          <span className="attendance-search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </span>
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, email or program…"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <select className="form-input attendance-filter-status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1); }}>
          <option value="all">All Statuses</option>
          <option value="not_recorded">⚪ Not Recorded</option>
          <option value="present">🟢 Present</option>
          <option value="absent">🔴 Absent</option>
          <option value="late">🟡 Late</option>
          <option value="on_leave">🔵 On Leave</option>
          <option value="incomplete">🟠 Incomplete</option>
        </select>
        <select className="form-input attendance-filter-dept" value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="attendance-table-wrap" style={{ padding: '1rem 0' }}>
          <table>
            <thead>
              <tr>
                <th style={{ padding: '0.85rem 1.25rem' }}>Student</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Program</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Schedule</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Time In</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Time Out</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <TableRowSkeleton rows={6} cols={7} />
            </tbody>
          </table>
        </div>
      ) : paginated.length > 0 ? (
        <>
          <div className="attendance-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Program</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(row => (
                  <tr key={row.student_auth_id}>
                    <td>
                      <div className="attendance-student-cell">
                        <div
                          className="attendance-avatar"
                          style={{ background: `linear-gradient(135deg, #3b82f6, #6366f1)` }}
                        >
                          {(row.first_name?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <button
                            type="button"
                            className="attendance-name"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                            onClick={() => setViewProfileId(row.student_profile_id)}
                            title="View student profile"
                          >
                            {row.first_name} {row.last_name}
                          </button>
                          <div className="attendance-muted">{row.department || row.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="attendance-muted">{row.program || '—'}</td>
                    <td className="attendance-muted">
                      {row.schedule_start || row.schedule_end
                        ? `${formatTime(row.schedule_start)} – ${formatTime(row.schedule_end)}`
                        : '—'}
                    </td>
                    <td>{renderStatusBadge(row.status)}</td>
                    <td className="attendance-muted">{formatTime(row.time_in)}</td>
                    <td className="attendance-muted">{formatTime(row.time_out)}</td>
                    <td>{renderActions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="attendance-mobile-cards">
            {paginated.map(row => {
              const key = (row.status ?? 'not_recorded') as AttendanceStatus | 'not_recorded';
              const cfg = ATTENDANCE_STATUS_CONFIG[key];
              return (
                <div key={row.student_auth_id} className="attendance-mobile-card">
                  <div className="attendance-mobile-card-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                      <div
                        className="attendance-avatar"
                        style={{ background: `linear-gradient(135deg, #3b82f6, #6366f1)` }}
                      >
                        {(row.first_name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="attendance-name" style={{ overflowWrap: 'anywhere' }}>{row.first_name} {row.last_name}</div>
                        <div className="attendance-muted" style={{ overflowWrap: 'anywhere' }}>{row.program || row.email || '—'}</div>
                      </div>
                    </div>
                    <span className={`attendance-badge ${cfg.className}`}><span>{cfg.emoji}</span> {cfg.label}</span>
                  </div>
                  <div className="attendance-mobile-meta">
                    <div><span>Department</span><span>{row.department || '—'}</span></div>
                    <div><span>Schedule</span><span>{row.schedule_start ? `${formatTime(row.schedule_start)} – ${formatTime(row.schedule_end)}` : '—'}</span></div>
                    <div><span>Time In</span><span>{formatTime(row.time_in)}</span></div>
                    <div><span>Time Out</span><span>{formatTime(row.time_out)}</span></div>
                  </div>
                  <div className="attendance-mobile-actions">{renderActions(row)}</div>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            itemName="students"
          />
        </>
      ) : (
        <div className="attendance-table-wrap">
          <div className="attendance-empty">
            <p>{emptyMessage}</p>
            <span>Select a different date or adjust your filters.</span>
          </div>
        </div>
      )}

      <AttendanceRecordModal
        key={recordModalKey}
        open={!!recordTarget}
        studentName={recordTarget ? `${recordTarget.row.first_name} ${recordTarget.row.last_name}` : ''}
        studentEmail={recordTarget?.row.email}
        date={date}
        existingStatus={recordTarget?.isEditing ? recordTarget.row.status : null}
        existingReason={recordTarget?.isEditing ? recordTarget.row.reason : null}
        existingRemarks={recordTarget?.isEditing ? recordTarget.row.remarks : null}
        defaultStatus={recordTarget?.defaultStatus}
        isEditing={!!recordTarget?.isEditing}
        onClose={() => setRecordTarget(null)}
        onSubmit={handleSubmit}
      />

      <AttendanceDetailModal
        key={detailModalKey}
        open={!!detailTarget}
        row={detailTarget}
        date={date}
        canRecord
        onClose={() => setDetailTarget(null)}
        onRecord={() => {
          if (detailTarget) {
            openRecord(detailTarget, detailTarget.status ?? 'absent', !!detailTarget.attendance_id);
          }
        }}
      />

      <UserProfileModal
        profileId={viewProfileId}
        onClose={() => setViewProfileId(null)}
      />
    </div>
  );
};

export default CompanyAttendanceView;

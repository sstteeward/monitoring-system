import React, { useEffect, useMemo, useState } from 'react';
import { attendanceService, type AttendanceStatus, type AllAttendanceRow } from '../services/attendanceService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableRowSkeleton } from './Skeletons';
import AttendanceRecordModal from './AttendanceRecordModal';
import AttendanceDetailModal from './AttendanceDetailModal';
import { ATTENDANCE_STATUS_CONFIG, formatTime } from './attendanceConstants';
import './AttendanceView.css';

type StatusFilter = 'all' | AttendanceStatus | 'not_recorded';

const CoordinatorAttendanceView: React.FC = () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [date, setDate] = useState(todayStr);
  const [rows, setRows] = useState<AllAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [recordTarget, setRecordTarget] = useState<{
    row: AllAttendanceRow;
    defaultStatus: AttendanceStatus;
    isEditing: boolean;
  } | null>(null);
  const [recordModalKey, setRecordModalKey] = useState(0);
  const [detailTarget, setDetailTarget] = useState<AllAttendanceRow | null>(null);
  const [detailModalKey, setDetailModalKey] = useState(0);

  const load = async (selectedDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await attendanceService.getAllAttendance(selectedDate);
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

  const companies = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.company_name) set.add(r.company_name); });
    return Array.from(set).sort();
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
        || (r.company_name ?? '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'not_recorded' ? !r.status : r.status === statusFilter);
      const matchesCompany = companyFilter === 'all' || r.company_name === companyFilter;
      const matchesDept = departmentFilter === 'all' || r.department === departmentFilter;
      return matchesSearch && matchesStatus && matchesCompany && matchesDept;
    });
  }, [rows, search, statusFilter, companyFilter, departmentFilter]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginated,
    totalItems,
    itemsPerPage
  } = usePagination(filtered, 10);

  const openDetail = (row: AllAttendanceRow) => {
    setDetailModalKey(k => k + 1);
    setDetailTarget(row);
  };

  const openRecord = (row: AllAttendanceRow) => {
    setRecordModalKey(k => k + 1);
    setRecordTarget({
      row,
      defaultStatus: row.status ?? 'absent',
      isEditing: !!row.attendance_id
    });
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

  return (
    <div className="view-container fade-in">
      <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Attendance Monitoring</h2>
          <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Monitor attendance records across all companies
          </p>
        </div>
      </div>

      <div className="attendance-stats-grid">
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>👥</div>
          <div>
            <div className="attendance-stat-value">{stats.total}</div>
            <div className="attendance-stat-label">Records</div>
          </div>
        </div>
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>🟢</div>
          <div>
            <div className="attendance-stat-value">{stats.present}</div>
            <div className="attendance-stat-label">Present</div>
          </div>
        </div>
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>🔴</div>
          <div>
            <div className="attendance-stat-value">{stats.absent}</div>
            <div className="attendance-stat-label">Absent</div>
          </div>
        </div>
        <div className="attendance-stat-card">
          <div className="attendance-stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>🟡</div>
          <div>
            <div className="attendance-stat-value">{stats.late}</div>
            <div className="attendance-stat-label">Late</div>
          </div>
        </div>
      </div>

      <div className="attendance-toolbar">
        <input type="date" className="form-input" value={date} max={todayStr} onChange={e => { if (e.target.value) { setDate(e.target.value); setCurrentPage(1); } }} />
        <div className="attendance-search-wrap">
          <span className="attendance-search-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </span>
          <input
            type="text"
            className="form-input"
            placeholder="Search by student, email or company…"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <select className="form-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1); }}>
          <option value="all">All Statuses</option>
          <option value="not_recorded">⚪ Not Recorded</option>
          <option value="present">🟢 Present</option>
          <option value="absent">🔴 Absent</option>
          <option value="late">🟡 Late</option>
          <option value="on_leave">🔵 On Leave</option>
          <option value="incomplete">🟠 Incomplete</option>
        </select>
        <select className="form-input" value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setCurrentPage(1); }}>
          <option value="all">All Companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-input" value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}>
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
                <th style={{ padding: '0.85rem 1.25rem' }}>Company</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Program</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Reason</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Recorded By</th>
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
                  <th>Company</th>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Recorded By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(row => (
                  <tr key={`${row.attendance_id ?? 'nr'}-${row.student_auth_id}`}>
                    <td>
                      <div className="attendance-student-cell">
                        <div
                          className="attendance-avatar"
                          style={{ background: `linear-gradient(135deg, #10b981, #0d9488)` }}
                        >
                          {(row.first_name?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="attendance-name">{row.first_name} {row.last_name}</div>
                          <div className="attendance-muted">{row.department || row.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="attendance-muted">{row.company_name || '—'}</td>
                    <td className="attendance-muted">{row.program || '—'}</td>
                    <td>{renderStatusBadge(row.status)}</td>
                    <td className="attendance-muted" style={{ maxWidth: 220 }}>
                      <span style={{ overflowWrap: 'anywhere' }}>{row.reason || '—'}</span>
                    </td>
                    <td className="attendance-muted">{row.recorded_by_name || '—'}</td>
                    <td>
                      <div className="attendance-actions">
                        <button className="attendance-btn attendance-btn-sm" onClick={() => openDetail(row)} type="button">
                          View
                        </button>
                        <button
                          className={`attendance-btn attendance-btn-sm ${!row.attendance_id ? 'attendance-btn-danger' : ''}`}
                          onClick={() => openRecord(row)}
                          type="button"
                        >
                          {row.attendance_id ? 'Edit' : 'Record'}
                        </button>
                      </div>
                    </td>
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
                <div key={`${row.attendance_id ?? 'nr'}-${row.student_auth_id}`} className="attendance-mobile-card">
                  <div className="attendance-mobile-card-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                      <div
                        className="attendance-avatar"
                        style={{ background: `linear-gradient(135deg, #10b981, #0d9488)` }}
                      >
                        {(row.first_name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="attendance-name" style={{ overflowWrap: 'anywhere' }}>{row.first_name} {row.last_name}</div>
                        <div className="attendance-muted" style={{ overflowWrap: 'anywhere' }}>{row.company_name || row.email || '—'}</div>
                      </div>
                    </div>
                    <span className={`attendance-badge ${cfg.className}`}><span>{cfg.emoji}</span> {cfg.label}</span>
                  </div>
                  <div className="attendance-mobile-meta">
                    <div><span>Program</span><span>{row.program || '—'}</span></div>
                    <div><span>Department</span><span>{row.department || '—'}</span></div>
                    <div><span>Schedule</span><span>{row.schedule_start ? `${formatTime(row.schedule_start)} – ${formatTime(row.schedule_end)}` : '—'}</span></div>
                    <div><span>Recorded By</span><span>{row.recorded_by_name || '—'}</span></div>
                  </div>
                  {row.reason && (
                    <div className="attendance-muted" style={{ marginBottom: '0.6rem', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                      <strong>Reason:</strong> {row.reason}
                    </div>
                  )}
                  <div className="attendance-mobile-actions">
                    <button className="attendance-btn attendance-btn-sm" onClick={() => openDetail(row)} type="button">View</button>
                    <button
                      className={`attendance-btn attendance-btn-sm ${!row.attendance_id ? 'attendance-btn-danger' : ''}`}
                      onClick={() => openRecord(row)}
                      type="button"
                    >
                      {row.attendance_id ? 'Edit' : 'Record'}
                    </button>
                  </div>
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
            itemName="records"
          />
        </>
      ) : (
        <div className="attendance-table-wrap">
          <div className="attendance-empty">
            <p>{search || statusFilter !== 'all' || companyFilter !== 'all' || departmentFilter !== 'all'
              ? 'No records match your filters.'
              : 'No attendance records found for this date.'}</p>
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
        companyName={detailTarget?.company_name}
        canRecord
        onClose={() => setDetailTarget(null)}
        onRecord={() => {
          if (detailTarget) openRecord(detailTarget);
        }}
      />
    </div>
  );
};

export default CoordinatorAttendanceView;

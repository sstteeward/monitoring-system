import React, { useEffect, useState, useMemo } from 'react';
import { adviserService, type Section, type StudentMonitoringRecord } from '../services/adviserService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

interface AdviserStudentsViewProps {
    initialSection?: string;
    initialFilter?: 'all' | 'assigned' | 'not-deployed' | 'at-risk' | 'pending';
}

const AdviserStudentsView: React.FC<AdviserStudentsViewProps> = ({
    initialSection = 'all',
    initialFilter = 'all'
}) => {
    const [sections, setSections] = useState<Section[]>([]);
    const [selectedSection, setSelectedSection] = useState(initialSection);
    const [filterTab, setFilterTab] = useState<'all' | 'assigned' | 'not-deployed' | 'at-risk' | 'pending'>(initialFilter);
    const [searchTerm, setSearchTerm] = useState('');
    const [students, setStudents] = useState<StudentMonitoringRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);

    // Selected student detail modal
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentMonitoringRecord | null>(null);

    useEffect(() => {
        loadData();
    }, [selectedSection]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [secData, monData] = await Promise.all([
                adviserService.getMySections(),
                adviserService.getDetailedStudentMonitoring(selectedSection === 'all' ? undefined : selectedSection)
            ]);
            setSections(secData);
            setStudents(monData);
        } catch (err: any) {
            console.error('Failed to load student monitoring records:', err);
            setError(err.message || 'Failed to load students');
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
            const email = (s.email || '').toLowerCase();
            const company = (s.company?.name || '').toLowerCase();
            const section = (s.section || '').toLowerCase();
            const term = searchTerm.toLowerCase();

            const matchesSearch = name.includes(term) || email.includes(term) || company.includes(term) || section.includes(term);
            if (!matchesSearch) return false;

            switch (filterTab) {
                case 'assigned':
                    return !!s.company_id && s.is_active !== false;
                case 'not-deployed':
                    return !s.company_id && s.is_active !== false;
                case 'at-risk':
                    return s.is_at_risk;
                case 'pending':
                    return s.is_active === false || s.approval_status === 'pending';
                default:
                    return true;
            }
        });
    }, [students, filterTab, searchTerm]);

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems: paginatedStudents,
        totalItems,
        itemsPerPage
    } = usePagination(filteredStudents, 10);

    return (
        <div className="fade-in">
            {/* Top Filter Header */}
            <div className="admin-table-card">
                <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                            Student Monitoring
                        </div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>
                            Track OJT progress, attendance, and requirements for your assigned sections.
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Section Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Section:</span>
                            <select
                                value={selectedSection}
                                onChange={e => { setSelectedSection(e.target.value); setCurrentPage(1); }}
                                style={{
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-page)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.85rem',
                                    fontWeight: 500
                                }}
                            >
                                <option value="all">All My Sections ({students.length})</option>
                                {sections.map(sec => (
                                    <option key={sec.id} value={sec.name}>
                                        {sec.name} ({sec.course_code}) — {sec.student_count} Students
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Search Bar */}
                        <input
                            type="text"
                            placeholder="Search by student or company…"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '0.45rem 0.85rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                width: '220px'
                            }}
                        />
                    </div>
                </div>

                {/* Sub-Filter Tabs */}
                <div style={{
                    padding: '0.75rem 1.5rem',
                    borderBottom: '1px solid var(--admin-border)',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    background: 'var(--bg-elevated)'
                }}>
                    {[
                        { id: 'all', label: 'All Students' },
                        { id: 'assigned', label: 'On SIL / OJT' },
                        { id: 'not-deployed', label: 'Not Deployed' },
                        { id: 'at-risk', label: 'At Risk / Behind' },
                        { id: 'pending', label: 'Pending Approval' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`filter-tab ${filterTab === tab.id ? 'active' : ''}`}
                            onClick={() => { setFilterTab(tab.id as any); setCurrentPage(1); }}
                            style={{
                                padding: '0.35rem 0.85rem',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: filterTab === tab.id ? 'var(--primary)' : 'transparent',
                                color: filterTab === tab.id ? '#fff' : 'var(--text-primary)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                fontWeight: 500
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Main Table */}
                {loading ? (
                    <TableSkeleton rows={6} cols={6} />
                ) : filteredStudents.length === 0 ? (
                    <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No students found matching the selected filters.
                    </div>
                ) : (
                    <>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Section</th>
                                    <th>OJT Company</th>
                                    <th>Hours Rendered</th>
                                    <th>Attendance</th>
                                    <th>Journals</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedStudents.map(st => (
                                    <tr key={st.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                <UserClickableName
                                                    userId={st.auth_user_id}
                                                    userName={`${st.first_name || ''} ${st.last_name || ''}`.trim() || 'Student'}
                                                />
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.email}</div>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 600 }}>{st.section || '—'}</span>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{st.course || '—'}</div>
                                        </td>
                                        <td>
                                            {st.company?.name ? (
                                                <span style={{ fontWeight: 500 }}>{st.company.name}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                    Not deployed
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div>
                                                    <span style={{ fontWeight: 700 }}>{st.rendered_hours}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> / {st.required_ojt_hours || 500}h</span>
                                                </div>
                                            </div>
                                            <div style={{
                                                width: '100px',
                                                height: '5px',
                                                background: 'var(--bg-elevated)',
                                                borderRadius: 3,
                                                overflow: 'hidden',
                                                marginTop: '0.25rem'
                                            }}>
                                                <div style={{
                                                    width: `${st.progress_percentage}%`,
                                                    height: '100%',
                                                    background: st.progress_percentage >= 100 ? '#10b981' : st.progress_percentage < 25 ? '#f59e0b' : 'var(--primary)'
                                                }} />
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{st.attendance_rate}%</div>
                                            <div style={{ fontSize: '0.75rem', color: st.absences && st.absences >= 3 ? '#ef4444' : 'var(--text-muted)' }}>
                                                {st.absences || 0} absence{st.absences !== 1 ? 's' : ''}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color: st.pending_journals_count > 0 ? '#f59e0b' : '#10b981'
                                            }}>
                                                {st.pending_journals_count > 0 ? `${st.pending_journals_count} to review` : st.journal_status}
                                            </span>
                                        </td>
                                        <td>
                                            {st.is_at_risk ? (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.2rem 0.45rem',
                                                    borderRadius: 8,
                                                    fontWeight: 600,
                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                    color: '#ef4444'
                                                }}>
                                                    AT RISK
                                                </span>
                                            ) : st.is_active === false ? (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.2rem 0.45rem',
                                                    borderRadius: 8,
                                                    fontWeight: 600,
                                                    background: 'rgba(245, 158, 11, 0.12)',
                                                    color: '#f59e0b'
                                                }}>
                                                    PENDING
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.2rem 0.45rem',
                                                    borderRadius: 8,
                                                    fontWeight: 600,
                                                    background: 'rgba(16, 185, 129, 0.12)',
                                                    color: '#10b981'
                                                }}>
                                                    ON TRACK
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="role-select"
                                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                                                onClick={() => setSelectedStudentDetail(st)}
                                            >
                                                Details
                                            </button>
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
                                itemName="students"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Student Comprehensive Monitoring Modal */}
            {selectedStudentDetail && (
                <div className="modal-overlay" onClick={() => setSelectedStudentDetail(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                                    {selectedStudentDetail.first_name} {selectedStudentDetail.last_name}
                                </h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    Section {selectedStudentDetail.section} · {selectedStudentDetail.course}
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={() => setSelectedStudentDetail(null)}>✕</button>
                        </div>

                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            {/* Key Stats Cards */}
                            <div className="monitoring-detail-grid">
                                <div className="monitoring-stat-box">
                                    <div className="monitoring-stat-val" style={{ color: 'var(--primary)' }}>
                                        {selectedStudentDetail.rendered_hours}h
                                    </div>
                                    <div className="monitoring-stat-lbl">Rendered Hours</div>
                                </div>
                                <div className="monitoring-stat-box">
                                    <div className="monitoring-stat-val">
                                        {selectedStudentDetail.required_ojt_hours || 500}h
                                    </div>
                                    <div className="monitoring-stat-lbl">Required Hours</div>
                                </div>
                                <div className="monitoring-stat-box">
                                    <div className="monitoring-stat-val" style={{ color: selectedStudentDetail.progress_percentage >= 100 ? '#10b981' : 'var(--text-primary)' }}>
                                        {selectedStudentDetail.progress_percentage}%
                                    </div>
                                    <div className="monitoring-stat-lbl">OJT Progress</div>
                                </div>
                                <div className="monitoring-stat-box">
                                    <div className="monitoring-stat-val" style={{ color: selectedStudentDetail.absences && selectedStudentDetail.absences >= 3 ? '#ef4444' : '#10b981' }}>
                                        {selectedStudentDetail.attendance_rate}%
                                    </div>
                                    <div className="monitoring-stat-lbl">Attendance Rate</div>
                                </div>
                            </div>

                            {/* Placement Info */}
                            <div style={{
                                padding: '1rem',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: 10,
                                marginBottom: '1.25rem'
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Company Placement</div>
                                {selectedStudentDetail.company?.name ? (
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedStudentDetail.company.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                            Department / Position: {selectedStudentDetail.department || 'OJT Intern'}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                        Student has not selected or been deployed to an internship company yet.
                                    </div>
                                )}
                            </div>

                            {/* Contact Details */}
                            <div style={{
                                padding: '1rem',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: 10,
                                marginBottom: '1.25rem'
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Contact & Address</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                                    <div>
                                        <span style={{ color: 'var(--text-muted)' }}>Email: </span>
                                        <strong>{selectedStudentDetail.email}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-muted)' }}>Phone: </span>
                                        <strong>{selectedStudentDetail.contact_number || '—'}</strong>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Address: </span>
                                        <span>{selectedStudentDetail.address || selectedStudentDetail.city_municipality || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
                            <button
                                className="cd-btn cd-btn-outline"
                                onClick={() => {
                                    const uid = selectedStudentDetail.auth_user_id;
                                    setSelectedStudentDetail(null);
                                    setViewProfileId(uid);
                                }}
                            >
                                Full Student Profile
                            </button>
                            <button
                                className="cd-btn cd-btn-primary"
                                onClick={() => setSelectedStudentDetail(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {viewProfileId && (
                <UserProfileModal
                    profileId={viewProfileId}
                    onClose={() => setViewProfileId(null)}
                />
            )}
        </div>
    );
};

export default AdviserStudentsView;

import React, { useEffect, useState } from 'react';
import { companyService } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import { TableRowSkeleton } from './Skeletons';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import LocationMapModal from './LocationMapModal';

export interface Timesheet {
    id: string;
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    status: 'working' | 'break' | 'completed';
    break_start: string | null;
    break_end: string | null;
    latitude: number | null;
    longitude: number | null;
    device_info: string | null;
    location_verified: boolean;
}

const CompanyAttendanceView: React.FC = () => {
    const [attendance, setAttendance] = useState<Timesheet[]>([]);
    const [students, setStudents] = useState<Record<string, Profile>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [locationModal, setLocationModal] = useState<{ isOpen: boolean, lat: number, lng: number }>({ isOpen: false, lat: 0, lng: 0 });
    const [dateFilter, setDateFilter] = useState('');

    useEffect(() => { loadAttendance(); }, [dateFilter]);

    const loadAttendance = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            
            const assignedStudents = await companyService.getAssignedStudents(profile.company_id);
            const studentMap: Record<string, Profile> = {};
            assignedStudents.forEach(s => studentMap[s.id] = s);
            setStudents(studentMap);
            
            const studentIds = assignedStudents.map(s => s.id);
            if (studentIds.length === 0) {
                setAttendance([]);
                return;
            }

            let startDate, endDate;
            if (dateFilter) {
                const date = new Date(dateFilter);
                startDate = new Date(date.setHours(0, 0, 0, 0)).toISOString();
                endDate = new Date(date.setHours(23, 59, 59, 999)).toISOString();
            }

            const data = await companyService.getStudentAttendance(studentIds, startDate, endDate);
            setAttendance(data as Timesheet[]);
        } catch (err: any) {
            console.error('Failed to load attendance:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const filteredAttendance = attendance.filter(record => {
        const student = students[record.user_id];
        if (!student) return false;
        
        const matchesSearch = `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email?.toLowerCase().includes(searchTerm.toLowerCase());
            
        return matchesSearch;
    });

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems: paginatedAttendance,
        totalItems,
        itemsPerPage
    } = usePagination(filteredAttendance, 10);

    const avatarColor = (name: string) => {
        const colors = ['#10b981', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return '—';
        return new Date(timeStr).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getSessionDuration = (ts: Timesheet) => {
        if (!ts.clock_out) return 0;
        let diff = Math.floor((new Date(ts.clock_out).getTime() - new Date(ts.clock_in).getTime()) / 1000);
        
        if (ts.break_start && ts.break_end) {
            const breakTime = Math.floor((new Date(ts.break_end).getTime() - new Date(ts.break_start).getTime()) / 1000);
            diff = Math.max(0, diff - breakTime);
        }
        return diff;
    };

    const formatDuration = (seconds: number) => {
        if (seconds === 0) return '—';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h === 0) return `${m}m`;
        return `${h}h ${m}m`;
    };

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Attendance Monitoring</h2>
                    <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                        Track DTR records for your assigned interns
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="date"
                            className="form-input"
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', color: 'var(--text-primary)' }}
                        />
                    </div>
                    <div style={{ position: 'relative', width: 'min(320px, 100%)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <circle cx="11" cy="11" r="8" stroke="var(--text-muted)" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="var(--text-muted)" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search interns…"
                            className="form-input"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '2.25rem', width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem 0.5rem 2.25rem', color: 'var(--text-primary)' }}
                        />
                    </div>
                </div>
            </div>

            <div className="table-container glass-card" style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Student</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Date</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Clock In</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Clock Out</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Duration</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Status</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Location</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <TableRowSkeleton rows={5} cols={7} />
                        ) : paginatedAttendance.length > 0 ? (
                            paginatedAttendance.map(record => {
                                const student = students[record.user_id];
                                if (!student) return null;
                                const color = avatarColor(student.first_name ?? 'A');
                                
                                return (
                                    <tr
                                        key={record.id}
                                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                                        className="hoverable-row"
                                    >
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setViewProfileId(student.id)}>
                                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                    {student.first_name?.[0]?.toUpperCase() ?? '?'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.88rem' }}>
                                                        <UserClickableName userId={student.id} userName={`${student.first_name} ${student.last_name}`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{formatDate(record.clock_in)}</td>
                                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem' }}>{formatTime(record.clock_in)}</td>
                                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem' }}>{formatTime(record.clock_out)}</td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                {formatDuration(getSessionDuration(record))}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ 
                                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem',
                                                color: record.status === 'working' ? '#3b82f6' : record.status === 'break' ? '#f59e0b' : '#10b981',
                                                background: record.status === 'working' ? 'rgba(59,130,246,0.1)' : record.status === 'break' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
                                            }}>
                                                {record.status === 'working' ? 'Active' : record.status === 'break' ? 'On Break' : 'Completed'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            {record.latitude && record.longitude ? (
                                                <button
                                                    onClick={() => setLocationModal({ isOpen: true, lat: record.latitude!, lng: record.longitude! })}
                                                    style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                                    View
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No location</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                            {searchTerm ? `No records matching "${searchTerm}"` : 'No attendance records found'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    itemName="records"
                />
            )}

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />

            {locationModal.isOpen && (
                <LocationMapModal
                    isOpen={locationModal.isOpen}
                    latitude={locationModal.lat}
                    longitude={locationModal.lng}
                    onClose={() => setLocationModal({ isOpen: false, lat: 0, lng: 0 })}
                />
            )}
        </div>
    );
};

export default CompanyAttendanceView;

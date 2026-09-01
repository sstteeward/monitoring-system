import React, { useEffect, useState } from 'react';
import { adviserService, type Section } from '../services/adviserService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

interface AdviserSectionsViewProps {
    onSelectSection?: (sectionName: string) => void;
}

const AdviserSectionsView: React.FC<AdviserSectionsViewProps> = ({ onSelectSection }) => {
    const [sections, setSections] = useState<Section[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSection, setSelectedSection] = useState<Section | null>(null);
    const [sectionStudents, setSectionStudents] = useState<Profile[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    useEffect(() => {
        loadSections();
    }, []);

    const loadSections = async () => {
        setLoading(true);
        try {
            const data = await adviserService.getMySections();
            setSections(data);
            if (data.length > 0) {
                loadSectionStudents(data[0]);
            }
        } catch (err) {
            console.error('Failed to load sections:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadSectionStudents = async (sec: Section) => {
        setSelectedSection(sec);
        setLoadingStudents(true);
        try {
            const students = await adviserService.getMyStudents({ section: sec.name });
            setSectionStudents(students);
        } catch (err) {
            console.error('Failed to load section students:', err);
        } finally {
            setLoadingStudents(false);
        }
    };

    const filteredStudents = sectionStudents.filter(s => {
        const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
        const email = (s.email || '').toLowerCase();
        return name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
    });

    if (loading) {
        return (
            <div className="admin-table-card">
                <div className="admin-table-header">
                    <div className="admin-table-title">My Assigned Sections</div>
                </div>
                <TableSkeleton rows={4} cols={3} />
            </div>
        );
    }

    if (sections.length === 0) {
        return (
            <div className="admin-table-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>No Sections Assigned</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    You currently have no sections assigned. The SIL/OJT Coordinator will assign sections to your account.
                </p>
            </div>
        );
    }

    return (
        <div className="fade-in">
            {/* Top Cards for Sections */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
            }}>
                {sections.map(sec => {
                    const isSelected = selectedSection?.id === sec.id;
                    const isDHT = sec.course_code === 'DHT';
                    return (
                        <div
                            key={sec.id}
                            className="section-card"
                            onClick={() => loadSectionStudents(sec)}
                            style={{
                                cursor: 'pointer',
                                borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                                background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                                transform: isSelected ? 'scale(1.02)' : 'none'
                            }}
                        >
                            <div className="section-card-header">
                                <div>
                                    <div className="section-card-title">{sec.name}</div>
                                    <div className="section-card-meta">
                                        {isDHT ? 'Hospitality Tech' : 'Information Tech'}
                                    </div>
                                </div>
                                <span className={`adviser-course-pill ${isDHT ? 'adviser-course-dht' : 'adviser-course-dit'}`}>
                                    {sec.course_code}
                                </span>
                            </div>

                            <div style={{ marginTop: '0.5rem' }}>
                                <div className="section-card-count">{sec.student_count || 0}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Students Enrolled</div>
                            </div>

                            <div className="section-card-footer">
                                <span style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: isSelected ? 'var(--primary)' : 'var(--text-muted)'
                                }}>
                                    {isSelected ? '● Currently Selected' : 'Click to View Roster'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Selected Section Student Roster Table */}
            {selectedSection && (
                <div className="admin-table-card">
                    <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                                Section {selectedSection.name} Roster
                            </div>
                            <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>
                                {selectedSection.course_code === 'DHT' ? 'Diploma in Hospitality Technology' : 'Diploma in Information Technology'} · {sectionStudents.length} Students
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Search students in section…"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
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
                            {onSelectSection && (
                                <button
                                    className="cd-btn cd-btn-primary"
                                    onClick={() => onSelectSection(selectedSection.name)}
                                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                                >
                                    Full Monitoring View →
                                </button>
                            )}
                        </div>
                    </div>

                    {loadingStudents ? (
                        <TableSkeleton rows={5} cols={4} />
                    ) : filteredStudents.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No students found in this section.
                        </div>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Student Name</th>
                                    <th>Contact & Address</th>
                                    <th>OJT Company</th>
                                    <th>Account Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map(st => (
                                    <tr key={st.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {st.first_name} {st.last_name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.email}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>{st.contact_number || '—'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.city_municipality || st.address || '—'}</div>
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
                                            <span style={{
                                                fontSize: '0.7rem',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: 8,
                                                fontWeight: 600,
                                                background: st.is_active !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                                color: st.is_active !== false ? '#10b981' : '#f59e0b'
                                            }}>
                                                {st.is_active !== false ? 'ACTIVE' : 'PENDING APPROVAL'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="role-select"
                                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                                                onClick={() => setViewProfileId(st.auth_user_id)}
                                            >
                                                View Profile
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {viewProfileId && (
                <UserProfileModal
                    profileId={viewProfileId}
                    onClose={() => setViewProfileId(null)}
                />
            )}
        </div>
    );
};

export default AdviserSectionsView;

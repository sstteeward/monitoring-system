import React, { useEffect, useRef, useState } from 'react';
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
    const [sectionsError, setSectionsError] = useState<string | null>(null);
    const [selectedSection, setSelectedSection] = useState<Section | null>(null);
    const [sectionStudents, setSectionStudents] = useState<Profile[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [studentsError, setStudentsError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    /** The section whose roster is currently being awaited. */
    const pendingSectionId = useRef<string | null>(null);

    useEffect(() => {
        loadSections();
    }, []);

    const loadSections = async () => {
        setLoading(true);
        setSectionsError(null);
        try {
            const data = await adviserService.getMySections();
            setSections(data);
            // Select the first assigned section so a roster is on screen immediately.
            if (data.length > 0) {
                loadSectionStudents(data[0]);
            } else {
                setSelectedSection(null);
                setSectionStudents([]);
            }
        } catch (err) {
            console.error('Failed to load sections:', err);
            setSectionsError(err instanceof Error ? err.message : 'Failed to load your assigned sections.');
        } finally {
            setLoading(false);
        }
    };

    const loadSectionStudents = async (sec: Section) => {
        // Switching sections quickly must never let a slow earlier response land
        // on top of a newer one — that would show another section's students.
        pendingSectionId.current = sec.id;

        setSelectedSection(sec);
        setSearchTerm('');
        setStudentsError(null);
        setSectionStudents([]);
        setLoadingStudents(true);
        try {
            const students = await adviserService.getSectionStudents(sec.id, sec.name);
            if (pendingSectionId.current !== sec.id) return;
            setSectionStudents(students);
        } catch (err) {
            if (pendingSectionId.current !== sec.id) return;
            console.error('Failed to load section students:', err);
            setStudentsError(err instanceof Error ? err.message : 'Failed to load the roster for this section.');
        } finally {
            if (pendingSectionId.current === sec.id) setLoadingStudents(false);
        }
    };

    // Search stays inside the selected section — it only ever filters the roster
    // that is already loaded for `selectedSection`.
    const term = searchTerm.trim().toLowerCase();
    const filteredStudents = term
        ? sectionStudents.filter(s =>
            `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase().includes(term) ||
            (s.email || '').toLowerCase().includes(term) ||
            (s.id || '').toLowerCase().includes(term)
        )
        : sectionStudents;

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

    // A failed query must never be shown as "no sections" — that would read as
    // the coordinator having assigned nothing.
    if (sectionsError) {
        return (
            <div className="admin-table-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Could not load your sections</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 1.25rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    {sectionsError}
                </p>
                <button className="cd-btn cd-btn-primary" onClick={loadSections}>Try Again</button>
            </div>
        );
    }

    if (sections.length === 0) {
        return (
            <div className="admin-table-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>No Sections Assigned</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    You currently don't have any sections assigned to you. Please contact the SIL/OJT Coordinator.
                </p>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div style={{ marginBottom: '1rem' }}>
                <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                    My Assigned Sections
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {sections.length} section{sections.length !== 1 ? 's' : ''} assigned to you. Select one to view its student roster.
                </div>
            </div>

            {/* Section cards. auto-fit keeps this responsive on its own: several
                cards per row on desktop, fewer on tablet, one on mobile. */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
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
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            onClick={() => loadSectionStudents(sec)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    loadSectionStudents(sec);
                                }
                            }}
                            style={{
                                cursor: 'pointer',
                                borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                                boxShadow: isSelected ? '0 0 0 2px var(--primary)' : undefined,
                                background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)'
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
                                <div className="section-card-count">{sec.student_count ?? 0}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Students Enrolled</div>
                            </div>

                            <div className="section-card-footer">
                                <span style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: isSelected ? 'var(--primary)' : 'var(--text-muted)'
                                }}>
                                    {isSelected ? '✓ Currently Selected' : 'View Section →'}
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
                                {selectedSection.course_code === 'DHT' ? 'Diploma in Hospitality Technology' : 'Diploma in Information Technology'}
                                {' · '}
                                {loadingStudents ? 'Loading…' : studentsError ? 'Unavailable' : `${sectionStudents.length} Students`}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder={`Search students in ${selectedSection.name}…`}
                                aria-label={`Search students in section ${selectedSection.name} by name, ID or email`}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    padding: '0.45rem 0.85rem',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-page)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.85rem',
                                    width: 'min(220px, 100%)'
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
                    ) : studentsError ? (
                        <div style={{ padding: '3rem', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--text-primary)' }}>Roster Unavailable</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
                                {studentsError}
                            </p>
                            <button className="cd-btn cd-btn-primary" onClick={() => loadSectionStudents(selectedSection)}>
                                Try Again
                            </button>
                        </div>
                    ) : sectionStudents.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--text-primary)' }}>No Students Found</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                                There are currently no students enrolled in {selectedSection.name}.
                            </p>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No students in {selectedSection.name} match “{searchTerm.trim()}”.
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

import React, { useEffect, useState, useMemo } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import './CoordinatorDashboard.css';

interface AdviserWithSections extends Profile {
    assigned_sections: { id: string; name: string; course_code: string }[];
    sections_count: number;
    students_count: number;
    adviser_type: string;
}

interface SectionItem {
    id: string;
    name: string;
    course_code: 'DHT' | 'DIT';
    student_count: number;
    adviser_id?: string | null;
    adviser_name?: string | null;
    adviser_type?: string | null;
    adviser_email?: string | null;
}

const CoordinatorAdvisersView: React.FC = () => {
    const [advisers, setAdvisers] = useState<AdviserWithSections[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'advisers' | 'sections'>('advisers');
    const [searchTerm, setSearchTerm] = useState('');
    const [courseFilter, setCourseFilter] = useState<'all' | 'DHT' | 'DIT'>('all');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal States
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [viewAdviserDetail, setViewAdviserDetail] = useState<AdviserWithSections | null>(null);
    const [adviserStudents, setAdviserStudents] = useState<Profile[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // Form States
    const [submitting, setSubmitting] = useState(false);
    const [createFirstName, setCreateFirstName] = useState('');
    const [createLastName, setCreateLastName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createCourse, setCreateCourse] = useState<'DHT' | 'DIT'>('DHT');

    // Assign / Reassign Form State
    const [assignSectionId, setAssignSectionId] = useState('');
    const [assignAdviserId, setAssignAdviserId] = useState('');

    // Create Section Form State
    const [newSectionName, setNewSectionName] = useState('');
    const [newSectionCourse, setNewSectionCourse] = useState<'DHT' | 'DIT'>('DHT');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [advData, secData] = await Promise.all([
                coordinatorService.getAllAdvisers(),
                coordinatorService.getAllSections()
            ]);
            setAdvisers(advData as AdviserWithSections[]);
            setSections(secData as SectionItem[]);
        } catch (err: any) {
            console.error('Error loading advisers data:', err);
            setError(err.message || 'Failed to load advisers');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

    // Filter Advisers
    const filteredAdvisers = useMemo(() => {
        return advisers.filter(a => {
            const matchesCourse = courseFilter === 'all' || a.course === courseFilter || 
                (courseFilter === 'DHT' && a.adviser_type === 'HT Adviser') ||
                (courseFilter === 'DIT' && a.adviser_type === 'IT Adviser');
            
            const fullName = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
            const email = (a.email || '').toLowerCase();
            const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());

            return matchesCourse && matchesSearch;
        });
    }, [advisers, courseFilter, searchTerm]);

    // Filter Sections
    const filteredSections = useMemo(() => {
        return sections.filter(s => {
            const matchesCourse = courseFilter === 'all' || s.course_code === courseFilter;
            const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.adviser_name || '').toLowerCase().includes(searchTerm.toLowerCase());
            return matchesCourse && matchesSearch;
        });
    }, [sections, courseFilter, searchTerm]);

    const {
        currentPage: advPage,
        setCurrentPage: setAdvPage,
        totalPages: advTotalPages,
        paginatedItems: paginatedAdvisers,
        totalItems: advTotalItems,
        itemsPerPage: advItemsPerPage
    } = usePagination(filteredAdvisers, 8);

    const {
        currentPage: secPage,
        setCurrentPage: setSecPage,
        totalPages: secTotalPages,
        paginatedItems: paginatedSections,
        totalItems: secTotalItems,
        itemsPerPage: secItemsPerPage
    } = usePagination(filteredSections, 10);

    // Handlers
    const handleCreateAdviser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createFirstName.trim() || !createLastName.trim() || !createEmail.trim()) {
            setError('Please fill in all required fields.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const adviserType = createCourse === 'DHT' ? 'HT Adviser' : 'IT Adviser';
            await coordinatorService.createAdviserAccount({
                firstName: createFirstName,
                lastName: createLastName,
                email: createEmail,
                password: createPassword || undefined,
                course: createCourse,
                adviserType
            });

            showSuccess(`Successfully created ${adviserType} account for ${createFirstName} ${createLastName}.`);
            setShowCreateModal(false);
            setCreateFirstName('');
            setCreateLastName('');
            setCreateEmail('');
            setCreatePassword('');
            await loadData();
        } catch (err: any) {
            console.error('Error creating adviser:', err);
            setError(err.message || 'Failed to create adviser account.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async (adviser: AdviserWithSections) => {
        const newStatus = !adviser.is_active;
        const actionText = newStatus ? 'activate' : 'deactivate';
        if (!confirm(`Are you sure you want to ${actionText} ${adviser.first_name} ${adviser.last_name}'s account?`)) return;

        try {
            await coordinatorService.setAdviserStatus(adviser.auth_user_id, newStatus);
            showSuccess(`Adviser account ${newStatus ? 'activated' : 'deactivated'}.`);
            await loadData();
        } catch (err: any) {
            alert(`Failed to update status: ${err.message}`);
        }
    };

    const openAssignModal = (section?: SectionItem, preselectedAdviser?: AdviserWithSections) => {
        setError(null);
        if (section) {
            setAssignSectionId(section.id);
            setAssignAdviserId(section.adviser_id || '');
        } else {
            setAssignSectionId(sections[0]?.id || '');
            setAssignAdviserId(preselectedAdviser?.auth_user_id || '');
        }
        setShowAssignModal(true);
    };

    const handleAssignSection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignSectionId || !assignAdviserId) {
            setError('Please select both a section and an adviser.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await coordinatorService.assignAdviserToSection(assignAdviserId, assignSectionId);
            const sec = sections.find(s => s.id === assignSectionId);
            const adv = advisers.find(a => a.auth_user_id === assignAdviserId);
            showSuccess(`Successfully assigned ${adv?.first_name} ${adv?.last_name} (${adv?.adviser_type}) to section ${sec?.name}.`);
            setShowAssignModal(false);
            await loadData();
        } catch (err: any) {
            console.error('Error assigning adviser:', err);
            setError(err.message || 'Failed to assign adviser to section.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveAssignment = async (section: SectionItem) => {
        if (!confirm(`Remove ${section.adviser_name} from section ${section.name}? Students in this section will temporarily have no assigned adviser.`)) return;

        try {
            await coordinatorService.removeAdviserFromSection(section.id);
            showSuccess(`Removed adviser from section ${section.name}.`);
            await loadData();
        } catch (err: any) {
            alert(`Failed to remove assignment: ${err.message}`);
        }
    };

    const handleCreateSection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSectionName.trim()) return;

        setSubmitting(true);
        setError(null);
        try {
            await coordinatorService.createSection(newSectionName, newSectionCourse);
            showSuccess(`Section ${newSectionName.toUpperCase()} created successfully.`);
            setShowSectionModal(false);
            setNewSectionName('');
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to create section.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleViewAdviserDetail = async (adv: AdviserWithSections) => {
        setViewAdviserDetail(adv);
        setLoadingStudents(true);
        try {
            // Fetch students in this adviser's sections
            const sectionNames = adv.assigned_sections.map(s => s.name);
            if (sectionNames.length > 0) {
                const students = await coordinatorService.getAllStudents();
                setAdviserStudents(students.filter(s => s.section && sectionNames.includes(s.section)));
            } else {
                setAdviserStudents([]);
            }
        } catch (err) {
            console.error('Error loading adviser students:', err);
        } finally {
            setLoadingStudents(false);
        }
    };

    // Filter compatible advisers for assignment modal based on selected section course
    const activeSection = sections.find(s => s.id === assignSectionId);
    const compatibleAdvisers = useMemo(() => {
        if (!activeSection) return advisers.filter(a => a.is_active !== false);
        return advisers.filter(a => {
            if (a.is_active === false) return false;
            if (activeSection.course_code === 'DHT') {
                return a.course === 'DHT' || a.adviser_type === 'HT Adviser';
            }
            if (activeSection.course_code === 'DIT') {
                return a.course === 'DIT' || a.adviser_type === 'IT Adviser';
            }
            return false;
        });
    }, [advisers, activeSection]);

    // Calculate Summary KPIs
    const totalAdvisers = advisers.length;
    const htAdvisersCount = advisers.filter(a => a.course === 'DHT' || a.adviser_type === 'HT Adviser').length;
    const itAdvisersCount = advisers.filter(a => a.course === 'DIT' || a.adviser_type === 'IT Adviser').length;
    const unassignedSections = sections.filter(s => !s.adviser_id);

    return (
        <div className="fade-in">
            {/* Top Stat Banners */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-label">Total Advisers</div>
                    <div className="stat-value">{totalAdvisers}</div>
                    <div className="stat-sub">{htAdvisersCount} HT · {itAdvisersCount} IT</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Sections</div>
                    <div className="stat-value">{sections.length}</div>
                    <div className="stat-sub">
                        {unassignedSections.length > 0 ? (
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>{unassignedSections.length} unassigned</span>
                        ) : (
                            <span style={{ color: '#10b981' }}>All assigned</span>
                        )}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">HT Advisers (DHT)</div>
                    <div className="stat-value" style={{ color: '#6366f1' }}>{htAdvisersCount}</div>
                    <div className="stat-sub">Hospitality Technology</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">IT Advisers (DIT)</div>
                    <div className="stat-value" style={{ color: '#0ea5e9' }}>{itAdvisersCount}</div>
                    <div className="stat-sub">Information Technology</div>
                </div>
            </div>

            {/* Notifications / Alerts */}
            {successMessage && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    borderRadius: 8,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 500
                }}>
                    <span>✓</span> {successMessage}
                </div>
            )}

            {error && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    borderRadius: 8,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <span>⚠</span> {error}
                </div>
            )}

            {/* Unassigned Sections Warning Banner */}
            {unassignedSections.length > 0 && (
                <div style={{
                    padding: '1rem 1.25rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 10,
                    marginBottom: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                }}>
                    <div>
                        <div style={{ fontWeight: 600, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>⚠️</span> {unassignedSections.length} Section{unassignedSections.length > 1 ? 's' : ''} Without Assigned Adviser
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Students in {unassignedSections.map(s => s.name).join(', ')} cannot have their accounts approved until an adviser is assigned.
                        </div>
                    </div>
                    <button
                        className="cd-btn cd-btn-primary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                        onClick={() => openAssignModal(unassignedSections[0])}
                    >
                        Assign Adviser Now
                    </button>
                </div>
            )}

            {/* Main Content Card */}
            <div className="admin-table-card">
                {/* Header & Tabs */}
                <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>Adviser & Section Management</div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>
                            Manage academic advisers and assign them to respective DHT and DIT sections.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            className="cd-btn cd-btn-outline"
                            onClick={() => setShowSectionModal(true)}
                        >
                            + New Section
                        </button>
                        <button
                            className="cd-btn cd-btn-primary"
                            onClick={() => setShowCreateModal(true)}
                        >
                            + Add Adviser
                        </button>
                    </div>
                </div>

                {/* Sub-header Tabs & Search Filter */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--admin-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    background: 'var(--bg-elevated)'
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className={`filter-tab ${activeTab === 'advisers' ? 'active' : ''}`}
                            onClick={() => setActiveTab('advisers')}
                            style={{
                                padding: '0.45rem 1rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: activeTab === 'advisers' ? 'var(--primary)' : 'transparent',
                                color: activeTab === 'advisers' ? '#fff' : 'var(--text-primary)',
                                cursor: 'pointer',
                                fontWeight: 500
                            }}
                        >
                            Advisers ({filteredAdvisers.length})
                        </button>
                        <button
                            className={`filter-tab ${activeTab === 'sections' ? 'active' : ''}`}
                            onClick={() => setActiveTab('sections')}
                            style={{
                                padding: '0.45rem 1rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: activeTab === 'sections' ? 'var(--primary)' : 'transparent',
                                color: activeTab === 'sections' ? '#fff' : 'var(--text-primary)',
                                cursor: 'pointer',
                                fontWeight: 500
                            }}
                        >
                            Sections ({filteredSections.length})
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {/* Course Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Course:</span>
                            <select
                                value={courseFilter}
                                onChange={(e: any) => setCourseFilter(e.target.value)}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-page)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <option value="all">All Courses</option>
                                <option value="DHT">DHT (Hospitality)</option>
                                <option value="DIT">DIT (Information Tech)</option>
                            </select>
                        </div>

                        {/* Search Bar */}
                        <input
                            type="text"
                            placeholder="Search by name or section…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
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

                {/* Content Table */}
                {loading ? (
                    <TableSkeleton rows={5} cols={5} />
                ) : activeTab === 'advisers' ? (
                    <>
                        {paginatedAdvisers.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No advisers found matching your search.
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Adviser Name</th>
                                        <th>Course / Type</th>
                                        <th>Assigned Sections</th>
                                        <th>Students</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedAdvisers.map(adv => (
                                        <tr key={adv.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        width: '36px',
                                                        height: '36px',
                                                        borderRadius: '50%',
                                                        background: adv.course === 'DHT' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(14, 165, 233, 0.15)',
                                                        color: adv.course === 'DHT' ? '#6366f1' : '#0ea5e9',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 600,
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        {adv.first_name?.[0] || 'A'}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                            <UserClickableName
                                                                userId={adv.auth_user_id}
                                                                userName={`${adv.first_name || ''} ${adv.last_name || ''}`.trim() || adv.email || 'Adviser'}
                                                            />
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{adv.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '0.25rem 0.6rem',
                                                    borderRadius: 12,
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: adv.course === 'DHT' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                                                    color: adv.course === 'DHT' ? '#6366f1' : '#0ea5e9'
                                                }}>
                                                    {adv.adviser_type || (adv.course === 'DHT' ? 'HT Adviser' : 'IT Adviser')}
                                                </span>
                                            </td>
                                            <td>
                                                {adv.assigned_sections.length > 0 ? (
                                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                        {adv.assigned_sections.map(s => (
                                                            <span
                                                                key={s.id}
                                                                style={{
                                                                    padding: '0.2rem 0.5rem',
                                                                    background: 'var(--bg-page)',
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: 6,
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 500
                                                                }}
                                                            >
                                                                {s.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                                        No sections assigned
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{adv.students_count}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>supervised</div>
                                            </td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: 12,
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    background: adv.is_active !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                    color: adv.is_active !== false ? '#10b981' : '#ef4444'
                                                }}>
                                                    {adv.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="role-select"
                                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                        onClick={() => handleViewAdviserDetail(adv)}
                                                    >
                                                        Details
                                                    </button>
                                                    <button
                                                        className="role-select"
                                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                                                        onClick={() => openAssignModal(undefined, adv)}
                                                    >
                                                        Assign Section
                                                    </button>
                                                    <button
                                                        className="role-select"
                                                        style={{
                                                            padding: '0.3rem 0.6rem',
                                                            fontSize: '0.75rem',
                                                            color: adv.is_active !== false ? '#ef4444' : '#10b981',
                                                            borderColor: adv.is_active !== false ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'
                                                        }}
                                                        onClick={() => handleToggleStatus(adv)}
                                                    >
                                                        {adv.is_active !== false ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={advPage}
                                totalPages={advTotalPages}
                                totalItems={advTotalItems}
                                itemsPerPage={advItemsPerPage}
                                onPageChange={setAdvPage}
                                itemName="advisers"
                            />
                        </div>
                    </>
                ) : (
                    /* Sections Tab */
                    <>
                        {paginatedSections.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No sections found.
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Section Name</th>
                                        <th>Course</th>
                                        <th>Assigned Adviser</th>
                                        <th>Students</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedSections.map(sec => (
                                        <tr key={sec.id}>
                                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {sec.name}
                                            </td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: 6,
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: sec.course_code === 'DHT' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                                                    color: sec.course_code === 'DHT' ? '#6366f1' : '#0ea5e9'
                                                }}>
                                                    {sec.course_code}
                                                </span>
                                            </td>
                                            <td>
                                                {sec.adviser_name ? (
                                                    <div>
                                                        <div style={{ fontWeight: 500 }}>{sec.adviser_name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sec.adviser_type}</div>
                                                    </div>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: 6,
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                        color: '#ef4444'
                                                    }}>
                                                        Unassigned
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{sec.student_count}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>enrolled</div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                    {sec.adviser_id ? (
                                                        <>
                                                            <button
                                                                className="role-select"
                                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                                                                onClick={() => openAssignModal(sec)}
                                                            >
                                                                Reassign
                                                            </button>
                                                            <button
                                                                className="role-select"
                                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                                                onClick={() => handleRemoveAssignment(sec)}
                                                            >
                                                                Remove
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            className="cd-btn cd-btn-primary"
                                                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                                                            onClick={() => openAssignModal(sec)}
                                                        >
                                                            Assign Adviser
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={secPage}
                                totalPages={secTotalPages}
                                totalItems={secTotalItems}
                                itemsPerPage={secItemsPerPage}
                                onPageChange={setSecPage}
                                itemName="sections"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* ══ MODAL: CREATE ADVISER ══ */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Add New Section Adviser</h3>
                            <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateAdviser} style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>First Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={createFirstName}
                                        onChange={e => setCreateFirstName(e.target.value)}
                                        placeholder="e.g. Maria"
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Last Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={createLastName}
                                        onChange={e => setCreateLastName(e.target.value)}
                                        placeholder="e.g. Santos"
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Email Address *</label>
                                <input
                                    type="email"
                                    required
                                    value={createEmail}
                                    onChange={e => setCreateEmail(e.target.value)}
                                    placeholder="e.g. msantos@asiancollege.edu.ph"
                                    style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Course & Adviser Type *</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div
                                        onClick={() => setCreateCourse('DHT')}
                                        style={{
                                            padding: '1rem',
                                            borderRadius: 10,
                                            border: `2px solid ${createCourse === 'DHT' ? '#6366f1' : 'var(--border)'}`,
                                            background: createCourse === 'DHT' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-page)',
                                            cursor: 'pointer',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, color: createCourse === 'DHT' ? '#6366f1' : 'var(--text-primary)' }}>HT Adviser</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>DHT (Hospitality)</div>
                                    </div>

                                    <div
                                        onClick={() => setCreateCourse('DIT')}
                                        style={{
                                            padding: '1rem',
                                            borderRadius: 10,
                                            border: `2px solid ${createCourse === 'DIT' ? '#0ea5e9' : 'var(--border)'}`,
                                            background: createCourse === 'DIT' ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-page)',
                                            cursor: 'pointer',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, color: createCourse === 'DIT' ? '#0ea5e9' : 'var(--text-primary)' }}>IT Adviser</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>DIT (Information Tech)</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Temporary Password (Optional)</label>
                                <input
                                    type="password"
                                    value={createPassword}
                                    onChange={e => setCreatePassword(e.target.value)}
                                    placeholder="Defaults to Adviser@12345"
                                    style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" className="cd-btn cd-btn-outline" onClick={() => setShowCreateModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="cd-btn cd-btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating…' : 'Create Adviser'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ MODAL: ASSIGN / REASSIGN ADVISER TO SECTION ══ */}
            {showAssignModal && (
                <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', width: '90%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                                {activeSection?.adviser_id ? 'Reassign Section Adviser' : 'Assign Adviser to Section'}
                            </h3>
                            <button className="modal-close-btn" onClick={() => setShowAssignModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAssignSection} style={{ padding: '1.5rem' }}>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    Target Section *
                                </label>
                                <select
                                    value={assignSectionId}
                                    onChange={e => setAssignSectionId(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-page)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    <option value="" disabled>Select Section</option>
                                    {sections.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.course_code}) — {s.student_count} Students {s.adviser_name ? `(Current: ${s.adviser_name})` : '(Unassigned)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {activeSection && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    background: activeSection.course_code === 'DHT' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(14, 165, 233, 0.08)',
                                    borderRadius: 8,
                                    marginBottom: '1.25rem',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <span>ℹ</span>
                                    <span>
                                        Section course is <strong>{activeSection.course_code}</strong>. Only <strong>{activeSection.course_code === 'DHT' ? 'HT Advisers' : 'IT Advisers'}</strong> are compatible.
                                    </span>
                                </div>
                            )}

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    Select {activeSection?.course_code === 'DHT' ? 'HT Adviser' : activeSection?.course_code === 'DIT' ? 'IT Adviser' : 'Adviser'} *
                                </label>
                                {compatibleAdvisers.length === 0 ? (
                                    <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 8, fontSize: '0.85rem' }}>
                                        No active {activeSection?.course_code === 'DHT' ? 'HT Advisers' : 'IT Advisers'} available. Please create or activate one first.
                                    </div>
                                ) : (
                                    <select
                                        value={assignAdviserId}
                                        onChange={e => setAssignAdviserId(e.target.value)}
                                        required
                                        style={{
                                            width: '100%',
                                            padding: '0.65rem',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-page)',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        <option value="" disabled>Select Compatible Adviser</option>
                                        {compatibleAdvisers.map(a => (
                                            <option key={a.auth_user_id} value={a.auth_user_id}>
                                                {a.first_name} {a.last_name} ({a.adviser_type}) — Handles {a.sections_count} Section{a.sections_count !== 1 ? 's' : ''} ({a.students_count} Students)
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {activeSection?.adviser_id && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    borderRadius: 8,
                                    marginBottom: '1.25rem',
                                    fontSize: '0.8rem',
                                    color: '#f59e0b'
                                }}>
                                    ⚠️ Reassigning will automatically transfer supervision of all <strong>{activeSection.student_count} students</strong> in {activeSection.name} to the new adviser.
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" className="cd-btn cd-btn-outline" onClick={() => setShowAssignModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="cd-btn cd-btn-primary"
                                    disabled={submitting || compatibleAdvisers.length === 0}
                                >
                                    {submitting ? 'Saving…' : activeSection?.adviser_id ? 'Confirm Reassignment' : 'Assign Adviser'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ MODAL: CREATE SECTION ══ */}
            {showSectionModal && (
                <div className="modal-overlay" onClick={() => setShowSectionModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '90%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Create New Section</h3>
                            <button className="modal-close-btn" onClick={() => setShowSectionModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateSection} style={{ padding: '1.5rem' }}>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    Section Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. DHT-1D or DIT-2C"
                                    value={newSectionName}
                                    onChange={e => setNewSectionName(e.target.value.toUpperCase())}
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-page)',
                                        color: 'var(--text-primary)',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    Course *
                                </label>
                                <select
                                    value={newSectionCourse}
                                    onChange={(e: any) => setNewSectionCourse(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-page)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    <option value="DHT">DHT — Diploma in Hospitality Technology</option>
                                    <option value="DIT">DIT — Diploma in Information Technology</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" className="cd-btn cd-btn-outline" onClick={() => setShowSectionModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="cd-btn cd-btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating…' : 'Create Section'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ MODAL: ADVISER DETAIL & STUDENTS ROSTER ══ */}
            {viewAdviserDetail && (
                <div className="modal-overlay" onClick={() => setViewAdviserDetail(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                                    {viewAdviserDetail.first_name} {viewAdviserDetail.last_name}
                                </h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    {viewAdviserDetail.adviser_type} · {viewAdviserDetail.email}
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={() => setViewAdviserDetail(null)}>✕</button>
                        </div>

                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            {/* Assigned Sections Summary */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                                    Assigned Sections ({viewAdviserDetail.assigned_sections.length})
                                </div>
                                {viewAdviserDetail.assigned_sections.length > 0 ? (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {viewAdviserDetail.assigned_sections.map(s => (
                                            <div
                                                key={s.id}
                                                style={{
                                                    padding: '0.5rem 0.85rem',
                                                    background: 'var(--bg-elevated)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 8,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <span style={{ fontWeight: 600 }}>{s.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({s.course_code})</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                        No sections currently assigned to this adviser.
                                    </div>
                                )}
                            </div>

                            {/* Supervised Students */}
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Supervised Students ({adviserStudents.length})</span>
                                </div>

                                {loadingStudents ? (
                                    <TableSkeleton rows={4} cols={3} />
                                ) : adviserStudents.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-page)', borderRadius: 8 }}>
                                        No students currently enrolled under this adviser's assigned sections.
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                                        <table className="admin-table" style={{ margin: 0 }}>
                                            <thead>
                                                <tr>
                                                    <th>Student</th>
                                                    <th>Section</th>
                                                    <th>Company Placement</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {adviserStudents.map(st => (
                                                    <tr key={st.id}>
                                                        <td>
                                                            <div style={{ fontWeight: 500 }}>{st.first_name} {st.last_name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.email}</div>
                                                        </td>
                                                        <td>
                                                            <span style={{ fontWeight: 600 }}>{st.section || '—'}</span>
                                                        </td>
                                                        <td>
                                                            {st.company?.name || (
                                                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not deployed</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                padding: '0.2rem 0.45rem',
                                                                borderRadius: 8,
                                                                fontWeight: 600,
                                                                background: st.is_active !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                                                color: st.is_active !== false ? '#10b981' : '#f59e0b'
                                                            }}>
                                                                {st.is_active !== false ? 'ACTIVE' : 'PENDING'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-elevated)' }}>
                            <button className="cd-btn cd-btn-outline" onClick={() => setViewAdviserDetail(null)}>
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

export default CoordinatorAdvisersView;

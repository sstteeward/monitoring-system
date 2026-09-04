import React, { useEffect, useState, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import type { Profile } from '../services/profileService';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { studentMatchesSection, parseSectionName, YEAR_LEVELS } from '../utils/sections';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, EMAIL_ALREADY_REGISTERED_TITLE, isDuplicateEmailError } from '../utils/email';
import './CoordinatorDashboard.css';
import './CoordinatorAdvisersView.css';

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

/** What the details drawer is currently showing. */
type DrawerState =
    | { kind: 'adviser'; adviser: AdviserWithSections }
    | { kind: 'section'; section: SectionItem }
    | null;

/**
 * Assignment flows, all of which end in the same save handler:
 *  - 'section'  one specific section is being (re)assigned;
 *  - 'adviser'  one adviser, any number of sections (ticks add, unticks remove);
 *  - 'bulk'     several sections picked in the table go to one adviser.
 */
type AssignMode = 'section' | 'adviser' | 'bulk';

// ─── Icons ───────────────────────────────────────────────────────────────────
const svg = (path: React.ReactNode, size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
    </svg>
);

const Icon = {
    users: (s = 16) => svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, s),
    grid: (s = 16) => svg(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>, s),
    badge: (s = 16) => svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, s),
    search: (s = 15) => svg(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, s),
    plus: (s = 15) => svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, s),
    warn: (s = 18) => svg(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, s),
    check: (s = 18) => svg(<polyline points="20 6 9 17 4 12" />, s),
    checkCircle: (s = 16) => svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>, s),
    alert: (s = 16) => svg(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, s),
    close: (s = 18) => svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, s),
    more: (s = 16) => svg(<><circle cx="12" cy="5" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="19" r="1.6" fill="currentColor" /></>, s),
    layers: (s = 16) => svg(<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>, s),
    userX: (s = 16) => svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></>, s),
    userCheck: (s = 16) => svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></>, s),
    eye: (s = 16) => svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, s),
    inbox: (s = 22) => svg(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>, s),
    refresh: (s = 15) => svg(<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>, s),
};

// ─── Small helpers ───────────────────────────────────────────────────────────

/** Tracks a media query so the table can be swapped for cards on small screens. */
const supportsMatchMedia = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((onStoreChange: () => void) => {
        if (!supportsMatchMedia()) return () => { };
        const mql = window.matchMedia(query);
        mql.addEventListener('change', onStoreChange);
        return () => mql.removeEventListener('change', onStoreChange);
    }, [query]);

    const getSnapshot = useCallback(
        () => (supportsMatchMedia() ? window.matchMedia(query).matches : false),
        [query]
    );

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

const fullNameOf = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
    `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Unnamed';

const initialsOf = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) => {
    const first = p.first_name?.trim()?.[0];
    const last = p.last_name?.trim()?.[0];
    if (first || last) return `${first || ''}${last || ''}`.toUpperCase();
    return (p.email?.[0] || 'A').toUpperCase();
};

/** The two adviser/course families the portal recognises. */
const handlesCourse = (a: { course?: string | null; adviser_type?: string | null }, code: string) => {
    if (code === 'DHT') return a.course === 'DHT' || a.adviser_type === 'HT Adviser';
    if (code === 'DIT') return a.course === 'DIT' || a.adviser_type === 'IT Adviser';
    return false;
};

const toneForCourse = (code?: string | null) => (code === 'DHT' ? 'ht' : 'it');
const toneForAdviser = (a: { course?: string | null; adviser_type?: string | null }) =>
    handlesCourse(a, 'DHT') ? 'ht' : 'it';

const adviserTypeLabel = (a: AdviserWithSections) =>
    a.adviser_type || (a.course === 'DHT' ? 'HT Adviser' : 'IT Adviser');

const COURSE_NAMES: Record<string, string> = {
    DHT: 'Hospitality Technology',
    DIT: 'Information Technology',
};

/** "DIT-1A" → "1st Year". Falls back to an em dash for free-text section names. */
const yearLabelOf = (sectionName: string) => {
    const parsed = parseSectionName(sectionName);
    if (!parsed) return '—';
    return YEAR_LEVELS[parsed.year - 1] || `Year ${parsed.year}`;
};

const CHIP_LIMIT = 3;

// ─── Component ───────────────────────────────────────────────────────────────
const CoordinatorAdvisersView: React.FC = () => {
    const [advisers, setAdvisers] = useState<AdviserWithSections[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'advisers' | 'sections'>('advisers');
    const [searchTerm, setSearchTerm] = useState('');
    const [courseFilter, setCourseFilter] = useState<'all' | 'DHT' | 'DIT'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
    const [adviserFilter, setAdviserFilter] = useState<string>('all');
    const [error, setError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal / drawer states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<DrawerState>(null);
    const [rosterStudents, setRosterStudents] = useState<Profile[]>([]);
    const [loadingRoster, setLoadingRoster] = useState(false);

    // Row-level UI state
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [expandedChips, setExpandedChips] = useState<string[]>([]);
    const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);

    // Form states
    const [submitting, setSubmitting] = useState(false);
    const [createFirstName, setCreateFirstName] = useState('');
    const [createLastName, setCreateLastName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createCourse, setCreateCourse] = useState<'DHT' | 'DIT'>('DHT');

    // Assign / reassign form state
    const [assignMode, setAssignMode] = useState<AssignMode>('section');
    const [assignSectionId, setAssignSectionId] = useState('');
    const [assignSectionIds, setAssignSectionIds] = useState<string[]>([]);
    const [assignAdviserId, setAssignAdviserId] = useState('');
    const [assignSearch, setAssignSearch] = useState('');

    // Create section form state
    const [newSectionName, setNewSectionName] = useState('');
    const [newSectionCourse, setNewSectionCourse] = useState<'DHT' | 'DIT'>('DHT');

    const isNarrow = useMediaQuery('(max-width: 780px)');
    const dialogRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [advData, secData] = await Promise.all([
                coordinatorService.getAllAdvisers(),
                coordinatorService.getAllSections()
            ]);
            setAdvisers(advData as AdviserWithSections[]);
            setSections(secData as SectionItem[]);
        } catch (err: any) {
            console.error('Error loading advisers data:', err);
            setLoadError(err?.message || 'Failed to load advisers and sections.');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

    // Drop selections that point at sections which no longer exist.
    useEffect(() => {
        setSelectedSectionIds(prev => {
            const live = prev.filter(id => sections.some(s => s.id === id));
            return live.length === prev.length ? prev : live;
        });
    }, [sections]);

    // ── Filtering ────────────────────────────────────────────────────────────
    const query = searchTerm.trim().toLowerCase();

    const filteredAdvisers = useMemo(() => {
        return advisers.filter(a => {
            const matchesCourse = courseFilter === 'all'
                || a.course === courseFilter
                || handlesCourse(a, courseFilter);

            const isActive = a.is_active !== false;
            const matchesStatus = statusFilter === 'all'
                || (statusFilter === 'active' && isActive)
                || (statusFilter === 'inactive' && !isActive);

            // Searching an adviser also searches their type and their sections,
            // so "DIT-1A" finds whoever handles it.
            const haystack = [
                fullNameOf(a),
                a.email || '',
                adviserTypeLabel(a),
                a.course || '',
                ...a.assigned_sections.map(s => s.name),
            ].join(' ').toLowerCase();

            return matchesCourse && matchesStatus && (!query || haystack.includes(query));
        });
    }, [advisers, courseFilter, statusFilter, query]);

    const filteredSections = useMemo(() => {
        return sections.filter(s => {
            const matchesCourse = courseFilter === 'all' || s.course_code === courseFilter;

            const matchesAssignment = assignmentFilter === 'all'
                || (assignmentFilter === 'assigned' && !!s.adviser_id)
                || (assignmentFilter === 'unassigned' && !s.adviser_id);

            const matchesAdviser = adviserFilter === 'all'
                || (adviserFilter === 'none' ? !s.adviser_id : s.adviser_id === adviserFilter);

            const haystack = [
                s.name,
                s.course_code,
                COURSE_NAMES[s.course_code] || '',
                yearLabelOf(s.name),
                s.adviser_name || '',
                s.adviser_email || '',
            ].join(' ').toLowerCase();

            return matchesCourse && matchesAssignment && matchesAdviser && (!query || haystack.includes(query));
        });
    }, [sections, courseFilter, assignmentFilter, adviserFilter, query]);

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

    // ── Handlers ─────────────────────────────────────────────────────────────
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
            setError(isDuplicateEmailError(err)
                ? `${EMAIL_ALREADY_REGISTERED_TITLE} — ${EMAIL_ALREADY_REGISTERED_MESSAGE}`
                : (err.message || 'Failed to create adviser account.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async (adviser: AdviserWithSections) => {
        const newStatus = !adviser.is_active;
        const actionText = newStatus ? 'activate' : 'deactivate';
        if (!confirm(`Are you sure you want to ${actionText} ${fullNameOf(adviser)}'s account?`)) return;

        try {
            await coordinatorService.setAdviserStatus(adviser.auth_user_id, newStatus);
            showSuccess(`Adviser account ${newStatus ? 'activated' : 'deactivated'}.`);
            await loadData();
        } catch (err: any) {
            setError(`Failed to update status: ${err.message}`);
        }
    };

    const openAssignModal = (section?: SectionItem, preselectedAdviser?: AdviserWithSections) => {
        setError(null);
        setAssignSearch('');
        if (section) {
            // Section-first flow: one specific section is being (re)assigned.
            setAssignMode('section');
            setAssignSectionId(section.id);
            setAssignSectionIds([section.id]);
            setAssignAdviserId(section.adviser_id || '');
        } else {
            // Adviser-first flow: pick any number of sections for this adviser,
            // pre-ticking the ones they already hold.
            setAssignMode('adviser');
            setAssignSectionId('');
            setAssignSectionIds(preselectedAdviser?.assigned_sections.map(s => s.id) || []);
            setAssignAdviserId(preselectedAdviser?.auth_user_id || '');
        }
        setShowAssignModal(true);
    };

    /** Bulk flow: the sections ticked in the Sections table go to one adviser. */
    const openBulkAssignModal = () => {
        if (selectedSectionIds.length === 0) return;
        setError(null);
        setAssignSearch('');
        setAssignMode('bulk');
        setAssignSectionId('');
        setAssignSectionIds([...selectedSectionIds]);
        setAssignAdviserId('');
        setShowAssignModal(true);
    };

    const toggleAssignSection = (sectionId: string) => {
        setAssignSectionIds(prev =>
            prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
        );
    };

    const handleAssignSection = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!assignAdviserId) {
            setError('Please select an adviser.');
            return;
        }

        const targetIds = assignMode === 'section'
            ? (assignSectionId ? [assignSectionId] : [])
            : assignSectionIds;

        if (targetIds.length === 0) {
            setError('Please select at least one section.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const adv = advisers.find(a => a.auth_user_id === assignAdviserId);
            const adviserName = adv ? fullNameOf(adv) : 'Adviser';

            // Sections the adviser holds today but that are no longer ticked.
            // Only the adviser-first flow can remove; the other two only add.
            const removedIds = assignMode === 'adviser'
                ? (adv?.assigned_sections || [])
                    .filter(s => !targetIds.includes(s.id))
                    .map(s => s.id)
                : [];

            const { assigned, failed } = await coordinatorService.assignAdviserToSections(
                assignAdviserId,
                targetIds
            );

            for (const sectionId of removedIds) {
                await coordinatorService.removeAdviserFromSection(sectionId);
            }

            const nameOf = (id: string) => sections.find(s => s.id === id)?.name || id;

            if (failed.length > 0) {
                setError(
                    `Could not assign ${failed.map(f => nameOf(f.sectionId)).join(', ')}: ${failed[0].message}`
                );
            }

            if (assigned.length > 0 || removedIds.length > 0) {
                const parts: string[] = [];
                if (assigned.length > 0) {
                    parts.push(`assigned to ${assigned.map(nameOf).join(', ')}`);
                }
                if (removedIds.length > 0) {
                    parts.push(`removed from ${removedIds.map(nameOf).join(', ')}`);
                }
                showSuccess(`${adviserName} ${parts.join(' and ')}.`);
            }

            if (failed.length === 0) {
                setShowAssignModal(false);
                if (assignMode === 'bulk') setSelectedSectionIds([]);
            }
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
            setError(`Failed to remove assignment: ${err.message}`);
        }
    };

    /** Bulk unassign — only the ticked sections that actually have an adviser. */
    const handleBulkRemove = async () => {
        const targets = sections.filter(s => selectedSectionIds.includes(s.id) && s.adviser_id);
        if (targets.length === 0) return;
        if (!confirm(`Remove the assigned adviser from ${targets.length} section${targets.length > 1 ? 's' : ''} (${targets.map(s => s.name).join(', ')})? Students in them will temporarily have no adviser.`)) return;

        setSubmitting(true);
        setError(null);
        try {
            for (const section of targets) {
                await coordinatorService.removeAdviserFromSection(section.id);
            }
            showSuccess(`Removed the adviser from ${targets.map(s => s.name).join(', ')}.`);
            setSelectedSectionIds([]);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to remove one or more assignments.');
        } finally {
            setSubmitting(false);
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

    /**
     * Loads the students behind a set of section names. A student's stored
     * section may still be a legacy letter, so names are compared canonically.
     */
    const loadRoster = useCallback(async (sectionNames: string[]) => {
        setLoadingRoster(true);
        try {
            if (sectionNames.length === 0) {
                setRosterStudents([]);
                return;
            }
            const students = await coordinatorService.getAllStudents();
            setRosterStudents(
                students.filter(s => sectionNames.some(name => studentMatchesSection(s, name)))
            );
        } catch (err) {
            console.error('Error loading section roster:', err);
            setRosterStudents([]);
        } finally {
            setLoadingRoster(false);
        }
    }, []);

    const openAdviserDrawer = (adv: AdviserWithSections) => {
        setOpenMenuId(null);
        setDrawer({ kind: 'adviser', adviser: adv });
        loadRoster(adv.assigned_sections.map(s => s.name));
    };

    const openSectionDrawer = (sec: SectionItem) => {
        setOpenMenuId(null);
        setDrawer({ kind: 'section', section: sec });
        loadRoster([sec.name]);
    };

    const toggleChips = (id: string) =>
        setExpandedChips(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const toggleSectionSelection = (id: string) =>
        setSelectedSectionIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const allFilteredSelected =
        filteredSections.length > 0 && filteredSections.every(s => selectedSectionIds.includes(s.id));

    const toggleSelectAll = () => {
        setSelectedSectionIds(prev =>
            allFilteredSelected
                ? prev.filter(id => !filteredSections.some(s => s.id === id))
                : Array.from(new Set([...prev, ...filteredSections.map(s => s.id)]))
        );
    };

    /** Jumps to the Sections tab pre-filtered to the ones needing an adviser. */
    const reviewUnassigned = () => {
        setActiveTab('sections');
        setAssignmentFilter('unassigned');
        setAdviserFilter('all');
        setSearchTerm('');
        setSecPage(1);
    };

    // ── Assignment-dialog derived data ───────────────────────────────────────
    const activeSection = sections.find(s => s.id === assignSectionId);

    /** Sections this save will write to — drives compatibility and the summary. */
    const assignTargets = useMemo(() => {
        if (assignMode === 'section') return sections.filter(s => s.id === assignSectionId);
        if (assignMode === 'bulk') return sections.filter(s => assignSectionIds.includes(s.id));
        return [];
    }, [assignMode, assignSectionId, assignSectionIds, sections]);

    const targetCourseCodes = useMemo(
        () => Array.from(new Set(assignTargets.map(s => s.course_code))),
        [assignTargets]
    );

    // Only active advisers whose course matches every targeted section — the
    // same compatibility rule the service enforces on save.
    const compatibleAdvisers = useMemo(() => {
        const active = advisers.filter(a => a.is_active !== false);
        if (targetCourseCodes.length === 0) return active;
        return active.filter(a => targetCourseCodes.every(code => handlesCourse(a, code)));
    }, [advisers, targetCourseCodes]);

    // In adviser-first mode, offer every section whose course matches the
    // selected adviser.
    const activeAdviser = advisers.find(a => a.auth_user_id === assignAdviserId);
    const compatibleSections = useMemo(() => {
        if (!activeAdviser) return sections;
        return sections.filter(s => handlesCourse(activeAdviser, s.course_code));
    }, [sections, activeAdviser]);

    const pickerSections = useMemo(() => {
        const q = assignSearch.trim().toLowerCase();
        if (!q) return compatibleSections;
        return compatibleSections.filter(s =>
            `${s.name} ${s.adviser_name || ''} ${yearLabelOf(s.name)}`.toLowerCase().includes(q)
        );
    }, [compatibleSections, assignSearch]);

    const mixedCourseTargets = assignMode === 'bulk' && targetCourseCodes.length > 1;

    // ── Summary KPIs (all derived from live data) ────────────────────────────
    const totalAdvisers = advisers.length;
    const htAdvisersCount = advisers.filter(a => handlesCourse(a, 'DHT')).length;
    const itAdvisersCount = advisers.filter(a => handlesCourse(a, 'DIT')).length;
    const unassignedSections = useMemo(() => sections.filter(s => !s.adviser_id), [sections]);

    // ── Overlay behaviour: Escape to close, scroll lock while open ───────────
    const anyOverlayOpen = showCreateModal || showAssignModal || showSectionModal || !!drawer;

    useEffect(() => {
        if (!anyOverlayOpen && !openMenuId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (openMenuId) { setOpenMenuId(null); return; }
            if (showAssignModal) { setShowAssignModal(false); return; }
            if (showCreateModal) { setShowCreateModal(false); return; }
            if (showSectionModal) { setShowSectionModal(false); return; }
            if (drawer) setDrawer(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [anyOverlayOpen, openMenuId, showAssignModal, showCreateModal, showSectionModal, drawer]);

    useEffect(() => {
        if (!anyOverlayOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();
        return () => { document.body.style.overflow = previous; };
    }, [anyOverlayOpen]);

    // ── Reusable fragments ───────────────────────────────────────────────────
    const statusBadge = (isActive: boolean) => (
        <span className="cam-badge" data-tone={isActive ? 'ok' : 'danger'}>
            <span className="cam-badge-dot" />
            {isActive ? 'Active' : 'Inactive'}
        </span>
    );

    const sectionChips = (
        key: string,
        list: { id: string; name: string }[],
        emptyText = 'No sections assigned'
    ) => {
        if (list.length === 0) return <span className="cam-muted">{emptyText}</span>;
        const expanded = expandedChips.includes(key);
        const shown = expanded ? list : list.slice(0, CHIP_LIMIT);
        const hidden = list.length - shown.length;
        return (
            <div className="cam-chips" title={list.map(s => s.name).join(', ')}>
                {shown.map(s => <span key={s.id} className="cam-chip">{s.name}</span>)}
                {(hidden > 0 || expanded) && (
                    <button
                        type="button"
                        className="cam-chip cam-chip-more"
                        onClick={() => toggleChips(key)}
                        aria-expanded={expanded}
                    >
                        {expanded ? 'Show less' : `+${hidden} more`}
                    </button>
                )}
            </div>
        );
    };

    /** The ⋮ menu shared by the table rows and the mobile cards. */
    const adviserMenu = (adv: AdviserWithSections) => {
        const isActive = adv.is_active !== false;
        const open = openMenuId === adv.id;
        return (
            <div className="cam-menu-wrap">
                <button
                    type="button"
                    className="cam-icon-btn"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label={`More actions for ${fullNameOf(adv)}`}
                    title="More actions"
                    onClick={() => setOpenMenuId(open ? null : adv.id)}
                >
                    {Icon.more()}
                </button>
                {open && (
                    <>
                        <div className="cam-menu-scrim" onClick={() => setOpenMenuId(null)} />
                        <div className="cam-menu" role="menu" aria-label={`Actions for ${fullNameOf(adv)}`}>
                            <button type="button" role="menuitem" className="cam-menu-item"
                                onClick={() => { setOpenMenuId(null); setViewProfileId(adv.auth_user_id); }}>
                                {Icon.badge()} View profile
                            </button>
                            <button type="button" role="menuitem" className="cam-menu-item"
                                onClick={() => openAdviserDrawer(adv)}>
                                {Icon.eye()} Adviser details
                            </button>
                            <button type="button" role="menuitem" className="cam-menu-item"
                                onClick={() => { setOpenMenuId(null); openAssignModal(undefined, adv); }}>
                                {Icon.layers()} Manage sections
                            </button>
                            <button type="button" role="menuitem" className="cam-menu-item"
                                onClick={() => openAdviserDrawer(adv)}>
                                {Icon.users()} View students ({adv.students_count})
                            </button>
                            <div className="cam-menu-sep" />
                            <button
                                type="button"
                                role="menuitem"
                                className="cam-menu-item"
                                data-tone={isActive ? 'danger' : 'ok'}
                                onClick={() => { setOpenMenuId(null); handleToggleStatus(adv); }}
                            >
                                {isActive ? Icon.userX() : Icon.userCheck()}
                                {isActive ? 'Deactivate adviser' : 'Activate adviser'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const sectionMenu = (sec: SectionItem) => {
        const open = openMenuId === sec.id;
        return (
            <div className="cam-menu-wrap">
                <button
                    type="button"
                    className="cam-icon-btn"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label={`More actions for section ${sec.name}`}
                    title="More actions"
                    onClick={() => setOpenMenuId(open ? null : sec.id)}
                >
                    {Icon.more()}
                </button>
                {open && (
                    <>
                        <div className="cam-menu-scrim" onClick={() => setOpenMenuId(null)} />
                        <div className="cam-menu" role="menu" aria-label={`Actions for section ${sec.name}`}>
                            <button type="button" role="menuitem" className="cam-menu-item"
                                onClick={() => openSectionDrawer(sec)}>
                                {Icon.users()} View students ({sec.student_count})
                            </button>
                            <button type="button" role="menuitem" className="cam-menu-item"
                                onClick={() => { setOpenMenuId(null); openAssignModal(sec); }}>
                                {Icon.layers()} {sec.adviser_id ? 'Change adviser' : 'Assign adviser'}
                            </button>
                            {sec.adviser_id && (
                                <>
                                    <div className="cam-menu-sep" />
                                    <button type="button" role="menuitem" className="cam-menu-item" data-tone="danger"
                                        onClick={() => { setOpenMenuId(null); handleRemoveAssignment(sec); }}>
                                        {Icon.userX()} Remove adviser
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    };

    const listSkeleton = (
        <div className="cam-skel-rows" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
                <div className="cam-skel-row" key={i}>
                    <div className="cam-skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ flex: 2 }}>
                        <div className="cam-skeleton" style={{ height: 10, width: '55%', marginBottom: 8 }} />
                        <div className="cam-skeleton" style={{ height: 8, width: '75%' }} />
                    </div>
                    <div className="cam-skeleton" style={{ flex: 1, height: 10 }} />
                    <div className="cam-skeleton" style={{ flex: 1, height: 10 }} />
                    <div className="cam-skeleton" style={{ width: 90, height: 26, borderRadius: 8 }} />
                </div>
            ))}
        </div>
    );

    const hasAdviserFilters = query !== '' || courseFilter !== 'all' || statusFilter !== 'all';
    const hasSectionFilters = query !== '' || courseFilter !== 'all' || assignmentFilter !== 'all' || adviserFilter !== 'all';

    const clearFilters = () => {
        setSearchTerm('');
        setCourseFilter('all');
        setStatusFilter('all');
        setAssignmentFilter('all');
        setAdviserFilter('all');
    };

    // ═══════════════════════════════════════════════════════════════════════
    return (
        <div className="cam-page fade-in">
            {/* ── Page header ── */}
            <header className="cam-header">
                <div>
                    <h1 className="cam-header-title">Adviser &amp; Section Management</h1>
                    <p className="cam-header-sub">
                        Manage academic advisers, assign them to sections, and keep every student under supervision.
                    </p>
                </div>
                <div className="cam-header-actions">
                    <button
                        type="button"
                        className="cam-btn cam-btn-ghost"
                        onClick={() => { setError(null); setShowSectionModal(true); }}
                    >
                        {Icon.plus()} New Section
                    </button>
                    <button
                        type="button"
                        className="cam-btn cam-btn-primary"
                        onClick={() => { setError(null); setShowCreateModal(true); }}
                    >
                        {Icon.plus()} Add Adviser
                    </button>
                </div>
            </header>

            {/* ── Inline messages ── */}
            {successMessage && (
                <div className="cam-toast cam-toast-success" role="status">
                    <span className="cam-toast-icon">{Icon.checkCircle()}</span>
                    <span className="cam-toast-body">{successMessage}</span>
                </div>
            )}

            {error && (
                <div className="cam-toast cam-toast-error" role="alert">
                    <span className="cam-toast-icon">{Icon.alert()}</span>
                    <span className="cam-toast-body">{error}</span>
                    <button type="button" className="cam-dialog-close" onClick={() => setError(null)} aria-label="Dismiss message">
                        {Icon.close(15)}
                    </button>
                </div>
            )}

            {loadError && (
                <div className="cam-toast cam-toast-error" role="alert">
                    <span className="cam-toast-icon">{Icon.alert()}</span>
                    <span className="cam-toast-body">{loadError}</span>
                    <button type="button" className="cam-btn cam-btn-sm" onClick={loadData}>
                        {Icon.refresh()} Retry
                    </button>
                </div>
            )}

            {/* ── Statistics ── */}
            <div className="cam-stats">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div className="cam-stat" key={i} aria-hidden="true">
                            <div className="cam-skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
                            <div className="cam-stat-body">
                                <div className="cam-skeleton" style={{ height: 9, width: '55%' }} />
                                <div className="cam-skeleton" style={{ height: 24, width: 48, marginTop: 10 }} />
                                <div className="cam-skeleton" style={{ height: 8, width: '70%', marginTop: 10 }} />
                            </div>
                        </div>
                    ))
                ) : (
                    <>
                        <div className="cam-stat">
                            <div className="cam-stat-icon" data-tone="brand">{Icon.users(18)}</div>
                            <div className="cam-stat-body">
                                <div className="cam-stat-label">Total Advisers</div>
                                <div className="cam-stat-value">{totalAdvisers}</div>
                                <div className="cam-stat-sub">{htAdvisersCount} HT · {itAdvisersCount} IT</div>
                            </div>
                        </div>

                        <div className="cam-stat">
                            <div className="cam-stat-icon">{Icon.grid(18)}</div>
                            <div className="cam-stat-body">
                                <div className="cam-stat-label">Total Sections</div>
                                <div className="cam-stat-value">{sections.length}</div>
                                <div className="cam-stat-sub" data-tone={unassignedSections.length > 0 ? 'warn' : 'ok'}>
                                    {unassignedSections.length > 0
                                        ? `${unassignedSections.length} unassigned`
                                        : 'All assigned'}
                                </div>
                            </div>
                        </div>

                        <div className="cam-stat">
                            <div className="cam-stat-icon" data-tone="ht">{Icon.badge(18)}</div>
                            <div className="cam-stat-body">
                                <div className="cam-stat-label">HT Advisers</div>
                                <div className="cam-stat-value">{htAdvisersCount}</div>
                                <div className="cam-stat-sub">Hospitality Technology (DHT)</div>
                            </div>
                        </div>

                        <div className="cam-stat">
                            <div className="cam-stat-icon" data-tone="it">{Icon.badge(18)}</div>
                            <div className="cam-stat-body">
                                <div className="cam-stat-label">IT Advisers</div>
                                <div className="cam-stat-value">{itAdvisersCount}</div>
                                <div className="cam-stat-sub">Information Technology (DIT)</div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Unassigned-section alert ── */}
            {!loading && sections.length > 0 && (
                unassignedSections.length > 0 ? (
                    <div className="cam-alert cam-alert-warn">
                        <span className="cam-alert-icon">{Icon.warn()}</span>
                        <div className="cam-alert-body">
                            <div className="cam-alert-title">
                                {unassignedSections.length} Section{unassignedSections.length > 1 ? 's' : ''} Need an Adviser
                            </div>
                            <div className="cam-alert-text">
                                {unassignedSections.slice(0, 5).map(s => s.name).join(', ')}
                                {unassignedSections.length > 5 && ` and ${unassignedSections.length - 5} more`}
                                {' '}currently {unassignedSections.length === 1 ? 'has' : 'have'} no assigned adviser, so
                                student accounts in {unassignedSections.length === 1 ? 'it' : 'them'} cannot be approved.
                            </div>
                        </div>
                        <button type="button" className="cam-btn cam-btn-primary cam-btn-sm" onClick={reviewUnassigned}>
                            Assign Advisers
                        </button>
                    </div>
                ) : (
                    <div className="cam-alert cam-alert-ok">
                        <span className="cam-alert-icon">{Icon.check()}</span>
                        <div className="cam-alert-body">
                            <div className="cam-alert-title">All sections have an assigned adviser</div>
                            <div className="cam-alert-text">
                                Every one of the {sections.length} sections is supervised. Student accounts can be approved without delay.
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* ── Management panel ── */}
            <section className="cam-panel" aria-label="Advisers and sections">
                {/* Toolbar: tabs + filters */}
                <div className="cam-toolbar">
                    <div className="cam-tabs" role="tablist" aria-label="Management view">
                        <button
                            type="button"
                            role="tab"
                            id="cam-tab-advisers"
                            aria-selected={activeTab === 'advisers'}
                            aria-controls="cam-panel-advisers"
                            className="cam-tab"
                            onClick={() => { setActiveTab('advisers'); setOpenMenuId(null); }}
                        >
                            Advisers <span className="cam-tab-count">{filteredAdvisers.length}</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            id="cam-tab-sections"
                            aria-selected={activeTab === 'sections'}
                            aria-controls="cam-panel-sections"
                            className="cam-tab"
                            onClick={() => { setActiveTab('sections'); setOpenMenuId(null); }}
                        >
                            Sections <span className="cam-tab-count">{filteredSections.length}</span>
                        </button>
                    </div>

                    <div className="cam-filters">
                        <div className="cam-search">
                            <span className="cam-search-icon">{Icon.search()}</span>
                            <label className="cam-sr" htmlFor="cam-search-input">Search advisers or sections</label>
                            <input
                                id="cam-search-input"
                                type="search"
                                placeholder={activeTab === 'advisers'
                                    ? 'Search advisers by name, email or section…'
                                    : 'Search sections by name, year or adviser…'}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    className="cam-search-clear"
                                    onClick={() => setSearchTerm('')}
                                    aria-label="Clear search"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        <div className="cam-filter-row" style={{ display: 'flex', gap: '0.6rem' }}>
                            <label className="cam-sr" htmlFor="cam-course-filter">Filter by course</label>
                            <select
                                id="cam-course-filter"
                                className="cam-select"
                                value={courseFilter}
                                onChange={e => setCourseFilter(e.target.value as 'all' | 'DHT' | 'DIT')}
                            >
                                <option value="all">All Courses</option>
                                <option value="DHT">DHT — Hospitality</option>
                                <option value="DIT">DIT — Information Tech</option>
                            </select>

                            {activeTab === 'advisers' ? (
                                <>
                                    <label className="cam-sr" htmlFor="cam-status-filter">Filter by status</label>
                                    <select
                                        id="cam-status-filter"
                                        className="cam-select"
                                        value={statusFilter}
                                        onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                                    >
                                        <option value="all">All Statuses</option>
                                        <option value="active">Active only</option>
                                        <option value="inactive">Inactive only</option>
                                    </select>
                                </>
                            ) : (
                                <>
                                    <label className="cam-sr" htmlFor="cam-assignment-filter">Filter by assignment</label>
                                    <select
                                        id="cam-assignment-filter"
                                        className="cam-select"
                                        value={assignmentFilter}
                                        onChange={e => setAssignmentFilter(e.target.value as 'all' | 'assigned' | 'unassigned')}
                                    >
                                        <option value="all">All Sections</option>
                                        <option value="assigned">Assigned</option>
                                        <option value="unassigned">Unassigned</option>
                                    </select>

                                    <label className="cam-sr" htmlFor="cam-adviser-filter">Filter by adviser</label>
                                    <select
                                        id="cam-adviser-filter"
                                        className="cam-select"
                                        value={adviserFilter}
                                        onChange={e => setAdviserFilter(e.target.value)}
                                    >
                                        <option value="all">Any Adviser</option>
                                        <option value="none">No adviser</option>
                                        {advisers.map(a => (
                                            <option key={a.auth_user_id} value={a.auth_user_id}>{fullNameOf(a)}</option>
                                        ))}
                                    </select>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bulk-selection bar (Sections tab) */}
                {activeTab === 'sections' && selectedSectionIds.length > 0 && (
                    <div className="cam-bulkbar" role="region" aria-label="Bulk section actions">
                        <span className="cam-bulkbar-count">
                            {selectedSectionIds.length} section{selectedSectionIds.length > 1 ? 's' : ''} selected
                        </span>
                        <div className="cam-bulkbar-actions">
                            <button type="button" className="cam-btn cam-btn-sm" onClick={() => setSelectedSectionIds([])}>
                                Clear
                            </button>
                            <button
                                type="button"
                                className="cam-btn cam-btn-sm cam-btn-danger"
                                onClick={handleBulkRemove}
                                disabled={submitting || !sections.some(s => selectedSectionIds.includes(s.id) && s.adviser_id)}
                            >
                                Remove Adviser
                            </button>
                            <button type="button" className="cam-btn cam-btn-sm cam-btn-primary" onClick={openBulkAssignModal}>
                                Assign Adviser
                            </button>
                        </div>
                    </div>
                )}

                {/* ── ADVISERS TAB ── */}
                {activeTab === 'advisers' && (
                    <div id="cam-panel-advisers" role="tabpanel" aria-labelledby="cam-tab-advisers">
                        {loading ? listSkeleton : paginatedAdvisers.length === 0 ? (
                            <div className="cam-empty">
                                <div className="cam-empty-icon">{Icon.inbox()}</div>
                                <div className="cam-empty-title">
                                    {advisers.length === 0 ? 'No advisers yet' : 'No advisers match your filters'}
                                </div>
                                <p className="cam-empty-text">
                                    {advisers.length === 0
                                        ? 'Create an adviser account to start assigning sections and supervising students.'
                                        : 'Try a different search term, or reset the filters to see every adviser.'}
                                </p>
                                <div className="cam-empty-actions">
                                    {advisers.length === 0 ? (
                                        <button type="button" className="cam-btn cam-btn-primary" onClick={() => setShowCreateModal(true)}>
                                            {Icon.plus()} Add Adviser
                                        </button>
                                    ) : hasAdviserFilters && (
                                        <button type="button" className="cam-btn" onClick={clearFilters}>Reset filters</button>
                                    )}
                                </div>
                            </div>
                        ) : isNarrow ? (
                            /* Mobile: cards */
                            <div className="cam-cards">
                                {paginatedAdvisers.map(adv => {
                                    const isActive = adv.is_active !== false;
                                    return (
                                        <article className="cam-card" key={adv.id}>
                                            <div className="cam-card-top">
                                                <div
                                                    className="cam-avatar"
                                                    data-tone={toneForAdviser(adv)}
                                                    style={adv.avatar_url ? { backgroundImage: `url(${adv.avatar_url})` } : undefined}
                                                    aria-hidden="true"
                                                >
                                                    {adv.avatar_url ? '' : initialsOf(adv)}
                                                </div>
                                                <div className="cam-person-text" style={{ flex: 1 }}>
                                                    <div className="cam-person-name">
                                                        <UserClickableName userId={adv.auth_user_id} userName={fullNameOf(adv)} />
                                                    </div>
                                                    <div className="cam-person-meta">{adv.email}</div>
                                                </div>
                                                {adviserMenu(adv)}
                                            </div>

                                            <div className="cam-card-badges">
                                                <span className="cam-badge" data-tone={toneForAdviser(adv)}>{adviserTypeLabel(adv)}</span>
                                                {statusBadge(isActive)}
                                            </div>

                                            <div className="cam-card-grid">
                                                <div>
                                                    <div className="cam-card-field-label">Assigned Sections</div>
                                                    {sectionChips(`m-${adv.id}`, adv.assigned_sections)}
                                                </div>
                                                <div>
                                                    <div className="cam-card-field-label">Students</div>
                                                    <span className="cam-metric">{adv.students_count}</span>{' '}
                                                    <span className="cam-metric-sub">supervised</span>
                                                </div>
                                            </div>

                                            <div className="cam-card-actions">
                                                <button type="button" className="cam-btn cam-btn-sm" onClick={() => openAdviserDrawer(adv)}>
                                                    Details
                                                </button>
                                                <button type="button" className="cam-btn cam-btn-sm cam-btn-primary"
                                                    onClick={() => openAssignModal(undefined, adv)}>
                                                    Assign Section
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            /* Desktop / tablet: table */
                            <div className="cam-table-wrap">
                                <table className="cam-table">
                                    <caption className="cam-sr">
                                        Advisers with their course type, assigned sections, supervised student count and account status
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Adviser</th>
                                            <th scope="col">Course / Type</th>
                                            <th scope="col">Assigned Sections</th>
                                            <th scope="col">Students</th>
                                            <th scope="col">Status</th>
                                            <th scope="col" className="cam-col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedAdvisers.map(adv => {
                                            const isActive = adv.is_active !== false;
                                            return (
                                                <tr key={adv.id}>
                                                    <td>
                                                        <div className="cam-person">
                                                            <div
                                                                className="cam-avatar"
                                                                data-tone={toneForAdviser(adv)}
                                                                style={adv.avatar_url ? { backgroundImage: `url(${adv.avatar_url})` } : undefined}
                                                                aria-hidden="true"
                                                            >
                                                                {adv.avatar_url ? '' : initialsOf(adv)}
                                                            </div>
                                                            <div className="cam-person-text">
                                                                <div className="cam-person-name">
                                                                    <UserClickableName userId={adv.auth_user_id} userName={fullNameOf(adv)} />
                                                                </div>
                                                                <div className="cam-person-meta" title={adv.email || ''}>{adv.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="cam-badge" data-tone={toneForAdviser(adv)}>
                                                            {adviserTypeLabel(adv)}
                                                        </span>
                                                    </td>
                                                    <td>{sectionChips(adv.id, adv.assigned_sections)}</td>
                                                    <td>
                                                        <div className="cam-metric">{adv.students_count}</div>
                                                        <div className="cam-metric-sub">supervised</div>
                                                    </td>
                                                    <td>{statusBadge(isActive)}</td>
                                                    <td className="cam-col-actions">
                                                        <div className="cam-row-actions">
                                                            <button type="button" className="cam-btn cam-btn-sm"
                                                                onClick={() => openAdviserDrawer(adv)}>
                                                                Details
                                                            </button>
                                                            <button type="button" className="cam-btn cam-btn-sm cam-btn-primary"
                                                                onClick={() => openAssignModal(undefined, adv)}>
                                                                Assign Section
                                                            </button>
                                                            {adviserMenu(adv)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {!loading && paginatedAdvisers.length > 0 && (
                            <div style={{ padding: '0 1.15rem 1.15rem' }}>
                                <Pagination
                                    currentPage={advPage}
                                    totalPages={advTotalPages}
                                    totalItems={advTotalItems}
                                    itemsPerPage={advItemsPerPage}
                                    onPageChange={setAdvPage}
                                    itemName="advisers"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* ── SECTIONS TAB ── */}
                {activeTab === 'sections' && (
                    <div id="cam-panel-sections" role="tabpanel" aria-labelledby="cam-tab-sections">
                        {loading ? listSkeleton : paginatedSections.length === 0 ? (
                            <div className="cam-empty">
                                <div className="cam-empty-icon">{Icon.inbox()}</div>
                                <div className="cam-empty-title">
                                    {sections.length === 0 ? 'No sections available' : 'No sections match your filters'}
                                </div>
                                <p className="cam-empty-text">
                                    {sections.length === 0
                                        ? 'Create a section so students can be enrolled and an adviser assigned to supervise them.'
                                        : 'Try a different search term, or reset the filters to see every section.'}
                                </p>
                                <div className="cam-empty-actions">
                                    {sections.length === 0 ? (
                                        <button type="button" className="cam-btn cam-btn-primary" onClick={() => setShowSectionModal(true)}>
                                            {Icon.plus()} New Section
                                        </button>
                                    ) : hasSectionFilters && (
                                        <button type="button" className="cam-btn" onClick={clearFilters}>Reset filters</button>
                                    )}
                                </div>
                            </div>
                        ) : isNarrow ? (
                            /* Mobile: cards */
                            <div className="cam-cards">
                                {paginatedSections.map(sec => {
                                    const selected = selectedSectionIds.includes(sec.id);
                                    return (
                                        <article className="cam-card" key={sec.id} data-selected={selected}>
                                            <div className="cam-card-top">
                                                <input
                                                    type="checkbox"
                                                    className="cam-checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleSectionSelection(sec.id)}
                                                    aria-label={`Select section ${sec.name}`}
                                                    style={{ marginTop: 4 }}
                                                />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="cam-person-name" style={{ fontSize: '0.98rem' }}>{sec.name}</div>
                                                    <div className="cam-person-meta">
                                                        {COURSE_NAMES[sec.course_code] || sec.course_code} · {yearLabelOf(sec.name)}
                                                    </div>
                                                </div>
                                                {sectionMenu(sec)}
                                            </div>

                                            <div className="cam-card-badges">
                                                <span className="cam-badge" data-tone={toneForCourse(sec.course_code)}>{sec.course_code}</span>
                                                <span className="cam-badge" data-tone={sec.adviser_id ? 'ok' : 'warn'}>
                                                    <span className="cam-badge-dot" />
                                                    {sec.adviser_id ? 'Assigned' : 'No Adviser'}
                                                </span>
                                            </div>

                                            <div className="cam-card-grid">
                                                <div>
                                                    <div className="cam-card-field-label">Adviser</div>
                                                    {sec.adviser_name
                                                        ? <div className="cam-person-name" style={{ fontWeight: 600 }}>{sec.adviser_name}</div>
                                                        : <span className="cam-muted">Not yet assigned</span>}
                                                </div>
                                                <div>
                                                    <div className="cam-card-field-label">Students</div>
                                                    <span className="cam-metric">{sec.student_count}</span>{' '}
                                                    <span className="cam-metric-sub">enrolled</span>
                                                </div>
                                            </div>

                                            <div className="cam-card-actions">
                                                <button type="button" className="cam-btn cam-btn-sm" onClick={() => openSectionDrawer(sec)}>
                                                    View Students
                                                </button>
                                                <button type="button" className="cam-btn cam-btn-sm cam-btn-primary"
                                                    onClick={() => openAssignModal(sec)}>
                                                    {sec.adviser_id ? 'Change Adviser' : 'Assign Adviser'}
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            /* Desktop / tablet: table */
                            <div className="cam-table-wrap">
                                <table className="cam-table cam-table-sections">
                                    <caption className="cam-sr">
                                        Sections with their course, year level, assigned adviser, enrolled student count and assignment status
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" className="cam-col-check">
                                                <input
                                                    type="checkbox"
                                                    className="cam-checkbox"
                                                    checked={allFilteredSelected}
                                                    onChange={toggleSelectAll}
                                                    aria-label={`Select all ${filteredSections.length} listed sections`}
                                                    title={`Select all ${filteredSections.length} listed sections`}
                                                />
                                            </th>
                                            <th scope="col">Section</th>
                                            <th scope="col">Course</th>
                                            <th scope="col">Year Level</th>
                                            <th scope="col">Assigned Adviser</th>
                                            <th scope="col">Students</th>
                                            <th scope="col">Status</th>
                                            <th scope="col" className="cam-col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSections.map(sec => {
                                            const selected = selectedSectionIds.includes(sec.id);
                                            return (
                                                <tr key={sec.id} data-selected={selected}>
                                                    <td className="cam-col-check">
                                                        <input
                                                            type="checkbox"
                                                            className="cam-checkbox"
                                                            checked={selected}
                                                            onChange={() => toggleSectionSelection(sec.id)}
                                                            aria-label={`Select section ${sec.name}`}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div className="cam-person-name">{sec.name}</div>
                                                    </td>
                                                    <td>
                                                        <span className="cam-badge" data-tone={toneForCourse(sec.course_code)}>
                                                            {sec.course_code}
                                                        </span>
                                                        <div className="cam-metric-sub" style={{ marginTop: 2 }}>
                                                            {COURSE_NAMES[sec.course_code] || ''}
                                                        </div>
                                                    </td>
                                                    <td>{yearLabelOf(sec.name)}</td>
                                                    <td>
                                                        {sec.adviser_name ? (
                                                            <div className="cam-person-text">
                                                                <div className="cam-person-name" style={{ fontWeight: 600 }}>{sec.adviser_name}</div>
                                                                <div className="cam-person-meta">{sec.adviser_type}</div>
                                                            </div>
                                                        ) : (
                                                            <span className="cam-muted">Not yet assigned</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="cam-metric">{sec.student_count}</div>
                                                        <div className="cam-metric-sub">enrolled</div>
                                                    </td>
                                                    <td>
                                                        <span className="cam-badge" data-tone={sec.adviser_id ? 'ok' : 'warn'}>
                                                            <span className="cam-badge-dot" />
                                                            {sec.adviser_id ? 'Assigned' : 'No Adviser'}
                                                        </span>
                                                    </td>
                                                    <td className="cam-col-actions">
                                                        <div className="cam-row-actions">
                                                            <button type="button" className="cam-btn cam-btn-sm"
                                                                onClick={() => openSectionDrawer(sec)}>
                                                                View Students
                                                            </button>
                                                            <button type="button" className="cam-btn cam-btn-sm cam-btn-primary"
                                                                onClick={() => openAssignModal(sec)}>
                                                                {sec.adviser_id ? 'Change Adviser' : 'Assign Adviser'}
                                                            </button>
                                                            {sectionMenu(sec)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {!loading && paginatedSections.length > 0 && (
                            <div style={{ padding: '0 1.15rem 1.15rem' }}>
                                <Pagination
                                    currentPage={secPage}
                                    totalPages={secTotalPages}
                                    totalItems={secTotalItems}
                                    itemsPerPage={secItemsPerPage}
                                    onPageChange={setSecPage}
                                    itemName="sections"
                                />
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* ══ DIALOG: CREATE ADVISER ══ */}
            {showCreateModal && (
                <div className="cam-scrim" onMouseDown={() => setShowCreateModal(false)}>
                    <div
                        className="cam-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cam-create-title"
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div className="cam-dialog-head">
                            <div>
                                <h2 className="cam-dialog-title" id="cam-create-title">Add New Section Adviser</h2>
                                <p className="cam-dialog-sub">The adviser can sign in immediately and will appear in the list below.</p>
                            </div>
                            <button type="button" className="cam-dialog-close" onClick={() => setShowCreateModal(false)} aria-label="Close dialog">
                                {Icon.close()}
                            </button>
                        </div>

                        <form onSubmit={handleCreateAdviser} className="cam-dialog-form">
                            <div className="cam-dialog-body">
                                <div className="cam-form-row">
                                    <div>
                                        <label className="cam-field-label" htmlFor="cam-first-name">First Name *</label>
                                        <input id="cam-first-name" className="cam-input" type="text" required
                                            value={createFirstName} onChange={e => setCreateFirstName(e.target.value)}
                                            placeholder="e.g. Maria" />
                                    </div>
                                    <div>
                                        <label className="cam-field-label" htmlFor="cam-last-name">Last Name *</label>
                                        <input id="cam-last-name" className="cam-input" type="text" required
                                            value={createLastName} onChange={e => setCreateLastName(e.target.value)}
                                            placeholder="e.g. Santos" />
                                    </div>
                                </div>

                                <div className="cam-form-group">
                                    <label className="cam-field-label" htmlFor="cam-email">Email Address *</label>
                                    <input id="cam-email" className="cam-input" type="email" required
                                        value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                                        placeholder="e.g. msantos@asiancollege.edu.ph" />
                                </div>

                                <div className="cam-form-group">
                                    <span className="cam-field-label" id="cam-course-label">Course &amp; Adviser Type *</span>
                                    <div className="cam-choices" role="group" aria-labelledby="cam-course-label">
                                        <button type="button" className="cam-choice" data-tone="ht"
                                            aria-pressed={createCourse === 'DHT'} onClick={() => setCreateCourse('DHT')}>
                                            <div className="cam-choice-title">HT Adviser</div>
                                            <div className="cam-choice-sub">DHT — Hospitality</div>
                                        </button>
                                        <button type="button" className="cam-choice" data-tone="it"
                                            aria-pressed={createCourse === 'DIT'} onClick={() => setCreateCourse('DIT')}>
                                            <div className="cam-choice-title">IT Adviser</div>
                                            <div className="cam-choice-sub">DIT — Information Tech</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="cam-form-group" style={{ marginBottom: 0 }}>
                                    <label className="cam-field-label" htmlFor="cam-password">Temporary Password (Optional)</label>
                                    <input id="cam-password" className="cam-input" type="password"
                                        value={createPassword} onChange={e => setCreatePassword(e.target.value)}
                                        placeholder="Defaults to Adviser@12345" />
                                    <p className="cam-hint">The adviser should change this the first time they sign in.</p>
                                </div>

                                {error && (
                                    <div className="cam-note" data-tone="danger" role="alert" style={{ marginTop: '1rem' }}>
                                        {Icon.alert()} <span>{error}</span>
                                    </div>
                                )}
                            </div>

                            <div className="cam-dialog-foot">
                                <button type="button" className="cam-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" className="cam-btn cam-btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating…' : 'Create Adviser'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ DIALOG: ASSIGN / REASSIGN ══ */}
            {showAssignModal && (
                <div className="cam-scrim" onMouseDown={() => setShowAssignModal(false)}>
                    <div
                        className="cam-dialog cam-dialog-lg"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cam-assign-title"
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div className="cam-dialog-head">
                            <div>
                                <h2 className="cam-dialog-title" id="cam-assign-title">
                                    {assignMode === 'adviser'
                                        ? (activeAdviser ? `Assign Sections to ${fullNameOf(activeAdviser)}` : 'Assign Sections to Adviser')
                                        : assignMode === 'bulk'
                                            ? `Assign an Adviser to ${assignTargets.length} Section${assignTargets.length > 1 ? 's' : ''}`
                                            : activeSection?.adviser_id ? 'Change Section Adviser' : 'Assign Adviser to Section'}
                                </h2>
                                <p className="cam-dialog-sub">
                                    {assignMode === 'adviser'
                                        ? 'An adviser can handle any number of sections. Tick to assign, untick to remove.'
                                        : 'Only advisers whose course matches the section can be assigned.'}
                                </p>
                            </div>
                            <button type="button" className="cam-dialog-close" onClick={() => setShowAssignModal(false)} aria-label="Close dialog">
                                {Icon.close()}
                            </button>
                        </div>

                        <form onSubmit={handleAssignSection} className="cam-dialog-form">
                            <div className="cam-dialog-body">
                                {/* Section-first: which section */}
                                {assignMode === 'section' && (
                                    <div className="cam-form-group">
                                        <label className="cam-field-label" htmlFor="cam-target-section">Target Section *</label>
                                        <select
                                            id="cam-target-section"
                                            className="cam-input"
                                            value={assignSectionId}
                                            onChange={e => setAssignSectionId(e.target.value)}
                                            required
                                        >
                                            <option value="" disabled>Select Section</option>
                                            {sections.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} ({s.course_code}) — {s.student_count} Students {s.adviser_name ? `· Current: ${s.adviser_name}` : '· Unassigned'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Bulk: the sections being written to */}
                                {assignMode === 'bulk' && (
                                    <div className="cam-form-group">
                                        <span className="cam-field-label">Selected Sections ({assignTargets.length})</span>
                                        <div className="cam-chips">
                                            {assignTargets.map(s => <span key={s.id} className="cam-chip">{s.name}</span>)}
                                        </div>
                                    </div>
                                )}

                                {activeSection && (
                                    <div className="cam-note" data-tone="info" style={{ marginBottom: '1rem' }}>
                                        {Icon.alert()}
                                        <span>
                                            {activeSection.name} is a <strong>{activeSection.course_code}</strong> section with{' '}
                                            <strong>{activeSection.student_count}</strong> student{activeSection.student_count !== 1 ? 's' : ''}.
                                            Only <strong>{activeSection.course_code === 'DHT' ? 'HT Advisers' : 'IT Advisers'}</strong> are compatible.
                                        </span>
                                    </div>
                                )}

                                {mixedCourseTargets && (
                                    <div className="cam-note" data-tone="warn" style={{ marginBottom: '1rem' }}>
                                        {Icon.warn(16)}
                                        <span>
                                            The selected sections span {targetCourseCodes.join(' and ')}. An adviser handles one
                                            course, so assign each course's sections separately.
                                        </span>
                                    </div>
                                )}

                                {/* Adviser picker */}
                                <div className="cam-form-group">
                                    <label className="cam-field-label" htmlFor="cam-assign-adviser">
                                        Select {targetCourseCodes.length === 1
                                            ? (targetCourseCodes[0] === 'DHT' ? 'HT Adviser' : 'IT Adviser')
                                            : 'Adviser'} *
                                    </label>
                                    {compatibleAdvisers.length === 0 ? (
                                        <div className="cam-note" data-tone="danger">
                                            {Icon.alert()}
                                            <span>
                                                {mixedCourseTargets
                                                    ? 'No single adviser can handle sections from two different courses.'
                                                    : `No active ${targetCourseCodes[0] === 'DHT' ? 'HT Advisers' : 'IT Advisers'} available. Please create or activate one first.`}
                                            </span>
                                        </div>
                                    ) : (
                                        <select
                                            id="cam-assign-adviser"
                                            className="cam-input"
                                            value={assignAdviserId}
                                            onChange={e => setAssignAdviserId(e.target.value)}
                                            required
                                        >
                                            <option value="" disabled>Select Compatible Adviser</option>
                                            {compatibleAdvisers.map(a => (
                                                <option key={a.auth_user_id} value={a.auth_user_id}>
                                                    {fullNameOf(a)} ({adviserTypeLabel(a)}) — {a.sections_count} Section{a.sections_count !== 1 ? 's' : ''}, {a.students_count} Students
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {/* Adviser-first: multi-select section picker */}
                                {assignMode === 'adviser' && (
                                    <div className="cam-form-group" style={{ marginBottom: 0 }}>
                                        <span className="cam-field-label">
                                            Assigned Sections — {assignSectionIds.length} selected
                                        </span>

                                        {!assignAdviserId ? (
                                            <div className="cam-note" data-tone="info">
                                                {Icon.alert()} <span>Select an adviser first to see the sections they can handle.</span>
                                            </div>
                                        ) : compatibleSections.length === 0 ? (
                                            <div className="cam-note" data-tone="danger">
                                                {Icon.alert()} <span>No sections match this adviser's course. Create a section first.</span>
                                            </div>
                                        ) : (
                                            <div className="cam-picker">
                                                <div className="cam-picker-head">
                                                    <div className="cam-search" style={{ flex: 1, minWidth: 140 }}>
                                                        <span className="cam-search-icon">{Icon.search(14)}</span>
                                                        <label className="cam-sr" htmlFor="cam-picker-search">Search sections</label>
                                                        <input
                                                            id="cam-picker-search"
                                                            type="search"
                                                            placeholder="Search sections…"
                                                            value={assignSearch}
                                                            onChange={e => setAssignSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="cam-btn cam-btn-sm"
                                                        onClick={() => {
                                                            const ids = pickerSections.map(s => s.id);
                                                            const allOn = ids.every(id => assignSectionIds.includes(id));
                                                            setAssignSectionIds(prev => allOn
                                                                ? prev.filter(id => !ids.includes(id))
                                                                : Array.from(new Set([...prev, ...ids])));
                                                        }}
                                                    >
                                                        {pickerSections.every(s => assignSectionIds.includes(s.id))
                                                            ? 'Deselect all' : 'Select all'}
                                                    </button>
                                                </div>

                                                <div className="cam-picker-list">
                                                    {pickerSections.length === 0 ? (
                                                        <div style={{ padding: '1.25rem', textAlign: 'center' }} className="cam-muted">
                                                            No sections match “{assignSearch}”.
                                                        </div>
                                                    ) : pickerSections.map(s => {
                                                        const checked = assignSectionIds.includes(s.id);
                                                        const heldByOther = !!s.adviser_id && s.adviser_id !== assignAdviserId;
                                                        return (
                                                            <label key={s.id} className="cam-picker-option" data-checked={checked}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="cam-checkbox"
                                                                    checked={checked}
                                                                    onChange={() => toggleAssignSection(s.id)}
                                                                />
                                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                                    <span className="cam-picker-name">
                                                                        {s.name}
                                                                        <span className="cam-badge" data-tone={toneForCourse(s.course_code)}>
                                                                            {s.course_code}
                                                                        </span>
                                                                        {!s.adviser_id && (
                                                                            <span className="cam-badge" data-tone="warn">No adviser</span>
                                                                        )}
                                                                    </span>
                                                                    <span className="cam-picker-meta">
                                                                        {yearLabelOf(s.name)} · {s.student_count} student{s.student_count !== 1 ? 's' : ''}
                                                                        {heldByOther && (
                                                                            <>
                                                                                <br />
                                                                                <span className="cam-picker-warn">
                                                                                    Currently handled by {s.adviser_name} — ticking this reassigns it.
                                                                                </span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <p className="cam-hint">
                                            An adviser can handle any number of sections. Unticking a section removes that assignment.
                                        </p>
                                    </div>
                                )}

                                {activeSection?.adviser_id && (
                                    <div className="cam-note" data-tone="warn" style={{ marginTop: '1rem' }}>
                                        {Icon.warn(16)}
                                        <span>
                                            Reassigning transfers supervision of all <strong>{activeSection.student_count} students</strong> in {activeSection.name} to the new adviser.
                                        </span>
                                    </div>
                                )}

                                {error && (
                                    <div className="cam-note" data-tone="danger" role="alert" style={{ marginTop: '1rem' }}>
                                        {Icon.alert()} <span>{error}</span>
                                    </div>
                                )}
                            </div>

                            <div className="cam-dialog-foot">
                                {assignMode !== 'section' && (
                                    <span className="cam-dialog-foot-note">
                                        {assignMode === 'adviser'
                                            ? `${assignSectionIds.length} section${assignSectionIds.length !== 1 ? 's' : ''} selected`
                                            : `${assignTargets.length} section${assignTargets.length !== 1 ? 's' : ''} will be assigned`}
                                    </span>
                                )}
                                <button type="button" className="cam-btn" onClick={() => setShowAssignModal(false)}>Cancel</button>
                                <button
                                    type="submit"
                                    className="cam-btn cam-btn-primary"
                                    disabled={submitting || compatibleAdvisers.length === 0}
                                >
                                    {submitting
                                        ? 'Saving…'
                                        : assignMode === 'adviser'
                                            ? 'Save Assignments'
                                            : assignMode === 'bulk'
                                                ? 'Assign Sections'
                                                : activeSection?.adviser_id ? 'Confirm Reassignment' : 'Assign Adviser'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ DIALOG: CREATE SECTION ══ */}
            {showSectionModal && (
                <div className="cam-scrim" onMouseDown={() => setShowSectionModal(false)}>
                    <div
                        className="cam-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cam-section-title"
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ maxWidth: 460 }}
                    >
                        <div className="cam-dialog-head">
                            <div>
                                <h2 className="cam-dialog-title" id="cam-section-title">Create New Section</h2>
                                <p className="cam-dialog-sub">Use the COURSE-YEARLETTER format so year levels resolve correctly.</p>
                            </div>
                            <button type="button" className="cam-dialog-close" onClick={() => setShowSectionModal(false)} aria-label="Close dialog">
                                {Icon.close()}
                            </button>
                        </div>

                        <form onSubmit={handleCreateSection} className="cam-dialog-form">
                            <div className="cam-dialog-body">
                                <div className="cam-form-group">
                                    <label className="cam-field-label" htmlFor="cam-section-name">Section Name *</label>
                                    <input
                                        id="cam-section-name"
                                        className="cam-input"
                                        type="text"
                                        required
                                        placeholder="e.g. DHT-1D or DIT-2C"
                                        value={newSectionName}
                                        onChange={e => setNewSectionName(e.target.value.toUpperCase())}
                                    />
                                    <p className="cam-hint">
                                        {newSectionName && parseSectionName(newSectionName)
                                            ? `Reads as ${yearLabelOf(newSectionName)}, section ${parseSectionName(newSectionName)!.letter}.`
                                            : 'Example: DIT-2C is a 2nd Year Information Technology section.'}
                                    </p>
                                </div>

                                <div className="cam-form-group" style={{ marginBottom: 0 }}>
                                    <label className="cam-field-label" htmlFor="cam-section-course">Course *</label>
                                    <select
                                        id="cam-section-course"
                                        className="cam-input"
                                        value={newSectionCourse}
                                        onChange={e => setNewSectionCourse(e.target.value as 'DHT' | 'DIT')}
                                    >
                                        <option value="DHT">DHT — Diploma in Hospitality Technology</option>
                                        <option value="DIT">DIT — Diploma in Information Technology</option>
                                    </select>
                                </div>

                                {error && (
                                    <div className="cam-note" data-tone="danger" role="alert" style={{ marginTop: '1rem' }}>
                                        {Icon.alert()} <span>{error}</span>
                                    </div>
                                )}
                            </div>

                            <div className="cam-dialog-foot">
                                <button type="button" className="cam-btn" onClick={() => setShowSectionModal(false)}>Cancel</button>
                                <button type="submit" className="cam-btn cam-btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating…' : 'Create Section'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ DRAWER: ADVISER / SECTION DETAILS ══ */}
            {drawer && (
                <div className="cam-scrim cam-scrim-right" onMouseDown={() => setDrawer(null)}>
                    <div
                        className="cam-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cam-drawer-title"
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        {drawer.kind === 'adviser' ? (() => {
                            const adv = drawer.adviser;
                            const isActive = adv.is_active !== false;
                            return (
                                <>
                                    <div className="cam-dialog-head">
                                        <h2 className="cam-dialog-title" id="cam-drawer-title">Adviser Profile</h2>
                                        <button type="button" className="cam-dialog-close" onClick={() => setDrawer(null)} aria-label="Close details">
                                            {Icon.close()}
                                        </button>
                                    </div>

                                    <div className="cam-dialog-body">
                                        <div className="cam-drawer-profile">
                                            <div
                                                className="cam-avatar cam-avatar-lg"
                                                data-tone={toneForAdviser(adv)}
                                                style={adv.avatar_url ? { backgroundImage: `url(${adv.avatar_url})` } : undefined}
                                                aria-hidden="true"
                                            >
                                                {adv.avatar_url ? '' : initialsOf(adv)}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {fullNameOf(adv)}
                                                </div>
                                                <div className="cam-person-meta" style={{ maxWidth: '100%' }}>{adv.email}</div>
                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span className="cam-badge" data-tone={toneForAdviser(adv)}>{adviserTypeLabel(adv)}</span>
                                                    {statusBadge(isActive)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="cam-drawer-stats">
                                            <div className="cam-drawer-stat">
                                                <div className="cam-stat-label">Sections</div>
                                                <div className="cam-stat-value" style={{ fontSize: '1.4rem' }}>{adv.assigned_sections.length}</div>
                                                <div className="cam-stat-sub">assigned</div>
                                            </div>
                                            <div className="cam-drawer-stat">
                                                <div className="cam-stat-label">Students</div>
                                                <div className="cam-stat-value" style={{ fontSize: '1.4rem' }}>{adv.students_count}</div>
                                                <div className="cam-stat-sub">supervised</div>
                                            </div>
                                        </div>

                                        <div className="cam-section-title">
                                            Assigned Sections
                                            <span>{adv.assigned_sections.length}</span>
                                        </div>
                                        {adv.assigned_sections.length > 0 ? (
                                            <div className="cam-chips">
                                                {adv.assigned_sections.map(s => (
                                                    <span key={s.id} className="cam-chip">{s.name} · {s.course_code}</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="cam-muted">No sections currently assigned to this adviser.</p>
                                        )}

                                        <div className="cam-section-title">
                                            Students Supervised
                                            <span>{loadingRoster ? '…' : rosterStudents.length}</span>
                                        </div>
                                        {loadingRoster ? (
                                            <div className="cam-roster">
                                                {Array.from({ length: 3 }).map((_, i) => (
                                                    <div className="cam-roster-row" key={i}>
                                                        <div className="cam-skeleton" style={{ width: 30, height: 30, borderRadius: '50%' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div className="cam-skeleton" style={{ height: 9, width: '55%', marginBottom: 7 }} />
                                                            <div className="cam-skeleton" style={{ height: 8, width: '75%' }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : rosterStudents.length === 0 ? (
                                            <p className="cam-muted">No students are enrolled under this adviser's sections yet.</p>
                                        ) : (
                                            <div className="cam-roster">
                                                {rosterStudents.map(st => (
                                                    <div className="cam-roster-row" key={st.id}>
                                                        <div className="cam-avatar" style={{ width: 30, height: 30, fontSize: '0.72rem' }} aria-hidden="true">
                                                            {initialsOf(st)}
                                                        </div>
                                                        <div className="cam-roster-main">
                                                            <div className="cam-roster-name">{fullNameOf(st)}</div>
                                                            <div className="cam-roster-meta">
                                                                {st.section || '—'} · {st.company?.name || 'Not deployed'}
                                                            </div>
                                                        </div>
                                                        <span className="cam-badge" data-tone={st.is_active !== false ? 'ok' : 'warn'}>
                                                            {st.is_active !== false ? 'Active' : 'Pending'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="cam-dialog-foot">
                                        <button type="button" className="cam-btn"
                                            onClick={() => { setDrawer(null); setViewProfileId(adv.auth_user_id); }}>
                                            View Profile
                                        </button>
                                        <button type="button" className="cam-btn cam-btn-primary"
                                            onClick={() => { setDrawer(null); openAssignModal(undefined, adv); }}>
                                            Manage Sections
                                        </button>
                                    </div>
                                </>
                            );
                        })() : (() => {
                            const sec = drawer.section;
                            return (
                                <>
                                    <div className="cam-dialog-head">
                                        <div>
                                            <h2 className="cam-dialog-title" id="cam-drawer-title">Section {sec.name}</h2>
                                            <p className="cam-dialog-sub">
                                                {COURSE_NAMES[sec.course_code] || sec.course_code} · {yearLabelOf(sec.name)}
                                            </p>
                                        </div>
                                        <button type="button" className="cam-dialog-close" onClick={() => setDrawer(null)} aria-label="Close details">
                                            {Icon.close()}
                                        </button>
                                    </div>

                                    <div className="cam-dialog-body">
                                        <div className="cam-drawer-stats" style={{ marginTop: 0 }}>
                                            <div className="cam-drawer-stat">
                                                <div className="cam-stat-label">Students</div>
                                                <div className="cam-stat-value" style={{ fontSize: '1.4rem' }}>{sec.student_count}</div>
                                                <div className="cam-stat-sub">enrolled</div>
                                            </div>
                                            <div className="cam-drawer-stat">
                                                <div className="cam-stat-label">Status</div>
                                                <div style={{ marginTop: '0.45rem' }}>
                                                    <span className="cam-badge" data-tone={sec.adviser_id ? 'ok' : 'warn'}>
                                                        <span className="cam-badge-dot" />
                                                        {sec.adviser_id ? 'Assigned' : 'No Adviser'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="cam-section-title">Assigned Adviser</div>
                                        {sec.adviser_name ? (
                                            <div className="cam-roster">
                                                <div className="cam-roster-row">
                                                    <div className="cam-avatar" data-tone={toneForCourse(sec.course_code)}
                                                        style={{ width: 32, height: 32, fontSize: '0.75rem' }} aria-hidden="true">
                                                        {sec.adviser_name.trim()[0]?.toUpperCase() || 'A'}
                                                    </div>
                                                    <div className="cam-roster-main">
                                                        <div className="cam-roster-name">{sec.adviser_name}</div>
                                                        <div className="cam-roster-meta">{sec.adviser_email || sec.adviser_type}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="cam-note" data-tone="warn">
                                                {Icon.warn(16)}
                                                <span>This section has no adviser, so its students' accounts cannot be approved.</span>
                                            </div>
                                        )}

                                        <div className="cam-section-title">
                                            Enrolled Students
                                            <span>{loadingRoster ? '…' : rosterStudents.length}</span>
                                        </div>
                                        {loadingRoster ? (
                                            <div className="cam-roster">
                                                {Array.from({ length: 3 }).map((_, i) => (
                                                    <div className="cam-roster-row" key={i}>
                                                        <div className="cam-skeleton" style={{ width: 30, height: 30, borderRadius: '50%' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div className="cam-skeleton" style={{ height: 9, width: '55%', marginBottom: 7 }} />
                                                            <div className="cam-skeleton" style={{ height: 8, width: '75%' }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : rosterStudents.length === 0 ? (
                                            <p className="cam-muted">No students are enrolled in this section yet.</p>
                                        ) : (
                                            <div className="cam-roster">
                                                {rosterStudents.map(st => (
                                                    <div className="cam-roster-row" key={st.id}>
                                                        <div className="cam-avatar" style={{ width: 30, height: 30, fontSize: '0.72rem' }} aria-hidden="true">
                                                            {initialsOf(st)}
                                                        </div>
                                                        <div className="cam-roster-main">
                                                            <div className="cam-roster-name">{fullNameOf(st)}</div>
                                                            <div className="cam-roster-meta">{st.company?.name || 'Not deployed'}</div>
                                                        </div>
                                                        <span className="cam-badge" data-tone={st.is_active !== false ? 'ok' : 'warn'}>
                                                            {st.is_active !== false ? 'Active' : 'Pending'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="cam-dialog-foot">
                                        {sec.adviser_id && (
                                            <button type="button" className="cam-btn cam-btn-danger"
                                                onClick={() => { setDrawer(null); handleRemoveAssignment(sec); }}>
                                                Remove Adviser
                                            </button>
                                        )}
                                        <button type="button" className="cam-btn cam-btn-primary"
                                            onClick={() => { setDrawer(null); openAssignModal(sec); }}>
                                            {sec.adviser_id ? 'Change Adviser' : 'Assign Adviser'}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Profile modal (shared portal component) */}
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

import React, { useEffect, useRef, useState } from 'react';
import { adviserService, type Section } from '../services/adviserService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import {
    SECTION_LETTERS,
    SECTION_YEARS,
    buildSectionName,
    ordinalYearLabel,
    parseSectionName,
    validateNewSectionName,
} from '../utils/sections';
import { yearLevelService } from '../services/yearLevelService';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

interface AdviserSectionsViewProps {
    onSelectSection?: (sectionName: string) => void;
    /** The adviser's course family, for the sections they may create. */
    course: 'DHT' | 'DIT';
    /** Lets the dashboard refresh the "My Sections" badge after a create. */
    onActionComplete?: () => void;
}

const COURSE_NAMES: Record<'DHT' | 'DIT', string> = {
    DHT: 'Diploma in Hospitality Technology',
    DIT: 'Diploma in Information Technology',
};

/** Sections whose name is not COURSE-YEARLETTER (coordinator-created / free text). */
const UNASSIGNED_YEAR = 0;

/** The letter chips in the Add Section dialog. */
const letterChipStyle = (selected: boolean, taken: boolean): React.CSSProperties => ({
    minWidth: 40,
    padding: '0.45rem 0.6rem',
    borderRadius: 8,
    border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
    background: selected ? 'var(--primary)' : taken ? 'var(--bg-elevated)' : 'var(--bg-page)',
    color: selected ? '#ffffff' : taken ? 'var(--text-dim)' : 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: taken ? 'not-allowed' : 'pointer',
    textDecoration: taken ? 'line-through' : undefined,
    opacity: taken ? 0.6 : 1,
});

/**
 * Years the programme actually runs, so their cards stand even at zero sections.
 * 4th Year is offered by the Add Section dialog but is noise for most advisers,
 * so it only appears once one of its sections exists.
 */
const ALWAYS_SHOWN_YEARS = [1, 2, 3] as const;

/** Book glyph on a section row. */
const BookIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
);

/** Chevron pointing into the next level. */
const ChevronIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

/** Calendar glyph on a year card. */
const CalendarIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
);

const AdviserSectionsView: React.FC<AdviserSectionsViewProps> = ({ onSelectSection, course, onActionComplete }) => {
    const [sections, setSections] = useState<Section[]>([]);
    const [loading, setLoading] = useState(true);
    const [sectionsError, setSectionsError] = useState<string | null>(null);
    const [selectedSection, setSelectedSection] = useState<Section | null>(null);
    const [sectionStudents, setSectionStudents] = useState<Profile[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [studentsError, setStudentsError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    /** Which year level's sections are open. null = the year-level landing grid. */
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    /** Active year levels the adviser may create a section in. Defaults to the
     *  constants so Add Section works before the catalog fetch resolves. */
    const [activeYears, setActiveYears] = useState<number[]>([...SECTION_YEARS]);
    /** The section whose roster is currently being awaited. */
    const pendingSectionId = useRef<string | null>(null);

    // Add Section dialog. The course is fixed to the adviser's own, so only the
    // year and letter are chosen here.
    const [showAddModal, setShowAddModal] = useState(false);
    const [newYear, setNewYear] = useState<number>(1);
    /** Letters ticked in the A–J chips. */
    const [selectedLetters, setSelectedLetters] = useState<string[]>([]);
    /** Free-typed letters, for cohorts past the A–J the chips offer. */
    const [otherLetters, setOtherLetters] = useState<string>('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // The chips and the free-text box are two ways into one set of letters, so a
    // single create can cover a whole year's worth of sections.
    const chosenLetters = [...new Set([...selectedLetters, ...otherLetters])].sort();
    const newSectionNames = chosenLetters.map(letter => buildSectionName(course, newYear, letter));

    /**
     * Letters the adviser already holds in `year`. Only their own sections are
     * known here, so a name held by another adviser still reaches the server —
     * which refuses it, and says to ask the Coordinator.
     */
    const takenLettersFor = (year: number): Set<string> => {
        const letters = new Set<string>();
        for (const sec of sections) {
            const parsed = parseSectionName(sec.name);
            if (parsed && parsed.year === year) letters.add(parsed.letter);
        }
        return letters;
    };

    const takenLetters = takenLettersFor(newYear);

    /** The first chip letter not already taken in `year`, if any is left. */
    const firstFreeLetter = (year: number): string | null => {
        const taken = takenLettersFor(year);
        return SECTION_LETTERS.find(letter => !taken.has(letter)) ?? null;
    };

    const toggleLetter = (letter: string) => {
        setCreateError(null);
        setSelectedLetters(prev => (
            prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
        ));
    };

    // The dialog's two selects. `.ad-dialog__textarea` is sized for a textarea,
    // and no adviser stylesheet carries a select rule, so these match the inline
    // field styling this view already uses for its roster search input.
    const selectStyle: React.CSSProperties = {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.6rem 0.75rem',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-page)',
        color: 'var(--text-primary)',
        fontFamily: 'inherit',
        fontSize: '0.88rem',
    };

    useEffect(() => {
        loadSections();
        // Active levels drive the Add Section year select and its validation.
        // Fall back to the constants on failure so adding never breaks.
        yearLevelService.list(true)
            .then(active => {
                const nums = active.map(l => l.year_number);
                if (nums.length > 0) setActiveYears(nums);
            })
            .catch(err => console.error('Falling back to default year levels:', err));
    }, []);

    const loadSections = async () => {
        setLoading(true);
        setSectionsError(null);
        try {
            const data = await adviserService.getMySections();
            setSections(data);
            // Nothing is selected on load: the adviser lands on the year-level grid,
            // so fetching a roster here would be a query for a screen nobody sees.
            setSelectedSection(null);
            setSectionStudents([]);
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

    /**
     * Sections bucketed by the year encoded in their name. A section carries no
     * year column — parseSectionName is the single decoder, and it returns null
     * for the free-text names a coordinator may create, which land in
     * UNASSIGNED_YEAR rather than being dropped.
     *
     * Derived on every render rather than mirrored into state, so the re-read in
     * handleCreateSection cannot leave the two out of step.
     */
    const sectionsByYear = sections.reduce<Record<number, Section[]>>((acc, sec) => {
        const year = parseSectionName(sec.name)?.year ?? UNASSIGNED_YEAR;
        (acc[year] ||= []).push(sec);
        return acc;
    }, {});

    // 1st–3rd Year always stand (even empty). Any higher year is shown once it
    // holds at least one section — an empty 4th (or 5th…) is noise, but a
    // populated year must always appear, even after its catalog level is
    // deactivated (matching never reads the catalog). Free-text names bucket
    // into Other / Unassigned.
    const populatedHigherYears = Object.keys(sectionsByYear)
        .map(Number)
        .filter(year => year > ALWAYS_SHOWN_YEARS.length && sectionsByYear[year]?.length)
        .sort((a, b) => a - b);

    const visibleYears: number[] = [
        ...ALWAYS_SHOWN_YEARS,
        ...populatedHigherYears,
        ...(sectionsByYear[UNASSIGNED_YEAR]?.length ? [UNASSIGNED_YEAR] : []),
    ];

    const yearLabel = (year: number) => (
        year === UNASSIGNED_YEAR ? 'Other / Unassigned' : ordinalYearLabel(year)
    );

    /** Drops any selection, and any roster still in flight for it. */
    const clearSelection = () => {
        pendingSectionId.current = null;
        setSelectedSection(null);
        setSectionStudents([]);
        setStudentsError(null);
        setSearchTerm('');
    };

    // Each level opens on its own list: a year shows its sections, and the roster
    // is only fetched once the adviser picks one of them.
    const openYear = (year: number) => {
        setSelectedYear(year);
        clearSelection();
    };

    const closeYear = () => {
        setSelectedYear(null);
        clearSelection();
    };

    const closeSection = () => {
        clearSelection();
    };

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

    const openAddModal = () => {
        setCreateError(null);
        // Compose for the year the adviser is looking at, and open on a letter
        // they do not already hold — landing on a dead option is the whole
        // reason adding felt blocked.
        // Compose for the year in view when it is a real, still-active level;
        // otherwise the first active level, so the select never opens on a year
        // that is not offered.
        const inView = selectedYear !== null && selectedYear !== UNASSIGNED_YEAR && activeYears.includes(selectedYear);
        const year = inView ? selectedYear : (activeYears[0] ?? 1);
        const free = firstFreeLetter(year);
        setNewYear(year);
        setSelectedLetters(free ? [free] : []);
        setOtherLetters('');
        setShowAddModal(true);
    };

    const handleCreateSection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (chosenLetters.length === 0) {
            setCreateError('Choose at least one section letter.');
            return;
        }

        for (const name of newSectionNames) {
            const problem = validateNewSectionName(name, course, activeYears);
            if (problem) { setCreateError(problem); return; }

            // The chips already disable the letters this adviser holds, but a typed
            // one can still collide — say so here rather than after a round trip.
            if (sections.some(sec => sec.name.trim().toUpperCase() === name)) {
                setCreateError(`You already have section ${name}.`);
                return;
            }
        }

        setCreating(true);
        setCreateError(null);

        // One section per call, because each is its own transaction server-side.
        // A name that collides must not cost the adviser the rest of the batch.
        const created: Section[] = [];
        const failures: string[] = [];
        for (const name of newSectionNames) {
            try {
                created.push(await adviserService.createSection(name));
            } catch (err) {
                console.error(`Failed to create section ${name}:`, err);
                failures.push(`${name} — ${err instanceof Error ? err.message : 'could not be created'}`);
            }
        }

        try {
            if (created.length > 0) {
                showSuccess(created.length === 1
                    ? `Section ${created[0].name} created and assigned to you.`
                    : `${created.length} sections created and assigned to you: ${created.map(s => s.name).join(', ')}.`);
                // Re-read once for the whole batch: the counts and the assignments
                // both come from the server.
                const data = await adviserService.getMySections();
                setSections(data);
                onActionComplete?.();

                // Only navigate on a clean run — a partial one keeps the dialog up
                // so the adviser can see which names did not land.
                if (failures.length === 0) {
                    setShowAddModal(false);
                    const fresh = data.find(s => s.id === created[0].id);
                    if (fresh) {
                        // Open the year the new section landed in, read off the name
                        // the server normalised rather than the year in the dialog.
                        setSelectedYear(parseSectionName(fresh.name)?.year ?? UNASSIGNED_YEAR);
                        loadSectionStudents(fresh);
                    }
                }
            }

            if (failures.length > 0) {
                setCreateError(failures.join(' · '));
                // Drop what did land, so a retry does not re-attempt it.
                const made = new Set(created.map(s => parseSectionName(s.name)?.letter));
                setSelectedLetters(prev => prev.filter(l => !made.has(l)));
                setOtherLetters(prev => [...prev].filter(l => !made.has(l)).join(''));
            }
        } finally {
            setCreating(false);
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

    // Declared once because a first-time adviser reaches it from the empty state
    // below, and everyone else from the header further down.
    const addSectionDialog = showAddModal && (
        <div className="modal-overlay" onClick={() => !creating && setShowAddModal(false)}>
            <div
                className="ad-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ad-dialog-title"
                aria-describedby="ad-dialog-subtitle"
                onClick={e => e.stopPropagation()}
            >
                <div className="ad-dialog__header">
                    <div>
                        <h3 className="ad-dialog__title" id="ad-dialog-title">Add a Section</h3>
                        <p className="ad-dialog__subtitle" id="ad-dialog-subtitle">
                            The section is created in your course and assigned to you. Students join it by
                            selecting it during onboarding.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="ad-dialog__close"
                        aria-label="Close"
                        onClick={() => setShowAddModal(false)}
                        disabled={creating}
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleCreateSection}>
                    <div className="ad-dialog__body">
                        <span className="ad-dialog__group-label">Section Details</span>

                        <div className="ad-dialog__field">
                            {/* Display-only: the server derives the course from the
                                adviser's own profile and refuses anything else. */}
                            <span className="ad-dialog__label">Course</span>
                            <p className="ad-dialog__hint">
                                {course} — {COURSE_NAMES[course]}
                            </p>
                        </div>

                        <div className="ad-dialog__field">
                            <label className="ad-dialog__label" htmlFor="ad-section-year">Year Level</label>
                            <select
                                id="ad-section-year"
                                style={selectStyle}
                                value={newYear}
                                onChange={e => {
                                    const year = Number(e.target.value);
                                    setNewYear(year);
                                    // A letter free in one year may be taken in another;
                                    // drop those rather than leave a dead selection.
                                    const taken = takenLettersFor(year);
                                    setSelectedLetters(prev => prev.filter(l => !taken.has(l)));
                                }}
                                disabled={creating}
                            >
                                {activeYears.map(y => (
                                    <option key={y} value={y}>{ordinalYearLabel(y)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="ad-dialog__field">
                            <span className="ad-dialog__label" id="ad-section-letters-label">
                                Section Letters
                                <span className="ad-dialog__hint">Pick as many as you need</span>
                            </span>
                            <div
                                role="group"
                                aria-labelledby="ad-section-letters-label"
                                style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}
                            >
                                {SECTION_LETTERS.map(letter => {
                                    const taken = takenLetters.has(letter);
                                    const selected = selectedLetters.includes(letter);
                                    return (
                                        <button
                                            key={letter}
                                            type="button"
                                            onClick={() => toggleLetter(letter)}
                                            disabled={taken || creating}
                                            aria-pressed={selected}
                                            aria-label={taken
                                                ? `${letter}, already added`
                                                : `Section letter ${letter}`}
                                            title={taken
                                                ? `You already have ${buildSectionName(course, newYear, letter)}`
                                                : undefined}
                                            style={letterChipStyle(selected, taken)}
                                        >
                                            {letter}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="ad-dialog__field">
                            <label className="ad-dialog__label" htmlFor="ad-section-other-letters">
                                Other Letters
                                <span className="ad-dialog__hint">Optional</span>
                            </label>
                            <input
                                id="ad-section-other-letters"
                                type="text"
                                style={selectStyle}
                                value={otherLetters}
                                onChange={e => setOtherLetters(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                                placeholder="K or KLM"
                                autoComplete="off"
                                disabled={creating}
                            />
                            <p className="ad-dialog__hint">
                                For cohorts past J. Type the letters together, one character each.
                            </p>
                        </div>

                        <p className="ad-dialog__hint">
                            {chosenLetters.length === 0 ? (
                                'Choose at least one letter to name the sections.'
                            ) : chosenLetters.length === 1 ? (
                                <>This creates section <strong>{newSectionNames[0]}</strong>.</>
                            ) : (
                                <>This creates {chosenLetters.length} sections: <strong>{newSectionNames.join(', ')}</strong>.</>
                            )}
                        </p>

                        {createError && (
                            <div className="ad-dialog__error" role="alert">
                                <span aria-hidden="true">⚠</span>
                                <span>{createError}</span>
                            </div>
                        )}
                    </div>

                    <div className="ad-dialog__footer">
                        <button
                            type="button"
                            className="ad-dialog__btn ad-dialog__btn--secondary"
                            onClick={() => setShowAddModal(false)}
                            disabled={creating}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="ad-dialog__btn ad-dialog__btn--primary"
                            disabled={creating}
                        >
                            {creating ? (
                                <>
                                    <span className="ad-dialog__spinner" aria-hidden="true" />
                                    Adding…
                                </>
                            ) : chosenLetters.length > 1 ? `Add ${chosenLetters.length} Sections` : 'Add Section'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

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
            <>
                <div className="admin-table-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}></div>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>No Sections Assigned</h3>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 1.25rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        You currently don't have any sections assigned to you. Add your first section below, or if
                        it already exists, please contact the SIL Coordinator.
                    </p>
                    <button className="cd-btn cd-btn-primary" onClick={openAddModal}>Add Section</button>
                </div>
                {addSectionDialog}
            </>
        );
    }

    return (
        <div className="fade-in">
            {successMessage && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    borderRadius: 8,
                    marginBottom: '1rem',
                    fontWeight: 500
                }} role="status">
                    {successMessage}
                </div>
            )}

            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                        My Assigned Sections
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {selectedYear === null ? (
                            <>
                                {sections.length} section{sections.length !== 1 ? 's' : ''} assigned to you, across{' '}
                                {visibleYears.length} year level{visibleYears.length !== 1 ? 's' : ''}. Select a year
                                level to see its sections.
                            </>
                        ) : selectedSection === null ? (
                            <>
                                {(sectionsByYear[selectedYear] ?? []).length} section
                                {(sectionsByYear[selectedYear] ?? []).length !== 1 ? 's' : ''} in {yearLabel(selectedYear)}.
                                Select one to view its student roster.
                            </>
                        ) : (
                            <>Section {selectedSection.name}, {yearLabel(selectedYear)}.</>
                        )}
                    </div>
                </div>
                {/* Creating only makes sense once a year is open: that is the level
                    the new section joins, and the year grid is a summary. */}
                {selectedYear !== null && selectedSection === null && (
                    <button className="cd-btn cd-btn-primary" onClick={openAddModal}>Add Section</button>
                )}
            </div>

            {selectedYear === null ? (
                /* Year-level landing grid. A section's year lives in its name, so
                   the counts here are summed from the same cards shown one level
                   down — nothing is fetched to build this. */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
                    gap: '1rem'
                }}>
                    {visibleYears.map(year => {
                        const yearSections = sectionsByYear[year] ?? [];
                        const students = yearSections.reduce((sum, s) => sum + (s.student_count ?? 0), 0);
                        const label = yearLabel(year);
                        return (
                            <div
                                key={year}
                                className="glass-card glass-card--interactive"
                                role="button"
                                tabIndex={0}
                                aria-label={`${label}, ${yearSections.length} sections, ${students} students`}
                                onClick={() => openYear(year)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openYear(year);
                                    }
                                }}
                                style={{
                                    padding: '1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    flexShrink: 0,
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    color: '#3b82f6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <CalendarIcon />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.1rem', color: 'var(--text-bright)' }}>
                                        {label}
                                    </h3>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        {yearSections.length} Section{yearSections.length !== 1 ? 's' : ''}
                                        {' • '}
                                        {students} Student{students !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                <ChevronIcon />
                            </div>
                        );
                    })}
                </div>
            ) : selectedSection === null ? (
                <>
                    <button
                        type="button"
                        onClick={closeYear}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            width: 'max-content',
                            marginBottom: '1rem'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        Back to Years
                    </button>

                    <div style={{ marginBottom: '1rem' }}>
                        <h2 style={{ margin: '0 0 0.2rem 0', color: 'var(--primary)', fontSize: '1.35rem' }}>
                            {yearLabel(selectedYear)}
                        </h2>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {(sectionsByYear[selectedYear] ?? []).length} section
                            {(sectionsByYear[selectedYear] ?? []).length !== 1 ? 's' : ''}
                        </div>
                    </div>

                    {(sectionsByYear[selectedYear] ?? []).length === 0 ? (
                        <div className="admin-table-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--text-primary)' }}>
                                No sections in {yearLabel(selectedYear)}
                            </h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                                You have no {yearLabel(selectedYear)} sections yet. Use Add Section to create one.
                            </p>
                        </div>
                    ) : (
                        /* Section rows, the same shape as the year cards one level
                           up. Picking one is what fetches its roster. */
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
                            gap: '1rem'
                        }}>
                            {(sectionsByYear[selectedYear] ?? []).map(sec => {
                                const students = sec.student_count ?? 0;
                                return (
                                    <div
                                        key={sec.id}
                                        className="glass-card glass-card--interactive"
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Section ${sec.name}, ${students} students`}
                                        onClick={() => loadSectionStudents(sec)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                loadSectionStudents(sec);
                                            }
                                        }}
                                        style={{
                                            padding: '1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 12,
                                            flexShrink: 0,
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: 'var(--primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <BookIcon />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.1rem', color: 'var(--text-bright)', fontWeight: 700 }}>
                                                Section {sec.name}
                                            </h3>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {students} student{students !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <ChevronIcon />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                <button
                    type="button"
                    onClick={closeSection}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        width: 'max-content',
                        marginBottom: '1rem'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                    Back to Sections
                </button>
            )}

            {/* Selected Section Student Roster Table. Left outside the year branch
                because `selectedSection` is nulled on every navigation, so it can
                only ever be set while a year is open. */}
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
                                    <th>SIL Company</th>
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

            {addSectionDialog}
        </div>
    );
};

export default AdviserSectionsView;

# CODING-AGENT PROMPT — Organize the Adviser's "My Assigned Sections" by Year Level

> Hand this whole document to the coding agent. Everything marked **[CONFIRMED]** was read from the
> repository at `C:\Users\stewa\monitoring-system`. Nothing here is invented. Items the repository
> could not settle are marked **[UNCONFIRMED]** and must be checked, not guessed.

---

## 1. CONTEXT

You are changing **one view, presentation only**: the Adviser's *My Sections* page
(`src/components/AdviserSectionsView.tsx`) in the Asian College SIL Monitoring System
(React 19 + TypeScript + Vite + React Router + Supabase, one dashboard component per role, view
state driven off the URL path).

Today that page renders **every assigned section as one flat grid of cards** — an adviser holding
eight sections (`DIT-1A, 1B, 1C, 1F, 2A, 2B, 3F, 3G`) sees eight cards in one undifferentiated
block, with no way to tell year levels apart.

**The requested change:** organize *My Assigned Sections* **by year level**, using the
**drill-down pattern that already exists in `src/components/GradesView.tsx`** — year cards first
(`1st Year`, `2nd Year`, `3rd Year`, each showing `N Sections • N Students` with a calendar icon and
a chevron), then that year's section cards after the adviser picks one, with a **Back to Years**
link.

**Scope boundary — do not exceed it.**

* This is a **frontend presentation change inside one component**. No SQL, no RPC, no service
  method, no new table, no RLS change, no new route, no new npm package, no new CSS file.
* `adviserService.getMySections()` is unchanged and still returns the same flat `Section[]`. The
  grouping happens in the component, from data it already has.
* The roster table, the search box, `Full Monitoring View →`, `Add Section`, `UserProfileModal`,
  the loading skeleton and the two error/empty early returns all keep their current behaviour.
* Do **not** touch `GradesView.tsx`, the Coordinator views, or any other role's dashboard.

---

## 2. CURRENT IMPLEMENTATION [CONFIRMED]

### 2.1 `src/components/AdviserSectionsView.tsx` (552 lines — read all of it)

Props today:

```ts
interface AdviserSectionsViewProps {
    onSelectSection?: (sectionName: string) => void;
    course: 'DHT' | 'DIT';          // the adviser's own course family
    onActionComplete?: () => void;  // refreshes the sidebar "My Sections" badge
}
```

State today: `sections`, `loading`, `sectionsError`, `selectedSection`, `sectionStudents`,
`loadingStudents`, `studentsError`, `searchTerm`, `viewProfileId`,
`pendingSectionId = useRef<string|null>`, plus the Add-Section dialog state
(`showAddModal`, `newYear`, `newLetter`, `creating`, `createError`, `successMessage`).

Flow today:

| Step | Code |
|---|---|
| mount | `useEffect(() => { loadSections(); }, [])` |
| load | `loadSections()` → `adviserService.getMySections()`; **auto-selects `data[0]` and loads its roster** (line ~80) |
| pick | card `onClick` / `onKeyDown` (Enter + Space) → `loadSectionStudents(sec)` |
| race guard | `pendingSectionId.current = sec.id` — a slow earlier roster response is discarded so it can never land on top of a newer one (lines 94–115). **Keep this ref and its three guards exactly as they are.** |
| create | `handleCreateSection` → `adviserService.createSection(name)` → re-read `getMySections()` → `loadSectionStudents(fresh)` → `onActionComplete?.()` |

Three early returns, **in this order, each with a distinct meaning** (lines 277–317):

1. `loading` → `.admin-table-card` + `<TableSkeleton rows={4} cols={3} />`
2. `sectionsError` → *"Could not load your sections"* + **Try Again**
   (deliberately never rendered as "no sections")
3. `sections.length === 0` → *"No Sections Assigned"* + **Add Section**

The flat card grid it renders today (lines 349–408) is an **inline style object**, not a class:

```tsx
<div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem'
}}>
  {sections.map(sec => (
    <div className="section-card" role="button" tabIndex={0} aria-pressed={isSelected}
         onClick={…} onKeyDown={…} style={{ borderColor / boxShadow / background when selected }}>
      <div className="section-card-header">
        <div className="section-card-title">{sec.name}</div>
        <div className="section-card-meta">{isDHT ? 'Hospitality Tech' : 'Information Tech'}</div>
        <span className={`adviser-course-pill ${isDHT ? 'adviser-course-dht' : 'adviser-course-dit'}`}>
          {sec.course_code}
        </span>
      </div>
      <div className="section-card-count">{sec.student_count ?? 0}</div>  …"Students Enrolled"
      <div className="section-card-footer">{isSelected ? '✓ Currently Selected' : 'View Section →'}</div>
    </div>
  ))}
</div>
```

Imports already present at the top of the file (do not re-import):

```ts
import { adviserService, type Section } from '../services/adviserService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import { SECTION_LETTERS, SECTION_YEARS, YEAR_LEVELS, buildSectionName, validateNewSectionName } from '../utils/sections';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';
```

**`YEAR_LEVELS` is already imported.** `parseSectionName` is **not** — you will add it to that same
import statement.

### 2.2 The data you are grouping [CONFIRMED — `src/services/adviserService.ts`]

```ts
export interface Section {
    id: string;
    name: string;                    // "DIT-3A"
    course_code: 'DHT' | 'DIT';
    department_id?: string | null;
    created_at: string;
    student_count?: number;          // true enrolled count, from the RPC
    adviser_id?: string | null;
    adviser_name?: string | null;
    adviser_type?: string | null;
}
```

`getMySections()` calls `rpc('get_adviser_sections')`, maps the rows, and **sorts by
`a.name.localeCompare(b.name)`** — so `DIT-1A, DIT-1B, DIT-1C, DIT-1F, DIT-2A, DIT-2B, DIT-3F,
DIT-3G` arrives already in year-then-letter order. Do not re-sort the underlying array; sort only
inside each group if you need to.

**There is no `year_level` column on a section.** The year lives *inside the name*. The only
supported way to extract it is `parseSectionName` from `src/utils/sections.ts`:

```ts
// src/utils/sections.ts  [CONFIRMED]
export const YEAR_LEVELS   = ['1st Year','2nd Year','3rd Year','4th Year'] as const;
export const SECTION_YEARS = [1,2,3,4] as const;
export const SECTION_LETTERS = ['A','B','C','D','E','F','G','H','I','J'] as const;

parseSectionName('DIT-3A')  // { courseCode:'DIT', year:3, letter:'A' }
parseSectionName('Grade 12 Block 2')  // null  ← coordinator-created / free-text names
```

`parseSectionName` matches `^([A-Z0-9]{2,10})-(\d)([A-Z])$` and **returns `null` for anything else**.
Coordinator-created sections are not required to follow that grammar, so **a null result is a real
case you must handle**, not a defensive nicety.

**Do not modify `src/utils/sections.ts`.** It is mirrored by `public.canonical_section_name` in SQL
and is depended on by student onboarding, the coordinator roster matching and the adviser
create-section validator.

### 2.3 The pattern you are copying [CONFIRMED — `src/components/GradesView.tsx`]

This is the second screenshot. `GradesView` is a **three-level drill-down**: Courses → Years →
Sections → roster, with `selectedCourse` / `selectedYear` / `selectedGroupKey` state. Its **Level 2
(Years)** block, lines 244–323, is exactly the visual you are reproducing:

```tsx
// LEVEL 2: YEARS  — GradesView.tsx:244–323
<div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
  <button onClick={() => setSelectedCourse(null)} style={{ /* transparent, var(--text-muted), 0.9rem, 600 */ }}>
    <svg …><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
    Back to Courses
  </button>

  <h2 style={{ color: 'var(--primary)', fontSize: '1.5rem' }}>{selectedCourse}</h2>

  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'1.5rem' }}>
    {allYears.map(year => (
      <div className="glass-card hoverable-card" onClick={() => setSelectedYear(year)}
           style={{ padding:'1.5rem', display:'flex', alignItems:'center', gap:'1rem',
                    border:'1px solid var(--border)', transition:'all 0.2s ease' }}
           onMouseOver={…border-color…} onMouseOut={…}>
        <div style={{ width:48, height:48, borderRadius:12,
                      background:'rgba(59, 130, 246, 0.1)', color:'#3b82f6', display:'flex', … }}>
          <svg width="24" height="24" …><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/></svg>   {/* calendar */}
        </div>
        <div>
          <h3 style={{ fontSize:'1.2rem', color:'var(--text-bright)' }}>{year}</h3>
          <div style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>
            {yearGroups.length} Section{…} • {totalStudents} Student{…}
          </div>
        </div>
        <svg … style={{ marginLeft:'auto', color:'var(--text-muted)' }}>
          <polyline points="9 18 15 12 9 6"/>   {/* chevron right */}
        </svg>
      </div>
    ))}
  </div>
</div>
```

Two things in that block are **defects you must not copy** [CONFIRMED]:

* **`hoverable-card` has no CSS rule anywhere in the repository.** `grep -r "hoverable" src/` returns
  only these four usages in `GradesView.tsx` and zero stylesheet definitions. It is a dead class.
* The inline `onMouseOver` / `onMouseOut` border-colour handlers duplicate, in JS, what
  `.glass-card--interactive` already does in CSS. `src/index.css` (lines 655–681) is explicit:

  ```
  *  - Cards that ARE clickable opt into `.glass-card--interactive` below and get
  *    one calm step of background + shadow. The border never moves.
  ```

  Use `className="glass-card glass-card--interactive"` and **no mouse handlers**.

### 2.4 Styles available to this file [CONFIRMED]

`AdviserSectionsView.tsx` imports **both** `./CoordinatorDashboard.css` and `./AdviserDashboard.css`
(lines 13–14), and `src/index.css` is global. So all of these are already in scope — **use them, add
none**:

| Class | Defined in | Line |
|---|---|---|
| `.section-card`, `-header`, `-title`, `-meta`, `-count`, `-footer` | `AdviserDashboard.css` | 280–334 |
| `.ad-sections-grid` (`repeat(auto-fill, minmax(190px,1fr))`, `gap .6rem`) | `AdviserDashboard.css` | 274–278 |
| `.adviser-course-pill`, `.adviser-course-dht`, `.adviser-course-dit` | `AdviserDashboard.css` | 37 |
| `.ad-dialog*`, `.modal-overlay` | `AdviserDashboard.css` / shared | — |
| `.view-container`, `.view-header`, `.view-title`, `.view-subtitle` | `CoordinatorDashboard.css` | 545–572 |
| `.glass-card`, `.glass-card--interactive` | `index.css` | 664–681 |
| `.admin-table-card`, `.admin-table-header`, `.admin-table-title`, `.admin-table`, `.cd-btn`, `.cd-btn-primary`, `.fade-in` | shared | — |
| dark-mode overrides for `.section-card-title`, `.section-card-count`, `.view-title` | `index.css` | 252–254 |

`.section-card*` and `.ad-sections-grid` are used by **this file only** — `grep` confirms no other
component references them — so reusing them here carries no cross-view risk.

---

## 3. FILES YOU WILL TOUCH

| Path | What you do |
|---|---|
| `src/components/AdviserSectionsView.tsx` | **The only file you edit.** Add year-level grouping + drill-down. |

**Files you must NOT change**, even if it looks convenient:
`src/utils/sections.ts`, `src/services/adviserService.ts`, `src/components/AdviserDashboard.tsx`,
`src/components/AdviserDashboard.css`, `src/components/CoordinatorDashboard.css`,
`src/index.css`, `src/components/GradesView.tsx`, every SQL file, every other component.

If you believe a CSS rule is missing, express it with an inline style object in this component —
that is already the established convention in this file and in `GradesView` — rather than editing a
shared stylesheet.

---

## 4. ARCHITECTURE — how this view is wired [CONFIRMED]

```
App.tsx  Route "/adviser/*"   (role === 'adviser')
  └─ AdviserDashboard.tsx           currentView from location.pathname
       │   type View = 'overview' | 'sections' | 'students' | … ;  viewTitles.sections = 'My Assigned Sections'
       │   sidebar: { id:'sections', label:'My Sections', badge: stats?.mySectionsCount }
       └─ currentView === 'sections' →
            <AdviserSectionsView
                onSelectSection={(secName) => navigateTo('students', secName)}
                course={course as 'DHT' | 'DIT'}
                onActionComplete={refreshStats} />
                  ├─ adviserService.getMySections()      → rpc('get_adviser_sections')        [read]
                  ├─ adviserService.getSectionStudents() → rpc('get_adviser_section_students')[read]
                  └─ adviserService.createSection()      → rpc('adviser_create_section')      [write]
```

**Nothing above this component changes.** `AdviserDashboard` passes the same three props; the `View`
union, the sidebar badge, `viewTitles` and `App.tsx` routing are untouched. The drill-down level is
**local component state**, not a route and not a URL segment — consistent with how `GradesView`
does it.

---

## 5. DATA FLOW (after your change)

```
mount → adviserService.getMySections()            (unchanged call, unchanged response)
      → sections: Section[]  e.g. [DIT-1A(3), DIT-1B(2), DIT-1C(1), DIT-1F(1), DIT-2A(1), DIT-2B(0), DIT-3F(2), DIT-3G(2)]
      → group in the component, no network:
            parseSectionName(sec.name)?.year   →  1 | 2 | 3 | 4 | null
            null → the "Other / Unassigned" bucket
      → render YEAR CARDS (selectedYear === null):
            1st Year   4 Sections • 7 Students
            2nd Year   2 Sections • 1 Student
            3rd Year   2 Sections • 4 Students
      → adviser clicks "2nd Year"  →  setSelectedYear(2)   [no fetch]
      → render that year's SECTION CARDS + auto-select the first one
            → loadSectionStudents(firstSectionOfYear)   ← the ONLY network call this step makes
      → roster table renders below, exactly as today
      → "← Back to Years" → setSelectedYear(null); clear selectedSection / roster / searchTerm
```

**The only thing that changes about data is where it is displayed.** No query is added, removed,
re-ordered or re-shaped.

---

## 6. DATABASE CONTEXT [CONFIRMED]

You are touching **no** database object. For reference only, so you do not reach for one:

* `public.sections (id, name UNIQUE, course_code CHECK IN ('DHT','DIT'), department_id, created_at)` —
  **no year column.** The year is encoded in `name`.
* `public.adviser_sections (adviser_id, section_id UNIQUE, assigned_by, status, assigned_at)` — one
  adviser per section, any number of sections per adviser.
* `get_adviser_sections()` returns `id, name, course_code, department_id, created_at, assigned_at,
  student_count` for the calling adviser's active sections.

**Do not add a `year_level` column to `sections`, do not alter the RPC to return a year, and do not
add a new RPC.** The name already carries the year and `parseSectionName` already decodes it.

---

## 7. ROLE CONTEXT

| Role | Effect |
|---|---|
| **Adviser** | The only role affected. *My Sections* becomes Year → Sections → roster. Permissions, data access and every action on the page are unchanged. |
| **Coordinator / Admin / Student / Company** | **Zero change.** They do not render `AdviserSectionsView`. `GradesView` (the pattern source) is untouched. |

No authorization surface moves. `get_adviser_sections` already returns only the caller's own
sections, server-side; grouping them client-side neither adds nor removes visibility.

---

## 8. REQUESTED CHANGE — implement exactly this

All of it inside `src/components/AdviserSectionsView.tsx`.

### 8.1 Extend the existing import

```ts
import {
    SECTION_LETTERS,
    SECTION_YEARS,
    YEAR_LEVELS,
    buildSectionName,
    parseSectionName,          // ← add this one only
    validateNewSectionName,
} from '../utils/sections';
```

### 8.2 Add one piece of state

```ts
/** Which year level's sections are open. null = the year-level landing grid. */
const [selectedYear, setSelectedYear] = useState<number | null>(null);
```

`number | null`, where the number is the year **1–4**, and a separate sentinel for unparseable
names. Use a module-level constant rather than a magic number:

```ts
/** Sections whose name is not COURSE-YEARLETTER (coordinator-created / free text). */
const UNASSIGNED_YEAR = 0;
```

### 8.3 Group the sections — derived, not stored

Compute during render from `sections`. Do **not** add a `useEffect` that mirrors `sections` into a
second state variable; that is how the two drift apart after `handleCreateSection` re-reads.

```ts
/**
 * Sections bucketed by the year encoded in their name. A section carries no year
 * column — parseSectionName is the single decoder, and it returns null for the
 * free-text names a coordinator may create, which land in UNASSIGNED_YEAR.
 */
const sectionsByYear = sections.reduce<Record<number, Section[]>>((acc, sec) => {
    const year = parseSectionName(sec.name)?.year ?? UNASSIGNED_YEAR;
    (acc[year] ||= []).push(sec);
    return acc;
}, {});
```

`getMySections()` already sorts by name, so each bucket is in letter order. Do not re-sort.

### 8.4 Decide which year cards render

**Confirmed product decision — implement exactly this:**

* **1st Year, 2nd Year and 3rd Year always render**, even with zero sections (they read
  `0 Sections • 0 Students`). These are the years the programme actually runs.
* **4th Year renders only when it holds at least one section.** `SECTION_YEARS` is `[1,2,3,4]` and
  the Add-Section dialog can still create a `-4x` section, so the card must appear the moment one
  exists — but an empty 4th Year is noise for every adviser and must not be shown.
* **"Other / Unassigned"** renders only when `sectionsByYear[UNASSIGNED_YEAR]` is non-empty, and
  always sorts **last**.

```ts
/** Years 1–3 are always offered; 4 and the unassigned bucket only when populated. */
const ALWAYS_SHOWN_YEARS = [1, 2, 3] as const;

const visibleYears: number[] = [
    ...ALWAYS_SHOWN_YEARS,
    ...(sectionsByYear[4]?.length ? [4] : []),
    ...(sectionsByYear[UNASSIGNED_YEAR]?.length ? [UNASSIGNED_YEAR] : []),
];
```

Label with the existing constant — **do not hard-code the strings**:
`year === UNASSIGNED_YEAR ? 'Other / Unassigned' : YEAR_LEVELS[year - 1]`.

### 8.5 Year-level landing grid (`selectedYear === null`)

Replace the current flat `sections.map(...)` grid **and** the roster block below it with the year
grid. Keep the existing page header (`My Assigned Sections` + the `{n} sections assigned to you`
line + the `Add Section` button) above it — change only the subtitle sentence, per §8.9.

Structure, matching `GradesView`'s Level 2 but with its two defects fixed:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
  {visibleYears.map(year => {
    const yearSections = sectionsByYear[year] ?? [];
    const students = yearSections.reduce((sum, s) => sum + (s.student_count ?? 0), 0);
    return (
      <div
        key={year}
        className="glass-card glass-card--interactive"   /* NOT "hoverable-card" */
        role="button"
        tabIndex={0}
        aria-label={`${label}, ${yearSections.length} sections, ${students} students`}
        onClick={() => openYear(year)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openYear(year); } }}
        style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* the same calendar svg as GradesView.tsx:299–304 */}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.1rem', color: 'var(--text-bright)' }}>{label}</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {yearSections.length} Section{yearSections.length !== 1 ? 's' : ''}
            {' • '}
            {students} Student{students !== 1 ? 's' : ''}
          </div>
        </div>
        {/* chevron-right svg, marginLeft:'auto', color:'var(--text-muted)' — GradesView.tsx:314–316 */}
      </div>
    );
  })}
</div>
```

Two deliberate improvements over the copied pattern — keep both:

* **`role="button"` + `tabIndex={0}` + Enter/Space `onKeyDown`.** The existing `.section-card`
  in this very file is already keyboard-operable that way (lines 359–371); `GradesView`'s cards are
  not, and a bare clickable `<div>` here would be a regression against this file's own standard.
* **No `onMouseOver` / `onMouseOut`.** `.glass-card--interactive` handles hover in CSS.

### 8.6 The year's sections (`selectedYear !== null`)

Above the section grid, render the back link — the same markup and left-arrow SVG as
`GradesView.tsx:247–260`, with the label **`Back to Years`**:

```tsx
<button
  type="button"
  onClick={closeYear}
  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'transparent',
           border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0,
           fontWeight: 600, fontSize: '0.9rem', width: 'max-content' }}
>
  {/* left-arrow svg — GradesView.tsx:255–258 */}
  Back to Years
</button>
```

Then a heading identifying the open year — `YEAR_LEVELS[selectedYear - 1]` (or
`Other / Unassigned`) with the section count beneath it — then **the existing section-card grid,
unchanged in every respect except that it maps `sectionsByYear[selectedYear]` instead of
`sections`**. Keep `.section-card`, all five child classes, the course pill, the student count, the
`✓ Currently Selected` / `View Section →` footer, `aria-pressed`, the Enter/Space handler and the
selected-state inline styles **byte-for-byte as they are today**.

Below it, the roster block renders exactly as it does now.

**A year with zero sections** (only reachable for 1st–3rd Year) shows a short empty panel in the
established voice, and no roster:

> **No sections in {label}**
> You have no {label} sections yet. Use **Add Section** to create one.

Reuse the `.admin-table-card` + centred-padding shape the file already uses for its empty states
(lines 466–472); invent no new panel.

### 8.7 Selection lifecycle — the part most likely to break

The current `loadSections()` auto-selects `data[0]` on mount (line ~80). **That must stop**, because
on mount the adviser is now looking at year cards, and loading a roster nobody can see is a wasted
query whose response would also prime `pendingSectionId`.

```ts
const openYear = (year: number) => {
    setSelectedYear(year);
    const first = (sectionsByYear[year] ?? [])[0];
    if (first) {
        loadSectionStudents(first);          // keeps the roster-on-screen behaviour, one level down
    } else {
        pendingSectionId.current = null;     // nothing in flight may land
        setSelectedSection(null);
        setSectionStudents([]);
        setStudentsError(null);
        setSearchTerm('');
    }
};

const closeYear = () => {
    setSelectedYear(null);
    pendingSectionId.current = null;         // discard any roster still in flight
    setSelectedSection(null);
    setSectionStudents([]);
    setStudentsError(null);
    setSearchTerm('');
};
```

Required, precisely:

* In `loadSections()`, **delete the `if (data.length > 0) loadSectionStudents(data[0])` branch** and
  keep the `else` branch's reset (`setSelectedSection(null); setSectionStudents([])`) as the
  unconditional behaviour. `loadSections()` must not select anything.
* **`pendingSectionId`, `loadSectionStudents` and their three `if (pendingSectionId.current !== sec.id) return;`
  guards stay exactly as written.** Setting the ref to `null` on navigation is an addition, never a
  replacement — it is what stops a roster fetched for the previous year from rendering after the
  adviser has moved on.
* `searchTerm` is cleared on every navigation (`loadSectionStudents` already clears it when a section
  is picked — keep that too), so a filter never survives into a section it was not typed for.

### 8.8 `handleCreateSection` must land the adviser on the new section

After a successful create the view currently re-reads and selects the new section. Preserve that,
and open the year it belongs to, so the adviser sees what they just made rather than a year grid:

```ts
const data = await adviserService.getMySections();
setSections(data);
const fresh = data.find(s => s.id === created.id);
if (fresh) {
    setSelectedYear(parseSectionName(fresh.name)?.year ?? UNASSIGNED_YEAR);
    loadSectionStudents(fresh);
}
onActionComplete?.();
```

`newYear` in the dialog is the year the adviser chose, but read the year back off the **created
section's name** as above — the server normalises the name and is the authority on it.

### 8.9 Copy changes — these three lines only

| Where | Now | After |
|---|---|---|
| Header subtitle, year grid | `{n} sections assigned to you. Select one to view its student roster.` | `{n} section{s} assigned to you, across {v} year level{s}. Select a year level to see its sections.` |
| Header subtitle, inside a year | — | `{n} section{s} in {label}. Select one to view its student roster.` |
| Empty state (`sections.length === 0`) | unchanged | **unchanged** — keep *"No Sections Assigned"* and its Add Section button exactly as they are |

Keep the module's voice: plain sentences, no exclamation marks, *"SIL/OJT Coordinator"* and
*"Section Adviser"* capitalised as they already are in this file, and the existing
`{n !== 1 ? 's' : ''}` pluralisation idiom.

### 8.10 Untouched inside this same file

The Add-Section dialog (`addSectionDialog`, lines 166–275) and every `.ad-dialog*` class; the
`loading` and `sectionsError` early returns; the `sections.length === 0` empty state; the success
banner; the roster table markup, its search input, its three empty/error branches,
`Full Monitoring View →` and `onSelectSection`; `UserProfileModal` and `viewProfileId`;
`TableSkeleton`; the `fade-in` wrapper.

---

## 9. EXPECTED BEHAVIOUR

**Adviser with the eight sections in the screenshot** (`DIT-1A/1B/1C/1F/2A/2B/3F/3G`):

* Opening *My Sections* shows **three year cards** and no roster:
  `1st Year — 4 Sections • 7 Students`, `2nd Year — 2 Sections • 1 Student`,
  `3rd Year — 2 Sections • 4 Students`. No 4th Year card (they hold none). No network call beyond
  the single `getMySections()`.
* Clicking **1st Year** → `← Back to Years`, an `1st Year` heading, the four familiar
  `.section-card`s (`DIT-1A`, `1B`, `1C`, `1F`) with `DIT-1A` selected, and its 3-student roster
  below — identical to today's cards, just filtered.
* Clicking another card in that year swaps the roster, as today.
* **Back to Years** returns to the year grid; nothing is selected and no roster shows.
* `Full Monitoring View →` still navigates to *My Students* filtered to the section.
* **Add Section** works from the year grid and from inside a year; creating `DIT-4A` closes the
  dialog, opens **4th Year** with `DIT-4A` selected, and the 4th Year card now exists on the way
  back out. The sidebar *My Sections* badge still increments.

**Adviser holding only `DIT-2A`:** three year cards
(`1st Year — 0 Sections • 0 Students`, `2nd Year — 1 Section • N Students`, `3rd Year — 0 …`).
Opening 1st Year shows the *No sections in 1st Year* panel and an *Add Section* route out.

**Brand-new adviser (zero sections):** unchanged — the *No Sections Assigned* panel with its
**Add Section** button. **No year grid is rendered in this case.**

**Failed load:** unchanged — *"Could not load your sections"* + **Try Again**. Never a year grid,
never an empty state, never a create button.

**A coordinator-created free-text section** (e.g. `Grade 12 Block 2`): an *Other / Unassigned* card
appears last; opening it lists that section normally. It is never silently dropped.

---

## 10. UI / UX

Follow the existing visual language; introduce no new pattern and no new stylesheet.

* **Year cards:** `glass-card glass-card--interactive`, ~`1.25rem` padding, a 44 px
  `rgba(59,130,246,0.1)` / `#3b82f6` rounded icon tile with the calendar glyph, title at `1.1rem`
  `var(--text-bright)`, meta at `0.8rem` `var(--text-muted)`, chevron pushed right with
  `marginLeft:'auto'`. Grid `repeat(auto-fill, minmax(min(100%, 280px), 1fr))`, `gap: 1rem`.
* **Section cards inside a year:** unchanged `.section-card` markup and its existing
  `repeat(auto-fit, minmax(min(100%, 240px), 1fr))` grid.
* Compact, information-dense, minimalist — this project's stated direction. **No gradients, no
  glassmorphism beyond the existing `.glass-card`, no emoji, no illustrations, no giant headings,
  no animation** beyond the `fade-in` already on the wrapper and the CSS hover step.
* Every colour is a token (`var(--text-bright)`, `var(--text-muted)`, `var(--border)`,
  `var(--primary)`, `var(--bg-card)`, `var(--bg-elevated)`). The two literals above
  (`rgba(59,130,246,0.1)` / `#3b82f6`) are copied verbatim from the pattern being matched — do not
  introduce any others.
* **Dark mode:** `index.css:252–254` already overrides `.section-card-title`, `.section-card-count`
  and `.view-title`; `.glass-card` is token-based. Verify both themes; restyle nothing.
* **Responsive:** `min(100%, 280px)` keeps year cards single-column on a phone. Verify at ~390 px
  that nothing scrolls horizontally and the meta line does not clip (`minWidth: 0` on the text
  block).
* **Accessibility:** year cards are `role="button"` + `tabIndex={0}` + Enter/Space, with an
  `aria-label` carrying the counts (the visual meta line uses a `•` that screen readers announce
  poorly). The back control is a real `<button type="button">`. Focus is visible on both.

---

## 11. SECURITY

* **No security surface changes.** Grouping is pure presentation over data the server already
  scoped: `get_adviser_sections()` is `SECURITY DEFINER` and returns only `auth.uid()`'s own active
  sections; `get_adviser_section_students(uuid)` **raises** when the caller is not entitled to that
  section, which is what keeps "no students" and "not allowed" distinguishable.
* Do **not** add any client-side filter that could be mistaken for authorization, and do not alter
  the error handling that surfaces the RPC's authorization message
  (`asError` → `err instanceof Error ? err.message : …`).
* Add no RLS policy, no grant, no RPC, no table column.
* Hiding an empty 4th Year card is a display decision, not a permission — a 4th-year section that
  exists is always reachable.

---

## 12. EDGE CASES

1. **Section name not `COURSE-YEARLETTER`** → `parseSectionName` returns `null` → the
   *Other / Unassigned* bucket, rendered last, only when non-empty. Never dropped, never crashed on.
2. **`student_count` is `undefined`** (`Section.student_count` is optional; the fallback path may
   omit it) → `?? 0` in the per-year sum, exactly as the card already does.
3. **Zero sections overall** → the existing *No Sections Assigned* early return wins; no year grid.
4. **A year with zero sections** (1st–3rd only) → the empty panel from §8.6; no roster, no crash on
   `sectionsByYear[year][0]`.
5. **Only 4th-year sections** → 1st/2nd/3rd render as `0 Sections`, and 4th Year renders because it
   is populated. The adviser is not stranded.
6. **Creating a section in a year that is currently open** → the `getMySections()` re-read reflows
   the group; the new card appears in place and is selected.
7. **Creating a 4th-year section** → the 4th Year card exists on the next render of the grid because
   `visibleYears` is derived, not stored.
8. **Rapid year switching while a roster is loading** → `pendingSectionId` (unchanged) discards the
   stale response; `closeYear` / the empty-year branch null the ref so nothing lands after
   navigation.
9. **Roster error inside a year** → the existing *Roster Unavailable* + **Try Again** branch, which
   still retries the same section. **Back to Years** must remain usable while it is showing.
10. **An adviser holding both DHT and DIT sections** [UNCONFIRMED — the
    `trg_validate_adviser_course_assignment` trigger normally prevents it] → group **by year only**,
    never by course. The existing per-card `.adviser-course-pill` continues to distinguish them, so
    this case degrades gracefully without a second drill-down level.
11. **A very large number of sections in one year** → the grid already wraps; add no pagination
    (the roster table's `usePagination` is a different concern and is not in this view).

---

## 13. REGRESSION PROTECTION — must remain true afterwards

* `adviserService.getMySections`, `getSectionStudents`, `createSection` and every RPC
  (`get_adviser_sections`, `get_adviser_section_students`, `adviser_create_section`) are **byte-identical**.
* `src/utils/sections.ts` is unmodified: `SECTION_LETTERS`, `YEAR_LEVELS`, `SECTION_YEARS`,
  `parseSectionName`, `buildSectionName`, `canonicalSectionName`, `studentMatchesSection`,
  `buildSectionOptions`, `validateNewSectionName`. Student onboarding, coordinator roster matching
  and `public.canonical_section_name` all depend on them.
* The three early returns keep their **order and meaning**: `loading` → skeleton;
  `sectionsError` → *Could not load your sections* + Try Again; `sections.length === 0` →
  *No Sections Assigned* + Add Section. A failed query still never renders as an empty state or a
  year grid.
* `pendingSectionId` and its three guards still prevent a stale roster from landing.
* The `.section-card` markup, its five child classes, the course pill, `aria-pressed`, the
  Enter/Space handler and the selected-state styling are unchanged.
* The roster table (columns, `UserProfileModal`, `TableSkeleton`, search filter over name/email/id,
  the *No Students Found* / no-match / error branches) is unchanged.
* The Add-Section dialog, `validateNewSectionName` usage, the audit log, the coordinator
  notification and `onActionComplete` → `refreshStats` all still fire, and the sidebar
  *My Sections* badge still updates.
* `AdviserDashboard.tsx` is untouched: the `View` union, sidebar, badges, `viewTitles`, the
  onboarding gate, `App.tsx` routing.
* No CSS file is edited, no new dependency, no new component/hook/context/service file, no file
  renamed, no unrelated reformatting, and `GradesView.tsx` is not modified.

---

## 14. IMPLEMENTATION CONSTRAINTS

* **Read in full before writing anything:** `src/components/AdviserSectionsView.tsx`,
  `src/utils/sections.ts`, `src/components/GradesView.tsx` **lines 126–330** (the grouping reduce and
  the Level-1/2/3 blocks), `src/components/AdviserDashboard.css` **lines 260–340**, and
  `src/index.css` **lines 640–690**.
* Mirror this file's own conventions: **4-space indentation**, `React.FC<Props>`, `useState` at the
  top, handlers as `const fn = async (…) => {}`, inline style objects for one-off layout, and
  comments that explain **why** rather than what — the file's existing comments (the
  `pendingSectionId` note, the `selectStyle` note, the "Declared once because…" note) set the
  register. Match it.
* TypeScript strict: **no `any`, no non-null assertions, no `@ts-ignore`**. `Section` is used as
  declared and not widened.
* Derive `sectionsByYear` and `visibleYears` during render. **Do not** add a `useEffect` that copies
  `sections` into another state variable, and do not memoize prematurely — this is at most a few
  dozen rows.
* Do not rename existing identifiers, do not reorder existing functions, do not reformat untouched
  lines, and do not refactor anything you were not asked to change.
* **[UNCONFIRMED] — verify, don't assume:** whether any section name in this environment falls
  outside `COURSE-YEARLETTER` (which determines whether the *Other / Unassigned* bucket is ever
  seen); and whether `.glass-card--interactive` reads correctly against `--bg-elevated` in **both**
  themes on this page, since `GradesView` never used it. Check both in the running app and report
  what you find rather than adapting silently.

---

## 15. VERIFICATION — do all of these before reporting done

**Build / static**

* `npx tsc -b` (or `npm run build`) passes with no new errors, including no unused-import or
  unused-variable warning left by the removed auto-select branch.
* `npx eslint src/components/AdviserSectionsView.tsx` reports nothing new.
* `git diff --stat` shows **exactly one changed file**. If it shows more, revert the rest.
* Grep: zero new references to `hoverable-card`; zero `onMouseOver` / `onMouseOut` added; zero new
  `from('sections')` or `rpc(` calls anywhere in the diff.

**UI — signed in as an adviser holding sections across several years**

* Landing shows only year cards; counts per year equal the sum of that year's card counts, and the
  grand total equals the header's `{n} sections`.
* Years 1–3 always present; 4th Year absent until a `-4x` section exists; *Other / Unassigned* absent
  unless a non-conforming name exists.
* Open a year → back link + heading + that year's `.section-card`s + the first one selected + its
  roster. Counts and the course pill match what the flat list showed before the change.
* Roster search filters within the selected section only; switching sections clears it.
* `Full Monitoring View →` still lands on *My Students* filtered to that section.
* **Back to Years** clears the selection and the roster; re-entering the year re-selects its first
  section and re-fetches cleanly.
* Switch years rapidly while a roster is loading → the roster shown always belongs to the visible
  section (this is the `pendingSectionId` regression test — run it deliberately, with the network
  throttled).

**UI — the other states**

* Adviser with **zero** sections → *No Sections Assigned* + Add Section. No year grid.
* Adviser with sections in only one year → the other always-shown years read `0 Sections • 0 Students`
  and open to the empty panel.
* Force the load to fail (throttle/offline, or temporarily break the RPC name locally and revert) →
  *Could not load your sections* + **Try Again**, never a year grid.
* **Add Section** from the year grid → creates → the dialog closes, the correct year opens, the new
  section is selected, its roster reads *"There are currently no students enrolled in …"*, and the
  sidebar badge increments. Repeat from inside a year.
* Create a **4th-year** section → 4th Year opens with it selected, and the 4th Year card is present
  on the way back out.

**Cross-cutting**

* Light **and** dark mode on both levels.
* ~390 px width: year cards stack one per row, no horizontal scroll, the `N Sections • N Students`
  line does not clip.
* Keyboard only: Tab to a year card, Enter and Space both open it; Tab to **Back to Years**, Enter
  returns; Tab to a section card, Enter/Space selects it. Focus is visible throughout.
* Sign in as a **coordinator** and open *Student Grades by Section* → `GradesView`'s
  Courses → Years → Sections drill-down is completely unchanged.

---

### One-line summary for the agent

In `src/components/AdviserSectionsView.tsx` only, bucket the adviser's sections by the year decoded
from their names with `parseSectionName`, render a year-level landing grid (1st–3rd Year always;
4th Year and *Other / Unassigned* only when populated) in the `glass-card glass-card--interactive`
style of `GradesView`'s Level-2 block, drill into a year to show that year's existing
`.section-card`s and roster with a **Back to Years** link, stop auto-selecting `sections[0]` on
mount, and change no service, RPC, table, stylesheet or other component.

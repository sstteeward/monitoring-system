# CODING-AGENT PROMPT — Simplify the Adviser's Attendance Monitoring page

> Hand this whole document to the coding agent. Everything marked **[CONFIRMED]** was read from the
> repository at `C:\Users\stewa\monitoring-system`. Nothing here is invented. Items the repository
> could not settle are marked **[UNCONFIRMED]** and must be checked, not guessed.

---

## 1. CONTEXT

You are simplifying **one view, presentation only**: the Adviser's *Attendance Monitoring* page
(`src/components/AdviserAttendanceView.tsx`) in the Asian College SIL Monitoring System
(React 19 + TypeScript + Vite + React Router + Supabase; one dashboard component per role; view
state driven off the URL path).

Today the page stacks **four bands** on top of each other: a toolbar, a five-card KPI row, the roster
table, and an analytics strip at the bottom. The KPI row and the analytics strip report **the same
numbers twice** — `Present / Late / Absent / Incomplete` as cards at the top, then
`Attendance Rate / Absences / Late Arrivals / Average Hours / Incomplete Logs / Not Yet Recorded`
as a strip at the bottom — so an adviser reads eleven figures for what is, in the screenshot, a
three-student section.

**The requested change, exactly:**

1. **Collapse the two summaries into one compact strip placed above the table.** The five KPI cards
   are deleted; the existing analytics strip absorbs the counts they carried and moves up.
2. **Remove the Export CSV button** (and its `exportCsv` function and download icon).
3. **Fix the invalid loading skeleton** in both loading states — `<tr>` elements are currently
   rendered outside any `<table>`.

**Scope boundary — do not exceed it.**

* **Navigation is not changing.** The Section `<select>`, the date input and the `‹ / Today / ›`
  group stay where they are and work exactly as they do now. Do **not** introduce a year-level
  drill-down, section cards, tabs, chips, a rail, or any other new way of choosing a section on this
  page. This was decided deliberately: attendance is a page an adviser opens every day, and any
  landing screen puts a click in front of the data.
* **Everything in the roster table stays**: the search box, the status-filter dropdown, the
  **SIL Progress** column, the per-row **View** button and its detail modal, the anomaly flag chip,
  and the pagination footer. All unchanged.
* **Refresh stays.** It is how an adviser picks up a record a supervisor entered minutes ago, and the
  two error states reuse it.
* This is a **frontend presentation change**. No SQL, no RPC, no service method, no new table, no RLS
  change, no new route, no new npm package, no new stylesheet, no new component file.
* `attendanceService.getAdviserAttendance()` and `adviserService.getMySections()` are unchanged and
  still return the same shapes. No query is added, removed, re-ordered or re-shaped.
* Do **not** touch `AdminAttendanceView.tsx`, `CompanyAttendanceView.tsx`,
  `CoordinatorAttendanceView.tsx`, `attendanceConstants.ts`, or any other role's dashboard.

---

## 2. CURRENT IMPLEMENTATION [CONFIRMED]

### 2.1 `src/components/AdviserAttendanceView.tsx` — 549 lines, read all of it

The component takes **no props**. `AdviserDashboard` renders it bare:

```tsx
// src/components/AdviserDashboard.tsx:417–419  [CONFIRMED]
{currentView === 'attendance' && (
    <AdviserAttendanceView />
)}
```

Imports at the top of the file (lines 1–19) — do not re-import any of these:

```ts
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { attendanceService, type AttendanceStatus, type AdviserAttendanceRow } from '../services/attendanceService';
import { adviserService, type Section } from '../services/adviserService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableRowSkeleton } from './Skeletons';
import AttendanceDetailModal from './AttendanceDetailModal';
import {
    ATTENDANCE_STATUS_CONFIG, formatTime, formatHours,
    toDateString, shiftDate, deriveAttendance, type Derived,
} from './attendanceConstants';
import './AttendanceView.css';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';
```

**Inline icon components, lines 27–74.** The project has no icon package; every view draws
feather-style inline SVGs through a local `Svg` wrapper. Nine icons are defined here:
`IconUsers`, `IconCheck`, `IconClock`, `IconAbsent`, `IconAlert`, `IconChevronLeft`,
`IconChevronRight`, `IconRefresh`, `IconDownload`, `IconEye`. Which of these survive your change is
spelled out in §8.4 — get it right, or `tsc` will report unused declarations.

**State, lines 84–100:** `date` (defaults to `toDateString(new Date())`), `sections`, `sectionId`,
`rows`, `sectionsLoading`, `sectionsError`, `loading`, `error`, `search`, `statusFilter`,
`detailTarget`, `detailModalKey`.

**Data flow, lines 103–153:**

| Step | Code |
|---|---|
| mount | `useEffect(…, [])` → `adviserService.getMySections()`; auto-selects `data[0].id` (line 113) |
| load | `loadAttendance` = `useCallback(…, [sectionId, date])` → `attendanceService.getAdviserAttendance(date, sectionId)` → `setRows(data.map(derive))` |
| re-run | `useEffect(() => { … }, [loadAttendance])` with a `{ cancelled }` signal cleared on cleanup |
| refresh | `const refresh = () => loadAttendance({ cancelled: false })` (line 151) |

`selectedSection = sections.find(s => s.id === sectionId) ?? null` (line 153).

**`stats`, lines 156–169** — a `useMemo` over `rows` producing
`total, present, late, absent, incomplete, onLeave, notRecorded, flagged, avgHours`.

**`attendanceRate`, lines 172–174:**

```ts
const attendanceRate = stats.total
    ? Math.round(((stats.present + stats.late + stats.onLeave) / stats.total) * 100)
    : 0;
```

**`kpis`, lines 176–182** — the array behind the five cards. **This is deleted.**

```ts
const kpis = [
    { label: 'Total Students', value: stats.total,      sub: `In ${selectedSection?.name ?? 'section'}`, color: '#3b82f6', Icon: IconUsers },
    { label: 'Present',        value: stats.present,    sub: `${attendanceRate}% attendance rate`,       color: '#10b981', Icon: IconCheck },
    { label: 'Late',           value: stats.late,       sub: 'Past grace period',                        color: '#f59e0b', Icon: IconClock },
    { label: 'Absent',         value: stats.absent,     sub: `${stats.notRecorded} not yet recorded`,    color: '#ef4444', Icon: IconAbsent },
    { label: 'Incomplete',     value: stats.incomplete, sub: `${stats.flagged} flagged`,                 color: '#fb923c', Icon: IconAlert },
];
```

**`filteredRows`, lines 184–198** — search over name / email / `student_profile_id`, plus the status
filter, with `'not_recorded'` matching `effective_status === null`. **Unchanged.**

**`usePagination(filteredRows, 12)`, lines 200–202.** **Unchanged.**

**`exportCsv`, lines 209–235** — builds a 15-column CSV from `filteredRows` and triggers a Blob
download. **This is deleted.**

**Three early returns, lines 248–281, in this order, each with a distinct meaning:**

1. `sectionsLoading` → `.ad-att-card` wrapping three bare `<TableRowSkeleton />` — **invalid DOM, see §8.5**
2. `sectionsError` → *Failed to Load* + **Try Again** (calls `window.location.reload()`)
3. `sections.length === 0` → *No Sections Assigned* + "contact the SIL Coordinator"

**The four render bands, lines 284–544:**

| Band | Lines | Fate |
|---|---|---|
| `.ad-att-toolbar` — section select, date, ‹/Today/›, Refresh, Export CSV | 286–346 | Export CSV removed; everything else unchanged |
| `.ad-att-kpis` — five KPI cards | 349–364 | **Deleted** |
| `.ad-att-card` — roster head, table, pagination | 367–496 | Table unchanged; loading branch fixed |
| `.ad-att-card` > `.ad-att-strip` — six metrics + distribution bar + legend | 499–526 | **Moved above the table and extended** |
| `AttendanceDetailModal` (`canRecord={false}`) | 532–543 | Unchanged |

The bottom strip today (lines 499–526):

```tsx
{!loading && !error && rows.length > 0 && (
    <div className="ad-att-card">
        <div className="ad-att-strip">
            <div className="ad-att-metric"><span>Attendance Rate</span><strong>{attendanceRate}%</strong></div>
            <div className="ad-att-metric"><span>Absences</span><strong>{stats.absent}</strong></div>
            <div className="ad-att-metric"><span>Late Arrivals</span><strong>{stats.late}</strong></div>
            <div className="ad-att-metric"><span>Average Hours</span><strong>{formatHours(stats.avgHours)}</strong></div>
            <div className="ad-att-metric"><span>Incomplete Logs</span><strong>{stats.incomplete}</strong></div>
            <div className="ad-att-metric"><span>Not Yet Recorded</span><strong>{stats.notRecorded}</strong></div>

            <div className="ad-att-dist">
                <div className="ad-att-bar">
                    <span className="is-present"    style={{ width: `${(stats.present / stats.total) * 100}%` }} />
                    <span className="is-late"       style={{ width: `${(stats.late / stats.total) * 100}%` }} />
                    <span className="is-incomplete" style={{ width: `${(stats.incomplete / stats.total) * 100}%` }} />
                    <span className="is-absent"     style={{ width: `${(stats.absent / stats.total) * 100}%` }} />
                </div>
                <div className="ad-att-legend">
                    <span><i className="is-present" /> Present</span>
                    … Late, Incomplete, Absent, Not recorded
                </div>
            </div>
        </div>
    </div>
)}
```

Note the comment at lines 528–531, which must survive:

> *Read-only for advisers: `record_attendance` accepts only company, coordinator and admin callers,
> so offering a write action here would fail on every click. The detail modal still shows the full
> record and its change history.*

### 2.2 Styles available to this file [CONFIRMED]

The file imports `AttendanceView.css`, `CoordinatorDashboard.css` and `AdviserDashboard.css`, and
`src/index.css` is global. **Every class this page uses is already defined — add no new rule.**

| Class | Defined in | Lines |
|---|---|---|
| `.ad-att-toolbar`, `-field`, `-field-label`, `-input`, `-btn`, `-btn--icon`, `-push`, `-group` | `AdviserDashboard.css` | 953–1028 |
| `.ad-att-kpis`, `.ad-att-kpi`, `-icon`, `-body`, `-label`, `-value`, `-sub` | `AdviserDashboard.css` | 1030–1086 — **about to become dead** |
| `.ad-att-card`, `-card-head`, `-tools`, `-search` | `AdviserDashboard.css` | 1088–1125 |
| `.ad-att-scroll`, `.ad-att-table`, `-name`, `-mail`, `-id`, `-flag`, `-num`, `-ojt*` | `AdviserDashboard.css` | 1127–1213 |
| `.ad-att-badge` + `.is-present/-late/-absent/-incomplete/-on-leave/-not-recorded` (+ dark overrides) | `AdviserDashboard.css` | 1216–1252 |
| `.ad-att-view` | `AdviserDashboard.css` | 1255–1278 |
| `.ad-att-strip`, `-metric`, `-dist`, `-bar`, `-legend` | `AdviserDashboard.css` | 1280–1343 |
| `.ad-att-empty` | `AdviserDashboard.css` | 1345–1362 |
| `.ad-att-*` responsive blocks | `AdviserDashboard.css` | 1364–1381 |
| `.fade-in`, `.glass-card`, `.skeleton*` | `index.css` | global |

`.ad-att-strip` is already `display: flex; flex-wrap: wrap; gap: 1.1rem 1.75rem; padding: .85rem .95rem`
and `.ad-att-metric` is a `min-width: 90px` label-over-value stack with `0.62rem` uppercase labels and
`1.05rem` tabular-nums values. **It absorbs two more metrics without a single CSS change.**

### 2.3 The skeleton components [CONFIRMED — `src/components/Skeletons.tsx`]

```tsx
export const TableSkeleton:    React.FC<{ rows?: number, cols?: number }>  // renders its OWN .glass-card wrapper
export const TableRowSkeleton: React.FC<{ rows?: number, cols?: number }>  // renders bare <tr><td> — VALID ONLY INSIDE <tbody>
```

`AdviserAttendanceView` calls `<TableRowSkeleton />` **inside plain `<div>`s** at lines 250–254 and
399–405. React logs `validateDOMNesting: <tr> cannot appear as a child of <div>`, the browser hoists
the cells out, and the skeleton renders as a run of unstyled grey bars rather than table rows. This
is a real defect in the exact code you are already editing, so §8.5 fixes it.

---

## 3. FILES YOU WILL TOUCH

| Path | What you do |
|---|---|
| `src/components/AdviserAttendanceView.tsx` | The main edit: merge the summaries, drop Export CSV, fix the skeletons. |
| `src/components/AdviserDashboard.css` | **Deletions only** — remove the `.ad-att-kpi*` rules that your change makes dead. See §8.6. |

**Files you must NOT change**, even if it looks convenient:
`src/components/attendanceConstants.ts`, `src/services/attendanceService.ts`,
`src/services/adviserService.ts`, `src/components/AdviserDashboard.tsx`,
`src/components/AttendanceDetailModal.tsx`, `src/components/Skeletons.tsx`,
`src/components/Pagination.tsx`, `src/hooks/usePagination.ts`,
`src/components/AttendanceView.css`, `src/components/CoordinatorDashboard.css`, `src/index.css`,
`src/components/AdminAttendanceView.tsx` / `.css`, `src/components/CompanyAttendanceView.tsx`,
`src/components/CoordinatorAttendanceView.tsx`, every SQL file, every other component.

If you believe a CSS rule is missing, express it with an inline style object in this component —
that is already the convention in this file and across the adviser views — rather than adding to a
shared stylesheet.

---

## 4. ARCHITECTURE — how this view is wired [CONFIRMED]

```
App.tsx  Route "/adviser/*"   (role === 'adviser')
  └─ AdviserDashboard.tsx                  currentView derived from location.pathname
       │   type View = 'overview' | 'sections' | 'students' | 'approvals' | 'attendance'
       │               | 'evaluations' | 'grading' | 'reports' | 'announcement'
       │               | 'profile' | 'settings';                        (line 43)
       │   sidebar item  { id: 'attendance', label: 'Attendance', icon: Icon.clock }   (line 171)
       │   viewTitles.attendance = 'Attendance Monitoring'                             (line 190)
       └─ currentView === 'attendance' → <AdviserAttendanceView />       (lines 417–419, no props)
            ├─ adviserService.getMySections()            → rpc('get_adviser_sections')   [read]
            ├─ attendanceService.getAdviserAttendance()  → rpc('get_adviser_attendance') [read]
            └─ AttendanceDetailModal (canRecord={false}) → rpc('get_attendance_audit')   [read]
```

**Nothing above this component changes.** The `View` union, the sidebar entry and badge,
`viewTitles`, the page header ("Attendance Monitoring" + the date line, rendered by
`AdviserDashboard`), and `App.tsx` routing are all untouched. The component still takes no props.

---

## 5. DATA FLOW (after your change — identical to today)

```
mount → adviserService.getMySections()                       (unchanged)
      → sections: Section[]  →  sectionId = sections[0].id
      → attendanceService.getAdviserAttendance(date, sectionId)
      → rows: Derived<AdviserAttendanceRow>[]   (deriveAttendance adds effective_status + anomalies)
      → stats  = useMemo over rows              (unchanged)
      → ONE summary strip renders above the table from `stats` + `attendanceRate`
      → filteredRows = search + statusFilter    (unchanged)
      → usePagination(filteredRows, 12)         (unchanged)
      → roster table + pagination               (unchanged)
change section / date → the [sectionId, date] useCallback re-fires → one RPC call → re-render
```

The only thing that changes is **where the already-computed numbers are displayed, and how many
times**. `stats`, `attendanceRate`, `filteredRows` and the pagination hook are all computed exactly
as they are today.

---

## 6. DATABASE CONTEXT [CONFIRMED — for orientation only; you touch none of it]

`attendanceService.getAdviserAttendance(date, sectionId)` calls one RPC:

```ts
supabase.rpc('get_adviser_attendance', {
  p_attendance_date: date,
  p_section_id: sectionId ?? null
})
```

Its scope is derived server-side from the adviser's own `adviser_sections` rows, so passing a section
the adviser does not hold is **rejected in the database**, not filtered in the browser. The service's
own comment records why: `get_all_attendance` is restricted to coordinators and admins, and calling
it as an adviser was the cause of this page's original error banner.

`AdviserAttendanceRow` [CONFIRMED — `src/services/attendanceService.ts:93–105`], extending
`AllAttendanceRow` → `CompanyAttendanceRow`:

```
student_auth_id, student_profile_id, first_name, last_name, email, program, department,
schedule_start, schedule_end, time_in, time_out, attendance_id,
status: AttendanceStatus | null, reason, remarks,
recorded_by, recorded_by_name, recorded_at, updated_by, updated_at,
company_id, company_name,
section_name, year_level,
worked_hours, total_rendered_hours, required_hours, timesheet_count, open_timesheet_count
```

It is **roster-based**: a student with no attendance record for the date is still returned, with
`attendance_id` and `status` null — which is what makes *Not Recorded* a real, distinguishable state
rather than a silent absence. Postgres numerics arrive as strings over PostgREST and are coerced with
`Number(...)` in the service; the component receives real numbers.

`AttendanceStatus = 'present' | 'absent' | 'late' | 'on_leave' | 'incomplete'`.

Tables behind the RPC, named in the service comments: `company_attendance` (the recorded status) and
`timesheets` (the clock entries). **Do not add a column, a table, an RPC, an RLS policy or a grant.**

---

## 7. ROLE CONTEXT

| Role | Effect |
|---|---|
| **Adviser** | The only role affected. Same page, same data, same permissions — fewer bands, one summary, no Export CSV. |
| **Company Supervisor** | **Zero change.** `CompanyAttendanceView` is a different component with different CSS classes. |
| **Coordinator** | **Zero change.** `CoordinatorAttendanceView` is untouched. |
| **Administrator** | **Zero change.** `AdminAttendanceView` + `AdminAttendanceView.css` are untouched. |
| **Student** | **Zero change.** |

Advisers are **read-only** on attendance: `record_attendance` accepts only company, coordinator and
admin callers, which is why `AttendanceDetailModal` is passed `canRecord={false}` and `onRecord` is a
no-op. **Keep that exactly as it is** — including the explanatory comment at lines 528–531.

---

## 8. REQUESTED CHANGE — implement exactly this

All of §8.1–§8.5 inside `src/components/AdviserAttendanceView.tsx`; §8.6 in `AdviserDashboard.css`.

### 8.1 Navigation — change nothing

The `.ad-att-toolbar` keeps, byte-for-byte:

* the Section `<select id="ad-att-section">` with its `.ad-att-field-label`,
* the `<input id="ad-att-date" type="date" max={todayStr}>` with its label,
* the `‹ / Today / ›` `.ad-att-group`, including the `disabled={date === todayStr}` on **Today** and
  `disabled={date >= todayStr}` on **next day**,
* every `setCurrentPage(1)` call that accompanies those handlers — dropping one leaves an adviser on
  page 3 of a section that has one page.

The one permitted edit inside the toolbar is the option label, which today repeats the course code
already encoded in the section name (`DIT-1A (DIT) — 3 students`):

```tsx
{sections.map(s => (
    <option key={s.id} value={s.id}>
        {s.name} — {s.student_count ?? 0} student{(s.student_count ?? 0) !== 1 ? 's' : ''}
    </option>
))}
```

Use the file's existing `{n !== 1 ? 's' : ''}` pluralisation idiom, as above.

### 8.2 Delete the Export CSV button

Remove all three of:

* the button at lines 342–344,
* the `exportCsv` function at lines 209–235,
* the `IconDownload` component at lines 69–71.

`.ad-att-push` then holds **Refresh alone**. Do not restructure the group, do not move Refresh, do
not change `.ad-att-push`. The `ATTENDANCE_STATUS_CONFIG` import stays — `statusBadge` still uses it.

### 8.3 One summary strip, above the table

**Delete** the `kpis` array (lines 176–182) and the entire `.ad-att-kpis` block (lines 349–364).

**Move** the strip that currently sits at lines 499–526 so it renders **between the toolbar and the
roster card**, and extend it to carry the counts the KPI row used to own. Final metric order — eight
metrics, then the distribution block:

```tsx
{!loading && !error && rows.length > 0 && (
    <div className="ad-att-card">
        <div className="ad-att-strip">
            <div className="ad-att-metric"><span>Students</span><strong>{stats.total}</strong></div>
            <div className="ad-att-metric"><span>Present</span><strong>{stats.present}</strong></div>
            <div className="ad-att-metric"><span>Late</span><strong>{stats.late}</strong></div>
            <div className="ad-att-metric"><span>Absent</span><strong>{stats.absent}</strong></div>
            <div className="ad-att-metric"><span>Incomplete</span><strong>{stats.incomplete}</strong></div>
            <div className="ad-att-metric"><span>Not Recorded</span><strong>{stats.notRecorded}</strong></div>
            <div className="ad-att-metric"><span>Attendance Rate</span><strong>{attendanceRate}%</strong></div>
            <div className="ad-att-metric"><span>Average Hours</span><strong>{formatHours(stats.avgHours)}</strong></div>

            {/* distribution bar + legend — copied across unchanged from lines 509–523 */}
            <div className="ad-att-dist"> … </div>
        </div>
    </div>
)}
```

Decisions baked into that block — implement them, do not re-litigate them:

* **`Absences` → `Absent`, `Late Arrivals` → `Late`, `Incomplete Logs` → `Incomplete`,
  `Not Yet Recorded` → `Not Recorded`.** Short labels, and `Not Recorded` now matches the badge text
  in the Status column and the `ATTENDANCE_STATUS_CONFIG.not_recorded.label` string exactly.
* **`Total Students` → `Students`.** The `In DIT-1A` sub-line the KPI card carried is dropped: the
  section name is already in the Section dropdown and in the roster card's subtitle.
* **The `flagged` count is dropped from the summary.** It was the KPI row's *"0 flagged"* sub-line;
  flags are shown per row by the `.ad-att-flag` chip, which is where an adviser can act on them.
  Leave `stats.flagged` in the `stats` memo — removing a computed field is churn, and `tsc` does not
  complain about an unused object property.
* **All eight values stay neutral** (`.ad-att-metric strong` is `var(--text-bright)`). The KPI row
  tinted its numbers per status; the distribution bar and its legend already carry that colour
  coding, and repeating it in the numbers is the noise this change exists to remove.
* **Keep the render guard exactly as written above** — `!loading && !error && rows.length > 0`.
  It is what protects the four `stats.x / stats.total` divisions in the bar from dividing by zero,
  and it means loading and error states show the table card alone, with no empty strip above it.

### 8.4 Icons — which survive

After §8.2 and §8.3, delete these four, used only by the deleted `kpis` array:
`IconUsers`, `IconCheck`, `IconClock`, `IconAbsent`. Plus `IconDownload` from §8.2. **Five deletions.**

**Keep** — each is still referenced:

| Icon | Still used by |
|---|---|
| `IconAlert` | the per-row `.ad-att-flag` anomaly chip (line 452) |
| `IconChevronLeft` / `IconChevronRight` | the previous/next-day buttons |
| `IconRefresh` | the Refresh button **and** both *Try Again* buttons (lines 264–266, 410–412) |
| `IconEye` | the per-row **View** button (line 473) |
| `Svg` (the wrapper) and `type IconProps` | all of the above |

Keep the comment block at lines 23–26 explaining why the icons are inline, and update nothing in it.

### 8.5 Fix the invalid loading skeletons

**The `sectionsLoading` early return** (lines 248–256) — `TableSkeleton` brings its own `.glass-card`
wrapper, so drop the `.ad-att-card`:

```tsx
if (sectionsLoading) {
    return (
        <div className="fade-in">
            <TableSkeleton rows={4} cols={5} />
        </div>
    );
}
```

**The in-card loading branch** (lines 399–405) — keep `TableRowSkeleton`, but give it the `<tbody>`
it requires, inside the existing `.ad-att-card`:

```tsx
{loading ? (
    <div className="ad-att-scroll">
        <table className="ad-att-table">
            <tbody>
                <TableRowSkeleton rows={5} cols={8} />
            </tbody>
        </table>
    </div>
) : error ? ( … )}
```

`cols={8}` matches the table's eight columns (Student, ID, Time In, Time Out, Hours, SIL Progress,
Status, Action). Import `TableSkeleton` alongside the existing `TableRowSkeleton`:

```ts
import { TableSkeleton, TableRowSkeleton } from './Skeletons';
```

### 8.6 Delete the CSS your change made dead — `src/components/AdviserDashboard.css`

**First run `grep -rn "ad-att-kpi" src/`.** If anything outside `AdviserAttendanceView.tsx` still
references these classes, **stop and report it instead of deleting** — see §17.

If nothing does, delete:

* the `/* ── KPI strip ── */` block, **lines 1030–1086**: `.ad-att-kpis`, `.ad-att-kpi`,
  `.ad-att-kpi-icon`, `.ad-att-kpi-body`, `.ad-att-kpi-label`, `.ad-att-kpi-value`, `.ad-att-kpi-sub`.
* the **whole** `@media (max-width: 1250px)` block (lines 1365–1367) — its only rule is `.ad-att-kpis`.
* the single `.ad-att-kpis` line inside `@media (max-width: 820px)` (line 1370). **Keep the rest of
  that block** — `.ad-att-push`, `.ad-att-toolbar > .ad-att-field`, `.ad-att-search`, `.ad-att-tools`
  are all still live.
* the **whole** `@media (max-width: 460px)` block (lines 1378–1381) — both its rules are `.ad-att-kpi*`.

Delete nothing else in this file. `.ad-att-strip`, `.ad-att-metric`, `.ad-att-dist`, `.ad-att-bar`
and `.ad-att-legend` are all still used and need **no** modification — the strip already wraps and
already fits eight metrics.

### 8.7 Untouched inside this same file

The roster card in full: `.ad-att-card-head` heading and subtitle, the search input, the status
`<select>`, the eight table columns including **SIL Progress** and its `pct` calculation, the
`.ad-att-flag` chip, `statusBadge`, the **View** button, `openDetail`, `detailModalKey`, the
`Pagination` footer; the `sectionsError` and `sections.length === 0` early returns; the in-card
`error` and `rows.length === 0` and `filteredRows.length === 0` branches; `AttendanceDetailModal`
with `canRecord={false}` and its explanatory comment; `deriveAttendance` / `derive` / `DerivedRow`;
`loadAttendance`, its `{ cancelled }` signal and `refresh`; the `fade-in` wrapper.

---

## 9. EXPECTED BEHAVIOUR

**Adviser on `DIT-1A` (3 students), today, nothing recorded yet** — the screenshot's state:

* The toolbar reads `SECTION [DIT-1A — 3 students] DATE [13/09/2026] ‹ Today › … Refresh`.
  **No Export CSV button.**
* Directly beneath it, **one** strip:
  `Students 3 · Present 0 · Late 0 · Absent 0 · Incomplete 0 · Not Recorded 3 ·
  Attendance Rate 0% · Average Hours 0.00h`, then the distribution bar (empty) and its five-item
  legend.
* Then the roster card: *Daily Attendance Monitoring · DIT-1A · time records and SIL progress*, the
  search box, the status filter, three rows with Time In `—`, Time Out `—`, `0.00h`, the
  `0 / 100h` SIL bar, a *Not Recorded* badge and a **View** button.
* **Nothing below the table.** The page ends at the pagination footer.

**Switching section in the dropdown** → one `get_adviser_attendance` call, the strip and the table
both re-render, pagination resets to page 1, the search text and status filter persist (unchanged
behaviour).

**Stepping to a previous day** → same, with `Today` re-enabled and the next-day button enabled.

**While loading** → the strip is absent; the roster card shows five skeleton rows **inside a real
table**, aligned to the eight columns, with **no `validateDOMNesting` warning in the console**.

**On error** → the strip is absent; the roster card shows *Failed to Load* + **Try Again**, which
calls `refresh`.

**Section with no students** → the strip is absent (`rows.length === 0`); the card shows
*No Students*.

**Search or filter matching nothing** → the strip **stays** (it summarises the section, not the
filter) and the card shows *No Matching Records*. This is today's behaviour and must not change.

**Clicking View** → `AttendanceDetailModal` opens read-only with the full record and its change
history, exactly as today.

**Adviser with no sections** → *No Sections Assigned* + "contact the SIL Coordinator". Unchanged.

---

## 10. UI / UX

The project's stated direction is **compact, modern, minimalist, professional, information-dense**.
This change is that direction applied to one page: eleven repeated figures become eight, and the page
loses a whole band.

* **Vertical rhythm:** toolbar (`margin-bottom: 1rem`) → summary card (`.ad-att-card`,
  `margin-bottom: 1rem`) → roster card (`.ad-att-card:last-child { margin-bottom: 0 }`). Three bands,
  not four. The roster card now genuinely is the last child, so the trailing margin resolves itself.
* **Every colour is a token or an existing literal.** `.ad-att-metric` already uses
  `var(--text-muted)` and `var(--text-bright)`; the bar and legend keep the exact hex values already
  in the stylesheet (`#10b981`, `#f59e0b`, `#fb923c`, `#ef4444`, `var(--border-strong)`).
  **Introduce no new colour.**
* **No gradients, no glassmorphism, no emoji, no illustrations, no giant headings, no new animation.**
  The only motion is the `fade-in` already on the wrapper. Note `ATTENDANCE_STATUS_CONFIG` carries an
  `emoji` field — this page does not use it, and must not start.
* **Dark mode:** `.ad-att-badge` dark overrides live at `AdviserDashboard.css:1248–1252`; everything
  else on the strip is token-based. Verify both themes; restyle nothing.
* **Responsive:** `.ad-att-strip` is `flex-wrap: wrap` with `min-width: 90px` metrics, so eight
  metrics reflow to two or three rows on a phone without a media query. `.ad-att-dist` is
  `flex: 1 1 200px; min-width: 180px` and drops to its own line. Verify at ~390 px that the strip
  does not clip and the page does not scroll horizontally — the table keeps its own
  `.ad-att-scroll` container and its `min-width: 900px`, which is correct and must stay.
* **Accessibility:** the strip is static text — add no `role`, no `tabIndex`, no click handler. The
  search input's `aria-label`, the status select's `aria-label`, and the `aria-label`s on the
  previous/next-day buttons all stay. Every icon keeps `aria-hidden="true"` via the `Svg` wrapper.

---

## 11. SECURITY

* **No security surface changes.** Both reads are `SECURITY DEFINER` RPCs scoped server-side:
  `get_adviser_sections()` returns only the caller's own active sections, and
  `get_adviser_attendance(date, section_id)` derives its scope from the adviser's own
  `adviser_sections` rows, so a section the adviser does not hold is refused in the database. You are
  moving already-fetched numbers around in the browser; nothing about who can see what moves with them.
* **Advisers stay read-only.** Do not add a record, edit, approve or delete action, and do not change
  `canRecord={false}`. `record_attendance` rejects adviser callers, so any write control here would
  fail on every click.
* Removing Export CSV removes a **client-side Blob download** built from data already in the browser.
  It touches no endpoint and no permission.
* Add no RLS policy, no grant, no RPC, no table column. Do not weaken the error handling that
  surfaces the RPC's authorization message (`err instanceof Error ? err.message : …`) — that is what
  keeps "not authorized" distinguishable from "no data".

---

## 12. EDGE CASES

1. **Section with zero students** → `rows.length === 0` → the strip does not render (so no
   `0 / 0` division) and the card shows *No Students*. Verify the guard survives your move.
2. **`stats.total === 0` while the strip is somehow rendered** → cannot happen with the guard intact.
   Do not "improve" it with an extra `|| 0` that would let a NaN width through silently.
3. **Search/filter empties the table** → the strip must **stay**, showing the section's totals. It
   summarises `rows`, not `filteredRows`, and that distinction is deliberate.
4. **A future date** → the date input's `max={todayStr}` and the disabled next-day button already
   prevent it. Unchanged.
5. **Slow section switch** → the `{ cancelled }` signal in the `[loadAttendance]` effect discards a
   stale response. `refresh` deliberately passes `{ cancelled: false }`, which is never cancelled —
   **leave it as it is**; it is out of scope and changing it is an unrequested refactor.
6. **`student_count` undefined** on a `Section` (it is optional) → `?? 0` in the option label, as
   specified in §8.1.
7. **Adviser holding many sections** → the dropdown lists them all, unsorted beyond
   `getMySections()`'s `localeCompare` by name. Unchanged — do not add grouping.
8. **A student on leave** → `stats.onLeave` counts into `attendanceRate` but has no metric of its
   own, as today. Do not add one; the legend and the status filter already cover it.
9. **`worked_hours` over 16, or an open timesheet** → `deriveAttendance` flags it; the flag chip shows
   the first anomaly with the rest in its `title`. Unchanged.

---

## 13. REGRESSION PROTECTION — must remain true afterwards

* `attendanceService.getAdviserAttendance`, `adviserService.getMySections`,
  `attendanceService.getAttendanceAudit` and every RPC (`get_adviser_attendance`,
  `get_adviser_sections`, `get_attendance_audit`) are **byte-identical**. No call is added or removed;
  the page still issues exactly one attendance RPC per section+date.
* `src/components/attendanceConstants.ts` is unmodified — `ATTENDANCE_STATUS_CONFIG`,
  `deriveAttendance`, `formatTime`, `formatHours`, `toDateString`, `shiftDate`, `formatDuration`.
  The admin monitor imports the same module and must keep flagging identically.
* The three early returns keep their **order and meaning**: `sectionsLoading` → skeleton;
  `sectionsError` → *Failed to Load* + Try Again; `sections.length === 0` → *No Sections Assigned*.
  A failed load still never renders as an empty state.
* Section, date, prev/Today/next and Refresh all behave exactly as before, including every
  `setCurrentPage(1)`.
* The roster table is unchanged: all eight columns, the SIL Progress bar and its `pct` maths, the
  anomaly chip, `statusBadge`, the View button, `AttendanceDetailModal` with `canRecord={false}`, the
  search filter over name/email/id, the status filter including `not_recorded`, and
  `usePagination(filteredRows, 12)`.
* `AdviserDashboard.tsx` is untouched: the `View` union, the sidebar item and its clock icon,
  `viewTitles.attendance`, the page header, `App.tsx` routing.
* **No other role's attendance view changes.** `AdminAttendanceView`, `CompanyAttendanceView` and
  `CoordinatorAttendanceView` must render identically — confirm the CSS deletions in §8.6 did not
  reach them.
* No new dependency, no new file, no new CSS rule, no renamed identifier, no reordered function, no
  reformatting of untouched lines.

---

## 14. IMPLEMENTATION CONSTRAINTS

* **Read in full before writing anything:** `src/components/AdviserAttendanceView.tsx` (all 549
  lines), `src/components/Skeletons.tsx`, `src/components/AdviserDashboard.css` **lines 948–1382**,
  and `src/components/AdviserDashboard.tsx` **lines 160–200 and 410–425**.
* Mirror this file's own conventions: **4-space indentation**, `React.FC`, `useState` at the top,
  handlers as `const fn = () => {}`, `useMemo` for derived lists, inline style objects for one-off
  layout, and section-divider comments in the `/* ── Name ── */` form the file already uses. Its
  comments explain **why**, not what — the `record_attendance` note and the
  `attendanceConstants` note set the register. Match it.
* TypeScript strict: **no `any`, no non-null assertions, no `@ts-ignore`**. `AdviserAttendanceRow`
  and `Derived<T>` are used as declared and not widened.
* Delete the dead identifiers listed in §8.2 and §8.4 — do not leave them behind with an eslint
  disable comment.
* Do not rename existing identifiers, do not reorder existing functions, do not reformat untouched
  lines, and do not refactor anything you were not asked to change. In particular: leave
  `refresh`'s uncancellable signal, the `stats.flagged` field and the `localeCompare` ordering alone.
* **[UNCONFIRMED] — verify, don't assume:** whether any file outside `AdviserAttendanceView.tsx`
  references `ad-att-kpi*` (§8.6 gates the CSS deletion on this); and whether eight metrics plus the
  distribution block read comfortably in `.ad-att-strip` at ~390 px in **both** themes, since the
  strip has only ever carried six. Check both in the running app and report what you find rather
  than adapting silently.

---

## 15. VERIFICATION — do all of these before reporting done

**Build / static**

* `npx tsc -b` (or `npm run build`) passes with **no new errors**, including no unused-declaration
  error for the five deleted icons, `kpis` or `exportCsv`.
* `npx eslint src/components/AdviserAttendanceView.tsx` reports nothing new.
* `git diff --stat` shows **exactly two changed files**: `AdviserAttendanceView.tsx` and
  `AdviserDashboard.css`. If it shows more, revert the rest.
* `grep -rn "ad-att-kpi" src/` returns **zero** matches.
* `grep -n "IconDownload\|IconUsers\|IconCheck\|IconAbsent\|exportCsv\|kpis" src/components/AdviserAttendanceView.tsx`
  returns zero matches. (`IconClock` must also be gone — grep it separately so the word "clock" in
  `Icon.clock` elsewhere does not confuse the result.)
* Zero new `rpc(`, `from(`, `supabase.` calls, and zero new CSS rules, anywhere in the diff.

**UI — signed in as an adviser with at least one section**

* The page shows **three bands**: toolbar, one summary strip, roster card. Nothing renders below the
  table.
* No Export CSV button anywhere on the page.
* The strip's numbers match the table: `Students` equals the row count; `Present + Late + Absent +
  Incomplete + Not Recorded` also equals it (`on_leave` rows are the only exception — verify with a
  section that has one, if one exists); `Attendance Rate` matches
  `(present + late + on_leave) / total`.
* The Section dropdown reads `DIT-1A — 3 students`, and switching sections reloads both the strip and
  the table with pagination back on page 1.
* `‹`, `Today` and `›` all still move the date; `Today` is disabled on today; `›` is disabled on
  today.
* Refresh re-fetches; the button disables while loading.
* Search and the status filter still narrow the table, and the strip does **not** change with them.
* **View** opens the detail modal read-only, with no record/save control.
* The SIL Progress bars still render with their percentage.

**UI — the other states**

* **Loading:** throttle the network. Skeleton rows appear inside the table, column-aligned, and the
  browser console shows **no `validateDOMNesting`** warning. The summary strip is absent.
* **Error:** force a failure (offline, or temporarily misname the RPC locally and revert) →
  *Failed to Load* + **Try Again**, no strip, never an empty state.
* **Section with no students** → *No Students*, no strip.
* **Search matching nothing** → *No Matching Records*, strip still present.
* **Adviser with zero sections** → *No Sections Assigned*.

**Cross-cutting**

* Light **and** dark mode on every state above.
* ~390 px width: the strip wraps without clipping, the page does not scroll horizontally, and the
  table scrolls inside its own container.
* Keyboard only: Tab reaches the section select, the date input, the three date buttons, Refresh, the
  search box, the status select, every View button and the pagination controls — in that order, with
  visible focus. The strip is not focusable.
* Sign in as an **administrator** → *Attendance* renders identically to before. Same for a
  **company supervisor** and a **coordinator**.

---

## 16. WHAT THIS PROMPT DELIBERATELY DID NOT ASK FOR

Do not implement any of these, even though they may look like improvements:

* A year-level or section drill-down, tabs, chips or a section rail on this page. The dropdown stays.
* Removing the search box, the status filter, the View button or the SIL Progress column.
* Removing the Refresh button.
* Colour-coding the summary numbers, or reinstating per-status cards in any form.
* Replacing the `ID` column's truncated UUID with a real student number (see §17).
* Adding a date-range or weekly view, an attendance chart, or any export replacement.

---

## 17. UNKNOWN / UNCONFIRMED — report, do not guess

* **[UNCONFIRMED]** Whether any file outside `AdviserAttendanceView.tsx` references `ad-att-kpi*`.
  `AdminAttendanceView` has its own stylesheet (`AdminAttendanceView.css`), so a collision is
  unlikely, but the grep in §8.6 is the gate on deleting those rules. If it finds one, **leave the
  CSS in place and say so** rather than deleting it.
* **[CONFIRMED, out of scope]** The `ID` column renders `row.student_profile_id.slice(0, 8)` — a UUID
  fragment (`da706936` in the current UI), which is meaningless to an adviser. `AdviserAttendanceRow`
  carries **no** student-number field, and `src/utils/studentNumber.ts` exists but is not wired into
  this row type, so replacing it would require changing the RPC — which is out of scope here. **Do
  not change it. Report it** as a follow-up worth a separate prompt.
* **[UNCONFIRMED]** Whether removing Export CSV leaves advisers without any attendance export.
  `src/components/AdviserReportView.tsx` and `src/utils/adviserReportPdf.ts` exist and appear to
  cover a daily report, but their content was not inspected for this prompt. After implementing,
  open *Daily Report* as an adviser and **report whether attendance for a section and date can still
  be exported from somewhere**. Do not re-add the button on your own initiative.
* **[UNCONFIRMED]** The SQL definition of `get_adviser_attendance` was not read; everything stated
  about its scoping comes from the service-layer comments in `attendanceService.ts:258–288`. You do
  not need it for this change — do not go looking for it, and do not modify it if you find it.

---

### One-line summary for the agent

In `src/components/AdviserAttendanceView.tsx`, delete the five-card KPI row and the Export CSV button,
fold their numbers into the existing `.ad-att-strip` and move that single strip above the roster
table, give both `TableRowSkeleton` usages a real `<tbody>`, then remove the now-dead `.ad-att-kpi*`
rules from `AdviserDashboard.css` — leaving the section dropdown, the date controls, the search, the
status filter, the SIL Progress column, the View modal and every service, RPC and table exactly as
they are.

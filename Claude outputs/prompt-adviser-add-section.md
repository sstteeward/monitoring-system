# CODING-AGENT PROMPT — Move "Add Section" from the Coordinator to the Adviser

> Hand this whole document to the coding agent. Everything marked **[CONFIRMED]** was read from the
> repository at `C:\Users\stewa\monitoring-system`. Nothing here is invented. Items the repository
> could not settle are marked **[UNCONFIRMED]** and must be checked, not guessed.

---

## 1. CONTEXT

You are changing **who creates a section** in the Asian College SIL Monitoring System
(React 19 + TypeScript + Vite + React Router + Supabase, role-based dashboards, one dashboard
component per role with view state driven off the URL path).

Today **only a Coordinator or Admin can create a `sections` row.** The Coordinator's
*Adviser & Section Management* page carries a *New Section* button, a *Create New Section* dialog,
and `coordinatorService.createSection()`. An Adviser can only ever *see* the sections a Coordinator
has already created **and** assigned to them.

**The requested change, in two halves — both are required:**

1. **Give the Adviser the ability to add a section.** A Section Adviser creates a section for their
   own course family and is assigned to it in the same operation, so the section appears immediately
   in *My Sections*.
2. **Remove section creation from the Coordinator side**, so the Coordinator page gets smaller and
   less crowded — which is the stated reason for the change.

**Scope boundary — do not exceed it.** Only *creation* moves. Everything else about sections stays
with the Coordinator: assigning and reassigning an adviser to an existing section, removing an
assignment, bulk assignment, the sections table/filters/drawer, and `deleteSection`. The Coordinator
keeps full visibility of every section, including the ones advisers create.

---

## 2. CURRENT IMPLEMENTATION [CONFIRMED]

### 2.1 The section model

`src/utils/sections.ts` is the single place that composes and decomposes a section name. A section
name encodes **course code + year + letter**: `DIT` + 3rd Year + `A` → `"DIT-3A"`. That same string
is stored in **both** `sections.name` and `profiles.section`.

```ts
export const SECTION_LETTERS = ['A','B','C','D','E','F','G','H','I','J'] as const;
export const YEAR_LEVELS     = ['1st Year','2nd Year','3rd Year','4th Year'] as const;
export const SECTION_YEARS   = [1,2,3,4] as const;

yearNumberFromLevel('3rd Year')            // 3
courseCodeFromValue('dit')                 // 'DIT'   (/^[A-Z0-9]{2,10}$/ or '')
parseSectionName('DIT-3A')                 // { courseCode:'DIT', year:3, letter:'A' } | null
buildSectionName('DIT', 3, 'A')            // 'DIT-3A'
canonicalSectionName(section, course, yr)  // resolves legacy bare letters ("A") to 'DIT-1A'
studentMatchesSection(student, 'DIT-1A')   // boolean
buildSectionOptions({...})                 // onboarding dropdown, offers A–J whether or not a row exists
```

`public.canonical_section_name(text,text,text)` in `supabase_adviser_sections_fix.sql` is the
**server-side mirror** of `canonicalSectionName`. The file's own comment says to keep the two in
step. Respect that rule for anything you add.

### 2.2 Tables [CONFIRMED — `supabase_adviser_schema.sql`]

```sql
CREATE TABLE public.sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  course_code   text NOT NULL CHECK (course_code IN ('DHT','DIT')),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE public.adviser_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adviser_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text DEFAULT 'active' CHECK (status IN ('active','inactive')),
  CONSTRAINT unique_active_section_assignment UNIQUE (section_id)   -- one adviser per section
);
```

Note the shape of the relationship: **a section has at most one adviser; an adviser may hold any
number of sections.** `sections.name` is globally UNIQUE, so two advisers can never own a section of
the same name, and a duplicate insert raises `23505`.

Seeded names: `DHT-1A/1B/1C/2A/2B`, `DIT-1A/1B/1C/2A/2B` (`ON CONFLICT (name) DO NOTHING`).
`supabase_sections_a_to_j.sql` exists and extends the seed — read it before assuming which names
are already taken.

### 2.3 RLS and the course-compatibility trigger — the real authorization [CONFIRMED]

```sql
-- sections
"Anyone authenticated can view sections"            FOR SELECT TO authenticated USING (true)
"Coordinators and Admins can manage sections"       FOR ALL    TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles
                   WHERE auth_user_id = auth.uid()
                     AND account_type IN ('coordinator','admin')))

-- adviser_sections
"Anyone authenticated can view adviser_sections"    FOR SELECT TO authenticated USING (true)
"Coordinators and Admins can manage adviser_sections" FOR ALL  TO authenticated
    USING (...coordinator/admin...) WITH CHECK (...coordinator/admin...)
```

**An adviser therefore cannot INSERT into `sections` or `adviser_sections` from the client at all.**
This is a database-level fact, not a UI one. A button alone will produce a silent RLS failure.

`trg_validate_adviser_course_assignment` (BEFORE INSERT OR UPDATE on `adviser_sections`, calling
`public.validate_adviser_course_assignment()`) additionally enforces, in the database:

* the target user's `profiles.account_type` must be `'adviser'`;
* `profiles.is_active` must not be false;
* the section must exist;
* **DHT sections → `HT Adviser` (or `course = 'DHT'`) only; DIT sections → `IT Adviser`
  (or `course = 'DIT'`) only.**

That last rule is why the adviser must only ever create sections in **their own course family**.

Helpers already in the database: `public.is_adviser()` (adviser **and** `is_active = true`),
`public.get_adviser_assigned_section_names(uuid DEFAULT auth.uid())`,
`public.canonical_section_name(text,text,text)`.

### 2.4 Existing RPCs for this area [CONFIRMED]

| Function | File | Who | Purpose |
|---|---|---|---|
| `get_adviser_sections()` | `supabase_adviser_sections_fix.sql` | caller = adviser | the caller's active sections + true student counts. Takes **no** adviser argument by design. |
| `get_adviser_section_students(uuid)` | same | adviser (own sections), coordinator, admin | one section's roster; **raises** when not entitled, so "no students" and "not allowed" stay distinguishable |
| `get_adviser_students(text DEFAULT NULL)` | same | adviser | roster across the caller's sections |
| `coordinator_assign_adviser_section(uuid,uuid)` | `supabase_adviser_schema.sql` | coordinator/admin | upsert on `(section_id)` |
| `coordinator_remove_adviser_section(uuid)` | same | coordinator/admin | delete the assignment |
| `notify_users(...)` / `notify_roles(...)` | `supabase_notifications_system.sql` | authenticated | the **only** supported writers of `user_notifications` (no INSERT policy exists) |

All of them are `SECURITY DEFINER`, most with `SET search_path = public`, each re-checking the caller
server-side, and each `GRANT EXECUTE ... TO authenticated`.

### 2.5 Client layer [CONFIRMED]

**`src/services/adviserService.ts`** — the adviser's only data path.

* `isMissingFunction(error)` — treats `PGRST202` / `42883` / `/Could not find the function|does not exist/i`
  as "migration not deployed yet" and falls back to direct table queries; **any other error is
  re-thrown**.
* `asError(error, fallback)` — wraps Supabase's plain-object rejection in a real `Error` so the RPC's
  authorization message survives to the component.
* `getMySections()` → `rpc('get_adviser_sections')`, falling back to `getMySectionsFallback()`.
* `export interface Section { id; name; course_code: 'DHT'|'DIT'; department_id?; created_at; student_count?; adviser_id?; adviser_name?; adviser_type? }`
* Writes elsewhere in the file use `notificationService.notifyUsers(...)` and
  best-effort `createAuditLog(...)` in a swallowing `try/catch`.

**`src/components/AdviserSectionsView.tsx`** (336 lines — read all of it):

* `adviserService.getMySections()` on mount; auto-selects `data[0]` and loads its roster.
* `pendingSectionId = useRef<string|null>` guards against a slow earlier roster landing on top of a
  newer one.
* Three distinct early returns, in this order: `loading` → `TableSkeleton`; `sectionsError` →
  *"Could not load your sections"* + **Try Again** (deliberately never shown as "no sections");
  `sections.length === 0` → **"No Sections Assigned" — "Please contact the SIL/OJT Coordinator."**
* Cards: `.section-card`, `.section-card-header/-title/-meta/-count/-footer`,
  `.adviser-course-pill` + `.adviser-course-dht` / `.adviser-course-dit`
  (all in `src/components/AdviserDashboard.css`); grid is
  `repeat(auto-fit, minmax(min(100%,240px), 1fr))`.
* Roster table: `.admin-table-card`, `.admin-table-header`, `.admin-table-title`, `.admin-table`,
  buttons `cd-btn cd-btn-primary`, `UserProfileModal`, `TableSkeleton`.
* Props today: `{ onSelectSection?: (sectionName: string) => void }`.

**`src/components/AdviserDashboard.tsx`**:

* `type View = 'overview' | 'sections' | 'students' | 'approvals' | 'attendance' | 'evaluations' | 'grading' | 'reports' | 'announcement' | 'profile' | 'settings'`,
  derived from `location.pathname.split('/').pop()` — **view state, not nested routes.**
* Sidebar: `{ id:'sections', label:'My Sections', icon: Icon.layers, badge: stats?.mySectionsCount }`.
* `adviserType = profile?.adviser_type || (profile?.course === 'DHT' ? 'HT Adviser' : 'IT Adviser')`,
  `course = profile?.course || (adviserType === 'HT Adviser' ? 'DHT' : 'DIT')`.
* `refreshStats()` re-reads `adviserService.getDashboardStats()`; it is already handed to a child as
  **`onActionComplete={refreshStats}`** (`AdviserApprovalsView`). Reuse that prop name.
* Renders `<AdviserSectionsView onSelectSection={(secName) => navigateTo('students', secName)} />`.

**`src/components/CoordinatorAdvisersView.tsx`** (the half you are removing from — 127 KB, read the
relevant parts):

| Line ≈ | What |
|---|---|
| 149–151 | `showSectionModal` state, beside `showCreateModal` / `showAssignModal` |
| 178–179 | `newSectionName`, `newSectionCourse` state |
| 485–502 | `handleCreateSection()` → `coordinatorService.createSection(newSectionName, newSectionCourse)` |
| 808–823 | page-header actions: **`New Section`** (`cam-btn cam-btn-ghost`) + `Add Adviser` (`cam-btn cam-btn-primary`) |
| 1264–1272 | Sections-tab empty state: *"Create a section so students can be enrolled and an adviser assigned to supervise them."* + a **New Section** button |
| 1793–1865 | the **Create Section** dialog (`cam-scrim` / `cam-dialog` / `cam-dialog-head` / `cam-dialog-form` / `cam-input` / `cam-hint` / `cam-dialog-foot`) |

`coordinatorService.createSection(name, courseCode, departmentId?)` (≈ line 1480) inserts
`{ name: name.trim().toUpperCase(), course_code, department_id: departmentId || null }` and writes a
best-effort `createAuditLog({ action:'CREATE', module:'User Management', targetType:'section' })`.
**The coordinator UI never passes `departmentId`, so every coordinator-created section has
`department_id = NULL`.** `createSection` is called from exactly one place — line 492 of
`CoordinatorAdvisersView.tsx`. `adminService.ts` only *reads* `sections.course_code`
(course-usage stats); no other module creates a section. [CONFIRMED]

### 2.6 Audit and notification shapes [CONFIRMED]

```ts
// src/services/auditService.ts
createAuditLog({ action: AuditAction, module: AuditModule, description, targetType?, targetId?, targetName?, oldValues?, newValues? })
// AuditAction includes 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | ...
// AuditModule includes 'User Management' | 'Students' | ... (sections use 'User Management' today)

// src/services/notificationService.ts
notifyRoles(roles, title, message, { severity?, notificationType?, relatedType?, relatedId?, departmentId? })
  → rpc('notify_roles', { p_roles, p_title, p_message, p_type, p_notification_type, p_related_type, p_related_id, p_department_id })
```

`public.can_notify_user` documents that **admin / coordinator / adviser may notify anyone**, and
`notify_roles` allows any authenticated caller to escalate to `admin|coordinator|adviser`, excludes
the caller, and filters by `p_department_id` when given. So an **adviser may notify coordinators**
from the client. `notification_type` must be one of
`announcement, journal_approved, journal_rejected, journal_revision, attendance, assignment,
company, system, reminder, general` — use **`'assignment'`**, which is what
`coordinator_assign_adviser_section` already uses for section events, with
`relatedType: 'section'`.

---

## 3. FILES YOU WILL TOUCH

| Path | Responsibility | What you do |
|---|---|---|
| *(new)* `supabase_adviser_create_section.sql` | standalone, idempotent migration — matches the repo's `supabase_*_fix.sql` / `supabase_<feature>.sql` convention | `public.adviser_create_section(text)` + grants + `NOTIFY pgrst` |
| `src/utils/sections.ts` | section-name rules, mirrored in SQL | `validateNewSectionName()` (pure; no I/O) |
| `src/utils/sections.test.ts` | Vitest unit tests for those rules | cases for the new validator |
| `src/services/adviserService.ts` | the adviser's only data path | `createSection()` |
| `src/components/AdviserSectionsView.tsx` | adviser's *My Sections* view | **Add Section** button, dialog, handler, empty-state action, `onActionComplete` prop |
| `src/components/AdviserDashboard.tsx` | adviser shell + view routing | pass `onActionComplete={refreshStats}` to `AdviserSectionsView` |
| `src/components/CoordinatorAdvisersView.tsx` | coordinator's *Adviser & Section Management* | **delete** the create-section button, dialog, state and handler; reword the empty state |
| `src/services/coordinatorService.ts` | coordinator data path | **delete** `createSection` (it becomes unreferenced) |

**Read every one of these in full before editing.** Do **not** create a new service, a new hook, a
new modal component, a new CSS file, or a new context — every pattern you need already exists.

Files you must **NOT** change: `supabase_adviser_schema.sql`, `supabase_adviser_sections_fix.sql`,
`supabase_sections_a_to_j.sql`, `supabase_notifications_system.sql`,
`src/components/CoordinatorAdvisersView.css`, `src/components/AdviserDashboard.css`,
`src/components/CoordinatorDashboard.css`, `src/services/auditService.ts`,
`src/services/notificationService.ts`, `src/components/onboarding/*`, `src/lib/supabaseClient.ts`,
and every non-section module.

---

## 4. ARCHITECTURE — how this is wired [CONFIRMED]

```
App.tsx  Route "/adviser/*"  (role === 'adviser', else redirect to the role's own portal)
  └─ AdviserDashboard.tsx        currentView from the pathname; stats + refreshStats live here
       └─ currentView === 'sections'  →  <AdviserSectionsView onSelectSection onActionComplete />
              ├─ adviserService.getMySections()  → rpc('get_adviser_sections')   [read]
              ├─ adviserService.getSectionStudents() → rpc('get_adviser_section_students') [read]
              └─ adviserService.createSection()  → rpc('adviser_create_section')  [NEW, write]
                       ├─ sections            INSERT   (SECURITY DEFINER, bypasses RLS)
                       └─ adviser_sections    INSERT   (adviser_id = auth.uid())
                              └─ trg_validate_adviser_course_assignment  (course match)

App.tsx  Route "/coordinator/*"
  └─ CoordinatorDashboard.tsx    type View includes 'advisers'; viewTitles.advisers = 'Adviser Management'
       └─ currentView === 'advisers'  →  <CoordinatorAdvisersView />
              ├─ coordinatorService.getAllAdvisers() / getAllSections()            [unchanged]
              ├─ assignAdviserToSection(s) / removeAdviserFromSection             [unchanged]
              └─ createSection                                                    [REMOVED]
```

**Security architecture — the part that matters most.** `sections` and `adviser_sections` grant
INSERT/UPDATE/DELETE to **coordinator and admin only**, via RLS. There is deliberately no adviser
write path. Every privileged adviser action in this codebase is therefore a `SECURITY DEFINER` RPC
that re-checks the caller — `adviser_approve_student`, `adviser_reject_student`,
`get_adviser_section_students`. **Your feature must follow that shape: one RPC, not a table insert,
and not a new RLS policy.** A hidden or absent button is not authorization.

---

## 5. DATA FLOW (after your change)

```
Adviser opens My Sections → "Add Section"
  → dialog composes the name from the adviser's OWN course (read-only) + Year (1–4) + Letter (A–J)
      via buildSectionName(course, year, letter)            ← src/utils/sections.ts
  → validateNewSectionName(name, course) blocks the obvious errors client-side (hint only)
  → adviserService.createSection(name)
  → supabase.rpc('adviser_create_section', { p_name })
        ├─ caller must satisfy public.is_adviser()            (adviser AND is_active)
        ├─ course_code is derived SERVER-SIDE from the caller's profile
        │  (adviser_type 'HT Adviser'→DHT, 'IT Adviser'→DIT, else profiles.course) — never from the client
        ├─ name must match ^[A-Z0-9]{2,10}-[1-4][A-J]$ AND its prefix must equal that course code
        ├─ a section with that name must not already exist    (friendly error, incl. 23505 race)
        ├─ INSERT sections (name, course_code, department_id = caller's profiles.department_id)
        ├─ INSERT adviser_sections (adviser_id = auth.uid(), assigned_by = auth.uid(), status 'active')
        │     └─ the existing course-compatibility trigger runs and passes
        └─ RETURN jsonb { id, name, course_code, department_id }
  → best-effort createAuditLog({ action:'CREATE', module:'User Management', targetType:'section' })
  → best-effort notificationService.notifyRoles(['coordinator'], …, { notificationType:'assignment',
                                                 relatedType:'section', relatedId: id })
  → component re-reads with getMySections() (never patches local state), selects the new section,
    loads its roster (0 students), shows a success message
  → onActionComplete?.() → AdviserDashboard.refreshStats() → the "My Sections" sidebar badge updates
  → the section is immediately visible to the Coordinator via getAllSections(), already showing
    this adviser in the Adviser column
```

---

## 6. DATABASE CONTEXT [CONFIRMED]

Tables and constraints: see §2.2. Columns you will read or write:

* `profiles.account_type` — `'student'|'coordinator'|'admin'|'company'|'adviser'`
* `profiles.adviser_type` — `CHECK (adviser_type IN ('HT Adviser','IT Adviser') OR IS NULL)`
* `profiles.course` — free text in practice; `'DHT'` / `'DIT'` for advisers
* `profiles.is_active`, `profiles.department_id` (nullable, `→ departments(id)`)
* `sections.name` (UNIQUE), `sections.course_code` (`CHECK IN ('DHT','DIT')`), `sections.department_id`
* `adviser_sections.adviser_id`, `.section_id` (UNIQUE), `.assigned_by`, `.status`, `.assigned_at`
* `user_notifications` — written **only** through `notify_users` / `notify_roles`

**You are adding no table, no column, no constraint, no index and no RLS policy.**

Student membership is **not** a foreign key: a student belongs to a section because
`canonical_section_name(profiles.section, profiles.course, profiles.year_level) = upper(btrim(sections.name))`.
Creating a section therefore enrolls nobody, and a new section legitimately reads `0 Students
Enrolled`. Do not attempt to move or backfill students.

---

## 7. ROLE CONTEXT

| Role | Effect |
|---|---|
| **Adviser** (active) | Gains *Add Section*, for their own course family only, and is auto-assigned to what they create. Everything else unchanged. |
| **Adviser** (inactive, `is_active = false`) | Nothing — `is_adviser()` is false, so the RPC raises. Such an account is already held at `PendingApprovalView` by `App.tsx`. |
| **Coordinator** | **Loses** the create-section button and dialog. Keeps viewing every section, assigning/reassigning/removing advisers, bulk assignment, filters, the drawer and `deleteSection`. Receives a notification when an adviser creates a section. |
| **Admin** | Unchanged. Retains the coordinator-equivalent RLS rights on `sections`; does **not** get the adviser action (the guard is `is_adviser()`). |
| **Student** | Unchanged. A new section name becomes selectable in onboarding through the existing `buildSectionOptions` (which already offers A–J whether or not a row exists). |
| **Company** | No access to this area. Unchanged. |

---

## 8. REQUESTED CHANGE — implement exactly this

### 8.1 New SQL migration — `supabase_adviser_create_section.sql`

Idempotent, re-runnable, standalone. Follow the house style of `supabase_adviser_sections_fix.sql`:
a header comment explaining *why*, `CREATE OR REPLACE FUNCTION`, `SECURITY DEFINER`,
`SET search_path = public`, `COMMENT ON FUNCTION`, then the grants, then
`NOTIFY pgrst, 'reload schema';`.

```sql
/**
 * Adviser: create one of their own sections and take it in the same step.
 *
 * Section creation used to be coordinator-only, which made every new section a
 * request. The adviser is the person who knows their own sections, so they may
 * now add one — but only inside their own course family, because
 * trg_validate_adviser_course_assignment (and the SIL rules it encodes) allow a
 * DHT section only for an HT Adviser and a DIT section only for an IT Adviser.
 *
 * SECURITY DEFINER on purpose: advisers hold no INSERT privilege on
 * public.sections or public.adviser_sections, and they must not be given one.
 * This function is the whole of the adviser's write access, and it re-derives the
 * course code from the caller's own profile rather than trusting any argument.
 *
 * The name grammar mirrors src/utils/sections.ts (COURSE-YEARLETTER, years 1–4,
 * letters A–J). Keep the two in step.
 */
CREATE OR REPLACE FUNCTION public.adviser_create_section(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name    text := upper(btrim(coalesce(p_name, '')));
    v_type    text;
    v_course  text;
    v_dept    uuid;
    v_code    text;
    v_section public.sections;
BEGIN
    IF NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Unauthorized: only an active Section Adviser may create a section.';
    END IF;

    SELECT adviser_type, course, department_id
      INTO v_type, v_course, v_dept
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    -- The adviser's own course family. Mirrors AdviserDashboard's derivation, but
    -- server-side, and refuses rather than defaulting when it cannot be resolved.
    v_code := CASE
        WHEN v_type = 'HT Adviser' THEN 'DHT'
        WHEN v_type = 'IT Adviser' THEN 'DIT'
        WHEN upper(btrim(coalesce(v_course, ''))) IN ('DHT','DIT') THEN upper(btrim(v_course))
        ELSE NULL
    END;

    IF v_code IS NULL THEN
        RAISE EXCEPTION 'Your adviser profile has no course assigned. Ask the SIL/OJT Coordinator to set your adviser type before adding a section.';
    END IF;

    IF v_name !~ '^[A-Z0-9]{2,10}-[1-4][A-J]$' THEN
        RAISE EXCEPTION 'Invalid section name "%". Use the COURSE-YEARLETTER format, for example %-1A, with a year of 1 to 4 and a letter of A to J.', v_name, v_code;
    END IF;

    IF split_part(v_name, '-', 1) <> v_code THEN
        RAISE EXCEPTION 'You may only create % sections. "%" belongs to another course.', v_code, v_name;
    END IF;

    IF EXISTS (SELECT 1 FROM public.sections WHERE upper(btrim(name)) = v_name) THEN
        RAISE EXCEPTION 'Section % already exists. Ask the SIL/OJT Coordinator to assign it to you.', v_name;
    END IF;

    INSERT INTO public.sections (name, course_code, department_id)
    VALUES (v_name, v_code, v_dept)
    RETURNING * INTO v_section;

    -- Creating without holding it would leave an orphan section only the
    -- coordinator could resolve, so the assignment is part of the same transaction.
    INSERT INTO public.adviser_sections (adviser_id, section_id, assigned_by, status, assigned_at)
    VALUES (auth.uid(), v_section.id, auth.uid(), 'active', now());

    RETURN jsonb_build_object(
        'id',            v_section.id,
        'name',          v_section.name,
        'course_code',   v_section.course_code,
        'department_id', v_section.department_id
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Two advisers pressing Add at the same moment; sections.name is UNIQUE.
        RAISE EXCEPTION 'Section % already exists. Ask the SIL/OJT Coordinator to assign it to you.', v_name;
END;
$$;

COMMENT ON FUNCTION public.adviser_create_section(text) IS
    'Lets an active Section Adviser create a section in their own course family and assign themselves to it. Course code and department are derived from the caller''s profile, never from the client.';

REVOKE ALL  ON FUNCTION public.adviser_create_section(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adviser_create_section(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

Deliberate choices — keep them:

* **The client passes only `p_name`.** Course code, department and adviser id are all derived from
  `auth.uid()`. Never add a `p_course_code` parameter; that would hand the course check to the caller.
* `department_id` comes from the adviser's own profile and may legitimately be `NULL` (the coordinator
  flow always produced `NULL`). Do not invent a department.
* The pre-check plus the `unique_violation` handler both exist: the first gives the good message, the
  second closes the race.
* The insert into `adviser_sections` is **not** wrapped in an exception block — a section created
  without its assignment would be worse than a failed create.
* No `status`/`is_active` column is added to `sections`; deletion stays the Coordinator's
  `deleteSection`.

### 8.2 `src/utils/sections.ts`

Append one pure helper (and export it). It is the **UI mirror** of the SQL guard; say so in the
comment, as the file already does for `canonicalSectionName`.

```ts
/**
 * Is this a section name an adviser may create for `courseCode`?
 *
 * The mirror of the guard in `public.adviser_create_section`: COURSE-YEARLETTER,
 * year 1–4, letter A–J, and the prefix must be the adviser's own course. Returns
 * null when the name is acceptable, or the message to show. Keep in step with the SQL.
 */
export function validateNewSectionName(name: string, courseCode: string): string | null
```

Implement it with the helpers that already exist (`courseCodeFromValue`, `parseSectionName`,
`SECTION_LETTERS`, `SECTION_YEARS`) rather than a second regex. **Do not change** `SECTION_LETTERS`,
`YEAR_LEVELS`, `SECTION_YEARS`, `parseSectionName`, `buildSectionName`, `canonicalSectionName`,
`studentMatchesSection` or `buildSectionOptions` — several of them are relied on by onboarding, by
the coordinator roster matching and by the SQL mirror.

### 8.3 `src/services/adviserService.ts`

Add immediately **after `getMySectionsFallback`**, in the file's own 4-space style:

```ts
/**
 * Creates a section in the adviser's own course family and assigns it to them.
 *
 * Advisers hold no INSERT privilege on `sections`, so this is an RPC-only path —
 * there is deliberately no table-insert fallback: if the function is not deployed,
 * a direct insert would fail on RLS anyway, so say what is actually wrong.
 */
async createSection(name: string): Promise<Section> {
    const { data, error } = await supabase.rpc('adviser_create_section', {
        p_name: name.trim().toUpperCase(),
    });

    if (error) {
        if (isMissingFunction(error)) {
            throw new Error('Adding sections is not available yet — run supabase_adviser_create_section.sql.');
        }
        console.error('Error creating section:', error);
        throw asError(error, 'Failed to create the section.');
    }

    const row = data as { id: string; name: string; course_code: 'DHT' | 'DIT'; department_id: string | null };

    try {
        await createAuditLog({
            action: 'CREATE',
            module: 'User Management',
            description: `Created section ${row.name} (${row.course_code}) and self-assigned as its Section Adviser`,
            targetType: 'section',
            targetId: row.id,
            targetName: row.name,
        });
    } catch { /* a failed activity log must never undo the section */ }

    try {
        await notificationService.notifyRoles(
            ['coordinator'],
            'New Section Created by an Adviser',
            `Section ${row.name} (${row.course_code}) was created by its Section Adviser.`,
            { notificationType: 'assignment', relatedType: 'section', relatedId: row.id },
        );
    } catch { /* the coordinator's notice is not worth failing the create over */ }

    return { ...row, student_count: 0, created_at: new Date().toISOString() };
},
```

`notificationService` and `createAuditLog` are already imported at the top of this file — do not
re-import. Keep the returned object shape assignable to the existing `Section` interface; do not
widen or edit that interface.

### 8.4 `src/components/AdviserSectionsView.tsx`

1. Props become:

```ts
interface AdviserSectionsViewProps {
    onSelectSection?: (sectionName: string) => void;
    /** The adviser's course family, for the sections they may create. */
    course: 'DHT' | 'DIT';
    /** Lets the dashboard refresh the "My Sections" badge after a create. */
    onActionComplete?: () => void;
}
```

2. State beside the existing hooks: `showAddModal`, `newYear` (default `1`), `newLetter`
   (default `'A'`), `creating`, `createError`, `successMessage`.

3. The composed name is derived, never typed:
   `const newSectionName = buildSectionName(course, newYear, newLetter);`
   with `import { buildSectionName, validateNewSectionName, SECTION_LETTERS, SECTION_YEARS, YEAR_LEVELS } from '../utils/sections';`

4. Handler, modelled on the existing `loadSections` / `loadSectionStudents` shape (same
   `console.error` + message-extraction style):

```ts
const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewSectionName(newSectionName, course);
    if (problem) { setCreateError(problem); return; }

    setCreating(true);
    setCreateError(null);
    try {
        const created = await adviserService.createSection(newSectionName);
        setShowAddModal(false);
        setSuccessMessage(`Section ${created.name} created and assigned to you.`);
        // Re-read rather than patching local state: the count and the assignment
        // both come from the server.
        const data = await adviserService.getMySections();
        setSections(data);
        const fresh = data.find(s => s.id === created.id);
        if (fresh) loadSectionStudents(fresh);
        onActionComplete?.();
    } catch (err) {
        console.error('Failed to create section:', err);
        setCreateError(err instanceof Error ? err.message : 'Failed to create the section.');
    } finally {
        setCreating(false);
    }
};
```

   Clear `successMessage` on a timer the way `CoordinatorAdvisersView.showSuccess` does
   (4 s), or on the next action — pick one and be consistent.

5. **Both** places need the action, because a first-time adviser only ever sees the empty state:
   * the `sections.length === 0` early return ("No Sections Assigned"): keep the existing copy, and
     add an **Add Section** primary button under it — the *"Please contact the SIL/OJT Coordinator"*
     line should now read as the fallback for a section that already exists, not the only option;
   * the normal header block (beside *"{n} sections assigned to you…"*), right-aligned, as
     `cd-btn cd-btn-primary`.
   Leave the `loading` and `sectionsError` early returns **exactly** as they are — a failed query
   must still never offer a create button in place of *Try Again*.

6. The dialog reuses the **adviser** dialog pattern already in `AdviserDashboard.css`, as used by
   `AdviserApprovalsView` (lines ~750–860) — not the coordinator's `cam-*` classes:

```tsx
<div className="modal-overlay" onClick={() => !creating && setShowAddModal(false)}>
  <div className="ad-dialog" role="dialog" aria-modal="true"
       aria-labelledby="ad-dialog-title" aria-describedby="ad-dialog-subtitle"
       onClick={e => e.stopPropagation()}>
    <div className="ad-dialog__header"> … ad-dialog__title / ad-dialog__subtitle / ad-dialog__close … </div>
    <form onSubmit={handleCreateSection}>
      <div className="ad-dialog__body">
        …  ad-dialog__group-label, ad-dialog__field, ad-dialog__label, ad-dialog__hint
           Course: read-only text showing `course` + its full name
           Year:   <select> over SECTION_YEARS, labelled with YEAR_LEVELS[y-1]
           Letter: <select> over SECTION_LETTERS
           A preview line showing the composed `newSectionName`
           {createError && <div className="ad-dialog__error" role="alert">…</div>}
      </div>
      <div className="ad-dialog__footer">
        ad-dialog__btn ad-dialog__btn--secondary  Cancel   (disabled={creating})
        ad-dialog__btn ad-dialog__btn--primary    Add Section / "Adding…"  (disabled={creating})
      </div>
    </form>
  </div>
</div>
```

   Title **"Add a Section"**; subtitle *"The section is created in your course and assigned to you.
   Students join it by selecting it during onboarding."* The course field is **display-only** — the
   adviser must not be able to pick DHT vs DIT, because the server will refuse it anyway.

7. **No new CSS.** Every class above already exists in `AdviserDashboard.css` (`.ad-dialog*`,
   `.section-card*`, `.adviser-course-pill`) or in the shared stylesheets (`.modal-overlay`,
   `.admin-table-card`, `.cd-btn`).

### 8.5 `src/components/AdviserDashboard.tsx`

Pass the two new props — `course` is already computed on line ~161:

```tsx
{currentView === 'sections' && (
    <AdviserSectionsView
        onSelectSection={(secName) => navigateTo('students', secName)}
        course={course as 'DHT' | 'DIT'}
        onActionComplete={refreshStats}
    />
)}
```

Change nothing else in this file — not the `View` union, not the sidebar, not `viewTitles`, not the
onboarding gate.

### 8.6 `src/components/CoordinatorAdvisersView.tsx` — the removal

Delete, precisely:

* `showSectionModal` state (≈149–151 block, that one line);
* `newSectionName` / `newSectionCourse` state (≈178–179) and the *"Create section form state"* comment;
* `handleCreateSection` (≈485–502);
* the header **New Section** button (≈809–815). *Add Adviser* stays the only header action and keeps
  `cam-btn cam-btn-primary`;
* the whole **DIALOG: CREATE SECTION** block (≈1793–1865);
* the **New Section** button inside the Sections-tab empty state (≈1265–1268).

Then fix what the removal leaves behind:

* The Sections-tab empty state must no longer tell the Coordinator to create one. When
  `sections.length === 0`, keep the title *"No sections available"* and change the text to:
  *"Sections are created by Section Advisers. Once an adviser adds one it appears here, ready for
  assignment."* The `hasSectionFilters` → *Reset filters* branch stays exactly as it is; the
  `cam-empty-actions` wrapper should render nothing in the "no sections at all" case (or be omitted
  for that branch) rather than keeping an empty box.
* If `yearLabelOf` / `parseSectionName` become unused in this file after the dialog goes, remove only
  the now-dead local helper and the now-unused named import — **do not** touch
  `studentMatchesSection` or `YEAR_LEVELS` if they are still used elsewhere in the file. Check with
  the compiler and the linter; do not guess.
* Leave `error` / `setError`, `submitting`, `showSuccess`, the assignment flows, the drawer, the
  tables, the pagination and every filter untouched.
* `CoordinatorAdvisersView.css` is **not** edited. The `cam-dialog*` classes are still used by the
  *Add Adviser* and *Assign* dialogs.

### 8.7 `src/services/coordinatorService.ts`

Delete the `createSection(name, courseCode, departmentId?)` method (≈1477–1508) together with its
doc comment, since line 492 was its only caller. Keep `deleteSection`, `getAllSections`,
`getAllAdvisers`, `assignAdviserToSection(s)`, `removeAdviserFromSection`,
`reassignSectionAdviser`, `bulkUpdateSectionName`, `updateStudentSection` and
`countStudentsBySection` exactly as they are. **Do not** remove or weaken the
*"Coordinators and Admins can manage sections"* RLS policy — `deleteSection` and the assignment
RPCs depend on the coordinator/admin rights, and an admin repair path must stay open.

---

## 9. EXPECTED BEHAVIOUR

**Adviser**

* *My Sections* header shows **Add Section**; a brand-new adviser sees the same action inside the
  *No Sections Assigned* panel.
* The dialog shows their course read-only, a Year select (1st–4th Year) and a Letter select (A–J),
  and a live preview such as `DIT-3B`.
* Confirm → dialog closes, success message, the list re-loads, the new card is selected and its
  roster reads *"There are currently no students enrolled in DIT-3B."*, and the sidebar
  *My Sections* badge increases.
* A name that already exists → the error message inside the dialog, naming the section and telling
  them to ask the Coordinator to assign it. Nothing is created.
* An HT Adviser can never produce a `DIT-…` section: the course field is fixed, and the RPC refuses
  it even if called directly.
* An adviser whose profile has neither `adviser_type` nor a `DHT`/`DIT` course gets the "no course
  assigned" message. (In practice `AdviserDashboard` holds such an account at
  `AdviserOnboardingView` until `adviser_type` is set.)

**Coordinator**

* *Adviser & Section Management* has **one** header action, *Add Adviser*. There is no way to create
  a section anywhere on the page.
* The Sections tab still lists every section — including adviser-created ones, each already showing
  its adviser — and still filters, assigns, reassigns, bulk-assigns and removes exactly as before.
* A notification arrives naming the section and its course when an adviser adds one.
* With zero sections in the database, the empty state explains that advisers create them.

**Student** — onboarding's section dropdown already offers A–J per course/year via
`buildSectionOptions`, so a newly created row changes nothing functionally; a student who picks
`DIT-3B` is then matched into it by `canonicalSectionName`, and the adviser's roster and student
count pick them up on the next load.

---

## 10. UI / UX

Follow the existing visual language; introduce no new pattern.

* The adviser dialog is `.ad-dialog` inside `.modal-overlay` — the same component shape as the
  Approvals dialog. Do not import the coordinator's `cam-*` classes into an adviser view, and do not
  use `window.confirm`, a toast library, or a new modal component.
* *Add Section* is `cd-btn cd-btn-primary` in the header (there is no competing primary action in
  this view) and the same in the empty state.
* Compact and information-dense: two selects and a preview line, no stepper, no icon set, no
  illustration, no emoji, no gradient, no animation beyond the dialog's existing
  `ad-dialog-in` keyframe.
* Keep the module's voice: plain sentences, no exclamation marks, *"SIL/OJT Coordinator"* and
  *"Section Adviser"* capitalised as they already are in these files.
* Dark mode and the ~390 px layout come free from the existing classes — verify them, do not
  re-style.
* Coordinator side: removing the button must not leave a stray flex gap, an empty
  `cam-header-actions`/`cam-empty-actions` box, or an orphaned separator.

---

## 11. SECURITY

* Authorization lives in the **RPC**: `public.is_adviser()` (adviser **and** active), the course code
  derived from the caller's own profile, the name grammar, the course-prefix match, and the
  uniqueness check. The dialog's fixed course field and the client validator are convenience only.
* `SECURITY DEFINER` + `SET search_path = public`, matching every other function in this area.
* `REVOKE ALL … FROM PUBLIC, anon;` then `GRANT EXECUTE … TO authenticated;` — mirroring
  `supabase_notifications_system.sql`. No `service_role` special-casing.
* **Add no RLS policy and no INSERT/UPDATE/DELETE grant on `public.sections` or
  `public.adviser_sections`.** Advisers must remain unable to write those tables directly; that is
  precisely what makes the RPC the only path.
* Do not remove or relax the existing coordinator/admin policies, and do not touch
  `trg_validate_adviser_course_assignment` — the new insert is expected to satisfy it, not bypass it.
* Nothing is accepted from the client except the section name; course code, department, adviser id
  and `assigned_by` all come from `auth.uid()`.
* `notifyRoles` is the only supported notification writer; do not insert into `user_notifications`.

---

## 12. EDGE CASES

1. **The name already exists (assigned or not)** → the pre-check raises with a message naming the
   section; no row is created. Advisers do **not** get to claim an existing unassigned section — that
   stays the Coordinator's assignment flow, and is out of scope.
2. **Two advisers create the same name simultaneously** → `sections.name` is UNIQUE; the
   `unique_violation` handler turns `23505` into the same friendly message.
3. **The section insert succeeds but the assignment insert fails** (e.g. the course trigger raises on
   a profile whose `adviser_type` and `course` disagree) → one transaction, so both roll back. Do not
   add an exception block that would let an orphan section through.
4. **Adviser profile with `adviser_type = 'HT Adviser'` but `course = 'DIT'`** → `adviser_type` wins
   (the same precedence `AdviserDashboard` already uses); the trigger then agrees, because it accepts
   either the type or the course.
5. **Inactive adviser** → `is_adviser()` is false → raise. Also already gated by `App.tsx`.
6. **`department_id IS NULL`** on the adviser's profile → the section gets `NULL`, exactly like every
   coordinator-created section today. Not an error.
7. **RPC not deployed** → `isMissingFunction` gives the "run the migration" message. No fallback
   insert (RLS would reject it and the error would be unreadable).
8. **Double submit** → `disabled={creating}` on the primary button; a second call raises "already
   exists" anyway.
9. **Create while a roster load is in flight** → the existing `pendingSectionId` ref already prevents
   a stale roster from landing; selecting the new section after the re-read updates that ref.
10. **Year or letter outside range** (hand-edited DOM, or a direct RPC call) → the SQL regex
    `^[A-Z0-9]{2,10}-[1-4][A-J]$` refuses it.
11. **A coordinator or admin calling `adviser_create_section` directly** → `is_adviser()` is false →
    raise. They still have their RLS rights for repair work; that is intentional.
12. **A section is created, then the coordinator reassigns it to another adviser** →
    `coordinator_assign_adviser_section` upserts on `(section_id)`; the creator simply loses it from
    *My Sections*. Unchanged behaviour, and correct.

---

## 13. REGRESSION PROTECTION — must remain true afterwards

* `sections` and `adviser_sections` still grant write access to **coordinator/admin only**; no new
  policy, no new grant, `trg_validate_adviser_course_assignment` byte-identical.
* `unique_active_section_assignment UNIQUE (section_id)` and `sections.name UNIQUE` unchanged — one
  adviser per section, and globally unique names.
* `get_adviser_sections`, `get_adviser_section_students`, `get_adviser_students`,
  `canonical_section_name`, `coordinator_assign_adviser_section`,
  `coordinator_remove_adviser_section`, `adviser_approve_student`, `adviser_reject_student`,
  `notify_users`, `notify_roles` are **unchanged**.
* `src/utils/sections.ts` keeps `SECTION_LETTERS` A–J, `SECTION_YEARS` 1–4, `YEAR_LEVELS`, and the
  exact behaviour of `parseSectionName`, `buildSectionName`, `canonicalSectionName`,
  `studentMatchesSection` and `buildSectionOptions`. Student onboarding and every roster match depend
  on them, and `canonical_section_name` in SQL must still agree with `canonicalSectionName`.
* The three early returns in `AdviserSectionsView` keep their order and meaning: a failed query still
  shows *"Could not load your sections" + Try Again*, never an empty state and never a create button.
* `getMySections`' RPC-first / fallback structure, and `isMissingFunction`'s "any other error is
  re-thrown" rule, are untouched.
* `CoordinatorAdvisersView` keeps: both tabs, every filter, search, pagination, the adviser/section
  drawer with its roster, *Add Adviser*, activate/deactivate, single + multi + bulk assignment,
  remove-assignment, the `cam-*` styling, and the mobile card layout at ≤ 780 px.
* `coordinatorService.deleteSection`, `getAllSections` (with its `student_count` / `assignment` /
  `adviser_*` shape, consumed by `SectionItem`), `bulkUpdateSectionName` and `countStudentsBySection`
  unchanged.
* `AdviserDashboard`'s `View` union, sidebar, badges, `viewTitles`, onboarding gate and every other
  adviser view untouched; `App.tsx` routing untouched.
* No new npm dependency, no new provider/context, no change to `src/lib/supabaseClient.ts`, no CSS
  file edited, no file renamed, no unrelated reformatting.

---

## 14. IMPLEMENTATION CONSTRAINTS

* Read, in full, before writing anything: `supabase_adviser_schema.sql`,
  `supabase_adviser_sections_fix.sql`, `supabase_sections_a_to_j.sql`, `src/utils/sections.ts`,
  `src/services/adviserService.ts`, `src/components/AdviserSectionsView.tsx`,
  `src/components/AdviserApprovalsView.tsx` (for the `.ad-dialog` markup),
  `src/components/AdviserDashboard.tsx`, and the six regions of
  `src/components/CoordinatorAdvisersView.tsx` listed in §2.5.
* Mirror the neighbours: `coordinator_assign_adviser_section` for the SQL (guard order, error voice,
  `jsonb_build_object` return), `adviserService.getMySections` for the service method (RPC →
  `isMissingFunction` → `asError`, best-effort audit/notify in swallowing `try/catch`), and
  `AdviserApprovalsView`'s dialog for the component.
* Comment style: these files explain **why**, not what. Match that register, and keep the existing
  4-space indentation per file.
* TypeScript strict: no `any`, no non-null assertions, no `@ts-ignore`. `Section` stays as declared.
* Do not rename anything, do not reorder existing functions, do not reformat untouched lines, and do
  not refactor anything you were not asked to change.
* **[UNCONFIRMED] — verify, don't assume:** whether `supabase_sections_a_to_j.sql` has already seeded
  the name an adviser is likely to try first; whether `public.departments` is populated for advisers
  in this environment (it only affects `department_id` and the notification's optional department
  filter); and whether any Edge Function or SQL file outside the ones listed writes to
  `public.sections`. Grep for `from('sections')` and `INSERT INTO public.sections` across the repo
  before you finish, and report anything you find rather than adapting silently.

---

## 15. VERIFICATION — do all of these before reporting done

**Build / static**

* `npx tsc -b` (or `npm run build`) passes with no new errors — in particular, no unused-import or
  unused-variable error left behind in `CoordinatorAdvisersView.tsx` or `coordinatorService.ts`.
* `npx eslint src/utils/sections.ts src/services/adviserService.ts src/services/coordinatorService.ts src/components/AdviserSectionsView.tsx src/components/AdviserDashboard.tsx src/components/CoordinatorAdvisersView.tsx`
  reports nothing new.
* `npx vitest run src/utils/sections.test.ts` passes, including new cases:
  `validateNewSectionName('DIT-3B','DIT') === null`; non-null for `'DIT-5A'` (year), `'DIT-3K'`
  (letter), `'DHT-3B'` against `'DIT'` (course), `'3B'` and `''` (format); and the existing
  `parseSectionName` / `canonicalSectionName` / `buildSectionOptions` cases still pass untouched.
* Grep the repo: **zero** references to `createSection` on the coordinator side and **zero**
  remaining `showSectionModal` / `newSectionName` / `newSectionCourse` identifiers.

**SQL** (apply `supabase_adviser_create_section.sql`, then apply it a second time to prove it is
re-runnable)

* Active IT Adviser, unused name → returns `{id,name,course_code:'DIT',department_id}`; one new
  `sections` row with `department_id` equal to that adviser's profile value; one new
  `adviser_sections` row with `adviser_id = assigned_by = the adviser`, `status='active'`.
* The same call again → raises "already exists"; **no** second `sections` row.
* IT Adviser passing `'DHT-1A'` → raises; nothing inserted.
* Bad names `'DIT-5A'`, `'DIT-3K'`, `'DIT3A'`, `'dit-3a'` (should normalise and succeed), `''` →
  behave as specified.
* An adviser with `is_active = false` → raises. A coordinator → raises. An admin → raises.
  A student → raises. Nothing inserted in any case.
* `get_adviser_sections()` as that adviser now includes the new section with `student_count = 0`;
  `get_adviser_section_students(<new id>)` returns zero rows **without** raising.
* `SELECT` the policies on `sections` and `adviser_sections` and confirm they are unchanged
  (`pg_policies`), and that no grant beyond `SELECT` exists for `authenticated`.

**UI — signed in as an adviser**

* Header *Add Section* → dialog → year/letter → preview correct → Add → success message, new card
  selected, roster empty state, sidebar badge incremented.
* An adviser with no sections sees *Add Section* in the *No Sections Assigned* panel and can create
  their first section from there.
* Duplicate name → error inside the dialog; Cancel changes nothing; Escape/backdrop click closes
  without creating (and is blocked while `creating`).
* Course field cannot be changed. An HT Adviser only ever composes `DHT-…`.
* Reload → the section is still there, still theirs.
* Check light **and** dark mode, and the layout at ~390 px.

**UI — signed in as the coordinator**

* *Adviser & Section Management* shows only *Add Adviser* in the header; no create-section entry
  point anywhere, including the Sections-tab empty state.
* The adviser-created section appears in the Sections tab with that adviser in the Adviser column,
  its year label resolved, and a student count of 0; search, the course/assignment/adviser filters,
  the drawer, reassign and remove-assignment all still work on it.
* The notification arrived, naming the section and course.
* Assign that section to a second adviser → it moves out of the creator's *My Sections* on their next
  load (the unique `section_id` constraint guarantees this).

**UI — signed in as a student**

* Onboarding's section dropdown still lists A–J for the chosen course/year, now including the new
  row, and selecting it puts the student on that adviser's roster and student count.

---

### One-line summary for the agent

Add a single `SECURITY DEFINER` RPC `public.adviser_create_section(text)` that lets an active Section
Adviser create a section in their own course family and self-assign it in one transaction, expose it
as `adviserService.createSection` + a `validateNewSectionName` mirror + an *Add Section* button and
`.ad-dialog` in `AdviserSectionsView`, and delete the Coordinator's *New Section* button, dialog,
state, handler and `coordinatorService.createSection` — changing no table, no RLS policy and nothing
else about how sections are assigned.

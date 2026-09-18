# CODING-AGENT PROMPT — Admin force control: DTR submissions, grading sheets, clock records

> Repository: `C:\Users\stewa\monitoring-system` (Asian College SIL Monitoring System)
> Supabase project ref: `ncwesnnihbyghasbnemd` **[CONFIRMED]** (`supabase/.temp/project-ref`)
> Source inventory: `claude/analysis-admin-force-control-inventory.md`, Tier 1 items 1–3.
> Prerequisite: `claude/prompt-admin-privilege-hardening.md`. Its SQL (`supabase_admin_privilege_hardening.sql`) and `App.tsx` changes are present in the repo. **Phase 0 confirms they are live.**
>
> Run **Phase 0 (Section 15)** before you edit anything. Its STOP gates are mandatory.

---

## 1. CONTEXT

Three workflows can leave a student unable to finish SIL, and today an administrator has no way to move them forward:

| # | Workflow | Where it gets stuck |
|---|---|---|
| A | **Final DTR submission** | Only the one adviser the DTR was sent to can review it. Approval is final. If that adviser leaves, the submission has nobody who can review it. |
| B | **Official Grading Sheet** | `finalized` is a dead end ("read-only for everybody"). The admin portal has no grading screen, even though the RPCs already admit admins. |
| C | **Clock-in/out records (`timesheets`)** | A missing clock-out, a missing clock-in, a reversed range or an over-limit day **blocks DTR submission**. No audited admin correction path exists. |

This task adds **admin-only, reason-required, server-audited overrides** for these three. The rules:

- Every override is a `SECURITY DEFINER` RPC gated by `public.is_admin()`.
- Every override writes its audit trail in the same transaction.
- Every override notifies the users it affects.
- Every existing guard for non-admin roles stays exactly as it is.

Affected roles:

- **Admin:** new controls.
- **Student:** sees the results and gets notifications.
- **Adviser:** receives reassigned or reopened work.
- **Coordinator:** notified on grading reopen. No new powers.

---

## 2. CURRENT IMPLEMENTATION (verified in repo)

### A. DTR submissions — `supabase_dtr_submissions.sql` **[CONFIRMED]**

**Tables**

- `dtr_submissions`:
  - `status ∈ ('pending','approved','revision_requested')`.
  - `adviser_id` references `auth.users ON DELETE SET NULL` and is resolved **once, at submit time** (l.50-75).
  - The unique partial index `dtr_submissions_one_active (student_id) WHERE status <> 'approved'` allows one open submission per student (l.79).
- `dtr_submission_events`:
  - `event` is limited by CHECK to `('submitted','resubmitted','revision_requested','approved')` (l.90).

**RLS**

- Read-only. There are no write policies; every write goes through a DEFINER RPC.
- Staff read policy: `"Staff read DTR submissions"` (l.116).

**RPCs**

- `compute_student_dtr(uuid)` (internal):
  - Blocking flags: `f_missing_out`, `f_missing_in`, `f_invalid`, `f_over_limit` (l.226-240).
  - `can_submit = total ≥ required AND blocking_days = 0 AND recorded_days > 0` (l.332).
  - Timesheets with `approval_status = 'rejected'` are **excluded** (l.200).
  - Required hours come from `profiles.required_ojt_hours`, falling back to `ojt_default_required_hours()` (l.180).
- `resolve_student_adviser(uuid)` (internal, l.355): the student's canonical section → `adviser_sections` row with `status = 'active'`.
- `get_my_dtr_status()`:
  - Reads the **latest** submission by `submitted_at`.
  - States: `pending_review | approved | revision_required | ready | in_progress`.
- `submit_my_dtr()`:
  - Upserts on the partial index.
  - Returns `already_pending` when a submission is already pending.
  - A `revision_requested` row is **resubmitted in place** (`attempt + 1`).
  - Notifies the adviser with `action_path '/adviser/approvals?tab=dtr'`.
- `get_adviser_dtr_submissions(p_status)`: adviser-only, filters `adviser_id = auth.uid()`.
- `get_dtr_submission(p_id)`: allows the student, the addressed adviser, **or `account_type IN ('admin','coordinator')`** (l.639-643).
- `review_dtr_submission(p_id, p_action, p_remarks)`:
  - Only for `account_type = 'adviser'` **and** `adviser_id = auth.uid()` (l.702-709).
  - Only while `status = 'pending'` (l.713).
  - `request_revision` requires remarks.
  - Writes an event and notifies the student (`notification_type 'dtr_approved' | 'dtr_revision'`, `action_path '/student/dtr'`).

**Frontend**

- `src/services/dtrSubmissionService.ts`:
  - Types `DtrStatus`, `DtrState`, `DtrSubmissionRow`, `DtrSubmissionDetail`.
  - `mapDtrError` passes short server messages through as-is.
- `src/services/adviserService.ts:796` `reviewDtrSubmission`: calls the RPC, then writes a **browser** audit row (`module: 'Attendance'`).
- `src/components/AdviserDtrReviewModal.tsx` (props `submissionId`, `onClose`, `onReviewed`):
  - Renders the **snapshot**, the history (`DTR_EVENT_LABEL`) and a confirm dialog.
  - Actions show only while `isPending`.
- `src/components/StudentDtrSubmission.tsx`: the student panel. Its history uses `DTR_EVENT_LABEL`.
- `src/utils/dtrFormat.ts`: `DTR_STATUS_LABEL`, `DTR_EVENT_LABEL`, `formatDtrHours`, `formatDtrPeriod`. Tested by `src/utils/dtrFormat.test.ts`.
- `src/components/DtrStatusBadge.tsx`, `src/components/DtrSubmission.css`.
- **The admin portal has no DTR-submission screen.** `ApprovalsView`'s `dtr` tab (`ApprovalsView.tsx:226`) is the **legacy per-timesheet** approval (`coordinatorService.getPendingTimesheets` / `updateTimesheetStatus` set `timesheets.approval_status`). It is unrelated to `dtr_submissions`. **Do not change it.**

### B. Official Grading Sheet — `supabase_grading_sheet.sql` (+ `supabase_grading_sheet_withdraw.sql`) **[CONFIRMED]**

**Tables**

- `grading_sheets`:
  - `status ∈ ('draft','for_review','verified','finalized')`.
  - `adviser_id` is NOT NULL and `ON DELETE RESTRICT`.
  - Also carries: `return_reason / returned_at / returned_by`, `submitted_at`, `verified_at / verified_by`, `finalized_at / finalized_by`.
  - One sheet per `(section_id, school_year_id)`.
- `grading_sheet_items`: `final_grade`. Remarks are derived by the `grading_item_remarks` trigger.
- `grade_audit_logs`: immutable. An UPDATE trigger raises; there is no DELETE grant.

**No client write path**

`authenticated` has SELECT only on all grade tables (l.1281-1290). Every change goes through a DEFINER function.

**Helpers**

- `current_account_type()` and `can_view_grading_sheet()` do **not** check `is_active` [CONFIRMED in repo].
- `can_view_grading_sheet` returns true for any admin (l.330).

**Workflow RPCs**

- `open_grading_sheet(section, term)` (adviser only, l.478):
  - Creates the sheet if missing.
  - **Reassigns** `adviser_id` to the caller when the section changed hands. This writes a `'reassign'` audit row.
  - Then calls `sync_grading_sheet_roster` **when status is `draft` or `for_review`** (l.537).
- `sync_grading_sheet_roster`:
  - Adds **current** members of the section.
  - Deletes ungraded non-members.
- `save_grading_sheet_grades` and `submit_grading_sheet`: owning adviser plus `is_adviser()`, draft only.
- `withdraw_grading_sheet`: adviser, `for_review` → `draft`.
- `verify_grading_sheet`, `return_grading_sheet`, `finalize_grading_sheet`:
  - Allowed for `current_account_type() IN ('coordinator','admin')` plus `can_view_grading_sheet`.
  - `return` accepts `for_review` or `verified`. It clears `submitted_at`, `verified_*` and sets `return_reason`.
  - `finalize` accepts `verified` only.
  - **No function leaves `finalized`.**
- `get_coordinator_grading_sheets(p_status)`: coordinator or admin, but **excludes `draft`** (l.697).
- `get_my_grading_sheets()`: rows where `adviser_id = auth.uid()`, including `return_reason`.

**Frontend**

- `src/services/gradingService.ts`:
  - Each method calls the RPC, then a best-effort **browser** `createAuditLog` (`module: 'Grading'`).
  - `asError` keeps the server message.
- `src/utils/grading.ts`:
  - `STATUS_LABELS`, `STATUS_DESCRIPTIONS` (`finalized: 'Closed academic record. Read-only for everyone.'`).
  - `canVerify`, `canReturn`, `canFinalize`.
  - `AUDIT_ACTION_LABELS` (l.239). It already contains `reassign`.
  - Tested by `src/utils/grading.test.ts`.
- `src/components/CoordinatorGradingView.tsx` (no props):
  - Filters `for_review | verified | finalized | all`.
  - Opens the sheet modal, `GradingSheetPreviewModal` and `GradeHistoryModal`.
  - Has a return-reason modal.
  - Imports `CoordinatorDashboard.css` and `GradingSheet.css`.
  - Mounted **only** in `CoordinatorDashboard.tsx`.
- `src/components/AdviserGradingView.tsx`:
  - Opens sheets through `openSheet(section, term)`, then `getSheet`.
  - Shows a "returned for correction" alert when `return_reason && status === 'draft'` (l.462, l.786).

### C. Clock records — `timesheets` **[CONFIRMED from usage; full DDL not in the repo files reviewed]**

**Columns in use**

- Core: `id`, `user_id` (auth id), `clock_in`, `clock_out`, `break_start`, `break_end`.
- `status ∈ ('working','break','completed')`.
- Location: `clock_in_latitude/longitude`, `clock_out_latitude/longitude`.
- `requires_approval`, `photo_url`.
- `approval_status ∈ ('pending','approved','rejected')`.
- Limit tracking: `daily_limit_status ∈ ('NORMAL','LIMIT_REACHED','OVER_LIMIT')`, `over_limit_minutes`, `limit_notification_sent(_at)`. These come from `supabase_attendance_daily_limit.sql`.

Sources: `src/services/timeTracking.ts:8-28`.

**Writes**

- The student's browser writes directly:
  - `clockIn` inserts;
  - `clockOut`, `startBreak`, `endBreak` update (`timeTracking.ts:116-258`).
- RLS `"Coordinators and Admins can update timesheets"` is `FOR UPDATE USING (public.is_admin_or_coordinator())` (`supabase_admin_privilege_hardening.sql:1261`). **No UI uses it, and it would write no audit row.**
- `coordinatorService.updateTimesheetStatus` sets `approval_status` directly (the legacy tab).

**Rendered-time rules** (`supabase_attendance_daily_limit.sql`)

- `timesheet_worked_minutes(in, out, break_start, break_end, now)`.
- `attendance_daily_minutes(user, day)` excludes `rejected`.
- `attendance_time_zone()` reads `system_settings.ojt_hours.time_zone` (default Asia/Manila).
- `attendance_daily_limit_minutes()`.
- `attendance_limit_state(minutes, limit)`.
- `process_attendance_daily_limits(user)`:
  - Service-role only.
  - Updates `daily_limit_status/over_limit_minutes` **only for open records**, and may send notifications.
  - **Do not call it from the new RPCs.**

**Admin attendance** (`supabase_admin_attendance.sql`, re-hardened in `supabase_admin_rpc_hardening.sql:310+`)

- Read-only RPCs: `get_admin_attendance(date)`, `get_admin_student_attendance_summary`, `get_admin_student_attendance_history`.
- They return `timesheet_count` and `open_timesheet_count`, but **not individual sessions**.

**Admin UI** — `src/components/AdminAttendanceView.tsx`

- The detail drawer (`drawer.kind === 'detail'`, ~l.846-975) shows Time In/Out/Total, "Needs Attention", "Change History" and footer buttons "Student Summary" and "Edit/Record Attendance".
- "Edit/Record Attendance" opens `AttendanceRecordModal` → `attendanceService.recordAttendance` → `record_attendance` RPC (status only).
- Styles: `AdminAttendanceView.css` (`aav-*`) and `AttendanceView.css` (the modal).

**Client time-zone helpers** — `src/utils/attendanceLimit.ts`

- `attendanceDayKey(value, timeZone)`, `DEFAULT_TIME_ZONE`, `sessionWorkedMinutes`.
- `timeTrackingService.getDailyLimitConfig()` returns `{ limitMinutes, warningMinutes, timeZone }`.

### Shared

- `public.is_admin()` requires `account_type='admin' AND is_active AND registration_status='complete'` (`supabase_admin_privilege_hardening.sql:87`).
- `public.write_privileged_audit_log(...)` (l.448):
  - SECURITY INVOKER, not callable by API roles.
  - **Hard-codes `table_name`/`target_type = 'profiles'`**, so it does not fit these targets.
- The `audit_logs_stamp_actor` trigger only rewrites **browser** inserts (`current_user = 'authenticated'`).
- `AuditAction` / `AuditModule` unions: `src/services/auditService.ts:27-66`. The modules `'Attendance'`, `'Timesheets'` and `'Grading'` already exist.
- Notifications are written as a `user_notifications` insert. The existing webhook sends the email.
  - The `notification_type` CHECK is redefined in `supabase_dtr_submissions.sql:134-143`. Phase 0 reads the live list.
- Admin routing (`src/components/AdminDashboard.tsx`):
  - `type View` (l.47);
  - `validSlugs` (l.105; the comment explains that a missing slug makes the nav item inert);
  - nav items (`admin-nav-item`, ~l.268-340);
  - header titles (~l.360-376);
  - render blocks (`{currentView === '…' && (<div className="fade-in">…)}`, ~l.757-835).
- Tests: `npm test` runs `node --experimental-strip-types --test <explicit file list>` (`package.json`). **A new test file must be added to that list.**

---

## 3. EXISTING FILES (responsibilities)

| Path | Role in this task |
|---|---|
| `supabase_dtr_submissions.sql` | Read only. Source of the definitions you extend or call. |
| `supabase_grading_sheet.sql`, `supabase_grading_sheet_withdraw.sql` | Read only. `open_grading_sheet` is redefined in the **new** file (one-line change). |
| `supabase_attendance_daily_limit.sql`, `supabase_admin_attendance.sql`, `supabase_admin_rpc_hardening.sql` | Read only. The helpers you call. |
| `supabase_admin_privilege_hardening.sql` | Read only. `is_admin()` and the audit-writer style to copy. |
| `src/services/dtrSubmissionService.ts` | Add the admin methods. |
| `src/utils/dtrFormat.ts` (+ test) | Add the new event labels. |
| `src/components/AdviserDtrReviewModal.tsx` | Add `mode` prop (admin actions). |
| `src/components/StudentDtrSubmission.tsx` | No logic change. It picks up the new labels automatically. |
| `src/services/gradingService.ts` | Add `getAdminSheets` and `reopen`. |
| `src/utils/grading.ts` (+ test) | Add `canReopen` and the `reopen` label. |
| `src/components/CoordinatorGradingView.tsx` | Add `mode` prop (admin list and reopen). |
| `src/services/attendanceService.ts` | Add the admin clock-record methods. |
| `src/components/AdminAttendanceView.tsx` | Add the "Clock Records" section to the detail drawer. |
| `src/components/AdminDashboard.tsx` | Add views `dtr` and `grading`. |

---

## 4. ARCHITECTURE & DATA FLOW (target)

```
Admin UI ──► service method ──► supabase.rpc('admin_…')
                                  │  SECURITY DEFINER, SET search_path
                                  │  1. IF NOT public.is_admin() → 42501
                                  │  2. lock target row (FOR UPDATE), validate state + input
                                  │  3. write change
                                  │  4. domain trail   (dtr_submission_events | grade_audit_logs)
                                  │  5. audit_logs     (public.write_force_action_audit)
                                  │  6. user_notifications insert(s)  → existing email webhook
                                  ▼
                               jsonb result ──► UI refresh + existing toast/banner
```

The client **does not** also call `createAuditLog` for these actions. The server row is the record.

Cross-workflow lock: clock-record corrections (Part C) are refused while a DTR covering that day is `pending` or `approved`. The admin must first request a revision or reopen the DTR (Part A). This keeps an approved DTR's snapshot consistent with its records.

---

## 5. DATABASE CONTEXT

- **Existing tables used:**
  - `dtr_submissions`, `dtr_submission_events`;
  - `grading_sheets`, `grading_sheet_items`, `grade_audit_logs`;
  - `timesheets`, `company_attendance`;
  - `profiles`, `sections`, `adviser_sections`, `school_years`;
  - `user_notifications`, `audit_logs`, `system_settings`.
- **Additive schema changes (only these):**
  1. `dtr_submission_events.event` CHECK → add `'admin_approved'`, `'admin_revision_requested'`, `'reopened'`, `'reviewer_reassigned'`. Drop and re-create the named constraint. Get the live name in Phase 0.
  2. `grading_sheets`: `reopened_at timestamptz`, `reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`.
  3. `timesheets`:
     - `entry_source text NOT NULL DEFAULT 'clock' CHECK (entry_source IN ('clock','admin'))`;
     - `corrected_at timestamptz`;
     - `corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`;
     - `correction_reason text`.

     All nullable or defaulted. Existing rows stay `'clock'`.
- ID conventions (keep them exactly):
  - `dtr_submissions.student_id`, `adviser_id` and `timesheets.user_id` are **auth user ids**.
  - `grading_sheet_items.student_id` is **`profiles.id`**.

---

## 6. ROLE CONTEXT

| Actor | After this task |
|---|---|
| Admin (active, complete) | May run every RPC in Section 7. Must give a reason every time. |
| Coordinator | **Unchanged.** Keeps verify/return/finalize. Gets no reopen, DTR-override or clock-record powers. |
| Adviser | **Unchanged** review path. May receive a reassigned DTR or a reopened grading sheet. |
| Student | **Unchanged** submit path. Sees admin events in DTR history. Can resubmit a reopened DTR. Notified of clock-record corrections. |

---

## 7. REQUESTED CHANGE

Put all SQL in **one new file**, `supabase_admin_force_control.sql`:

- idempotent (`CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` then `ADD`);
- a header comment explaining the *why*, in the style of `supabase_dtr_submissions.sql`;
- ends with `NOTIFY pgrst, 'reload schema';`.

Do not edit older SQL files.

For every new API function:

- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog`;
- first statement: `IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501'; END IF;`;
- `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated;`.

**Reason rule (all write RPCs):**

- `v_reason := btrim(coalesce(p_reason,''))`.
- Raise `'A reason is required for an administrator override.'` when it is empty.
- Raise `'The reason is too long (500 characters max).'` when it is over 500 characters.

### Part 0 — Shared audit writer

`public.write_force_action_audit(p_action text, p_module text, p_description text, p_target_type text, p_target_id text, p_target_name text, p_old jsonb, p_new jsonb)`:

- Same body pattern as `write_privileged_audit_log`: actor from `auth.uid()`, name/role from `profiles`, `status 'success'`.
- Sets `table_name` and `target_type` from `p_target_type`, and `record_id` and `target_id` from `p_target_id`.
- `SECURITY INVOKER`.
- `REVOKE ALL … FROM PUBLIC, anon, authenticated`, because it is only called from inside the RPCs.
- `p_new` always includes `'override', true` and `'reason', v_reason`.
- `description` always starts with `Admin override: `.

Mapping:

| RPC | action | module | target_type |
|---|---|---|---|
| `admin_review_dtr_submission` approve / request_revision / reopen | `APPROVE` / `REJECT` / `UPDATE` | `Attendance` | `dtr_submission` |
| `admin_reassign_dtr_reviewer` | `ASSIGN` | `Attendance` | `dtr_submission` |
| `admin_reopen_grading_sheet` | `UPDATE` | `Grading` | `grading_sheet` |
| `admin_correct_timesheet`, `admin_force_clock_out` | `UPDATE` | `Timesheets` | `timesheet` |
| `admin_add_timesheet` | `CREATE` | `Timesheets` | `timesheet` |
| `admin_set_timesheet_voided` | `REJECT` (void) / `APPROVE` (restore) | `Timesheets` | `timesheet` |

Use only the action and module values already in the `AuditAction` / `AuditModule` unions.

### Part A — DTR submission overrides

**A1. Event CHECK.** Extend it as listed in Section 5.

**A2. `get_admin_dtr_submissions(p_status text DEFAULT NULL)`** — read-only (`STABLE`).

Returns every submission. Columns: the same as `get_adviser_dtr_submissions`, plus:

- `adviser_id uuid`, `adviser_name text`;
- `adviser_active boolean` (target profile is `account_type='adviser' AND is_active IS TRUE`);
- `current_adviser_id uuid` (from `resolve_student_adviser(student_id)`);
- `needs_attention boolean`, true when `status='pending' AND (adviser_id IS NULL OR NOT adviser_active OR adviser_id IS DISTINCT FROM current_adviser_id)`.

`p_status` accepts:

- `NULL` or `'all'`;
- one of the three statuses;
- `'needs_attention'`.

Order: `needs_attention` first, then pending, revision, approved, then `submitted_at DESC`.

**A3. `admin_review_dtr_submission(p_id uuid, p_action text, p_reason text)`**

1. Lock the row with `FOR UPDATE`. If not found: `'DTR submission not found.'`
2. Apply the action:

   | `p_action` | Allowed from | New status | Event |
   |---|---|---|---|
   | `approve` | `pending` | `approved` | `admin_approved` |
   | `request_revision` | `pending` | `revision_requested` | `admin_revision_requested` |
   | `reopen` | `approved` | `revision_requested` | `reopened` |

   Any other combination raises: `'This DTR is <status> and cannot be <verb> here.'`

3. **Reopen guard.** If another row for the same `student_id` has `status <> 'approved'`, raise `'This student already has an open DTR submission. Resolve that one first.'` Check this **before** the UPDATE, because the partial unique index would otherwise throw a raw error.
4. `UPDATE`:
   - `status`;
   - `reviewed_at = now()`, `reviewed_by = auth.uid()`;
   - `adviser_remarks = v_reason`;
   - `updated_at = now()`.

   Leave `snapshot`, `attempt` and `adviser_id` unchanged.
5. Insert an event with `actor_name` from the admin's profile and `remarks = v_reason`.
6. Notify the **student**, mirroring `review_dtr_submission`:
   - approve → `dtr_approved` / `'DTR Approved'`;
   - request_revision and reopen → `dtr_revision`, title `'DTR Revision Required'` (reopen: `'DTR Reopened for Correction'`).

   Use `action_path '/student/dtr'`. The message must say that an administrator acted and include the reason.
7. When `adviser_id IS NOT NULL`, also notify the **adviser** with `notification_type 'dtr_approved'` or `'dtr_revision'`, `action_path '/adviser/approvals?tab=dtr'`, and a message saying an administrator acted on a DTR addressed to them.
8. Write the audit row with old and new `status`. Return `jsonb_build_object('status', <new>, 'reviewed_at', now())`.

What happens after a reopen: `get_my_dtr_status` picks the latest row, which is now `revision_requested`, so the student sees `revision_required`. `submit_my_dtr` then resubmits **the same row** with `attempt + 1`. Verify this; do not change either function.

**A4. `admin_reassign_dtr_reviewer(p_id uuid, p_adviser_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)`**

- Allowed from `pending` or `revision_requested` only. Otherwise: `'Only an open DTR submission can be reassigned.'`
- Choosing the adviser:
  - If `p_adviser_id IS NULL`, use `resolve_student_adviser(student_id)`, and also update `section_id` and `section_name` from it.
  - If none resolves: `'No active adviser holds this student''s section. Assign an adviser to the section first.'`
- The target must be a profile with `account_type='adviser' AND is_active IS TRUE`. Otherwise: `'The selected account is not an active adviser.'`
- If the target equals the current `adviser_id`: `'This DTR is already assigned to that adviser.'`
- Update `adviser_id` and `updated_at`.
- Event `reviewer_reassigned`, with remarks = reason plus the new adviser's name.
- If the status is `pending`, notify the **new adviser**, same shape as `submit_my_dtr` (`dtr_submitted`, `/adviser/approvals?tab=dtr`). Notify the student with `notification_type 'dtr_submitted'` and the new reviewer's name.
- Audit old/new `adviser_id`.

**A5. Frontend**

- `dtrSubmissionService`:
  - `listForAdmin(filter)` → `get_admin_dtr_submissions`. Add an `AdminDtrSubmissionRow` type that extends `DtrSubmissionRow`.
  - `adminReview(id, action: 'approve'|'request_revision'|'reopen', reason)`.
  - `reassignReviewer(id, adviserId: string|null, reason)`.

  Use the existing `mapDtrError`. **No** `createAuditLog` call.
- `dtrFormat.ts` `DTR_EVENT_LABEL`:
  - `admin_approved: 'Approved by an administrator'`;
  - `admin_revision_requested: 'Revision requested by an administrator'`;
  - `reopened: 'Reopened by an administrator'`;
  - `reviewer_reassigned: 'Reviewer reassigned'`.

  Add assertions to `dtrFormat.test.ts`. Add matching `.is-<event>` history modifiers in `DtrSubmission.css`, following the existing modifier pattern; check it in Phase 0.
- `AdviserDtrReviewModal`: add `mode?: 'adviser' | 'admin'`, default `'adviser'`. Behaviour in adviser mode must stay **byte-for-byte the same**. In `'admin'` mode:
  - Actions by status:

    | Status | Buttons |
    |---|---|
    | pending | Request Revision, Approve, Reassign Reviewer |
    | revision_requested | Reassign Reviewer |
    | approved | Reopen for Correction |

  - Every confirm dialog shows a **required** "Reason for override" textarea, reusing `dtr-textarea` and `dtr-hint`.
  - Reassign offers "Current section adviser (recommended)", which sends `null`. It also offers a `CustomSelect` of active advisers, loaded with a read-only `profiles` select of `account_type='adviser' AND is_active=true`. Admins can read profiles.
  - Call the new service methods, **not** `adviserService.reviewDtrSubmission`.
  - Label the remarks box "Reviewer remarks" instead of "Your remarks".
  - `onReviewed` gains the action values `'reopen' | 'reassign'`. Widen the type; the adviser caller is unaffected.
- New `src/components/AdminDtrSubmissionsView.tsx`:
  - A list modelled on the DTR tab of `AdviserApprovalsView`. Reuse `DtrSubmission.css`, `DtrStatusBadge`, `formatDtrHours`, `formatDtrPeriod`, `usePagination` and `Pagination`.
  - Filter chips: Needs Attention (with count), Pending, Revision Required, Approved, All.
  - Columns: Student, Section, Company, Period, Hours, Reviewer (a "No active reviewer" warning pill when `needs_attention`), Status, Submitted, and a View action that opens the modal in admin mode.
  - A search box on student name and email.
- `AdminDashboard`:
  - add `'dtr'` to `View` and `validSlugs`;
  - add a nav item "DTR Submissions" after "Attendance", with a `nav-badge` for the needs-attention count;
  - header title "DTR Submissions";
  - render block.

### Part B — Grading sheet reopen and admin view

**B1.** Add the columns listed in Section 5.

**B2. Redefine `open_grading_sheet`.** Copy the live definition exactly (Phase 0 step 2) and change **only** the roster-sync condition to:

```sql
IF (SELECT status FROM public.grading_sheets WHERE id = v_sheet_id) IN ('draft','for_review')
   AND (SELECT reopened_at FROM public.grading_sheets WHERE id = v_sheet_id) IS NULL THEN
```

Why: a reopened sheet belongs to a past term. Syncing it against today's section membership would add students who were never on it.

**B3. `get_admin_grading_sheets(p_status text DEFAULT NULL)`** — read-only.

Same columns as `get_coordinator_grading_sheets`, plus:

- `adviser_id`;
- `adviser_active boolean`;
- `adviser_holds_section boolean` (an `adviser_sections` row exists with `section_id = gs.section_id AND adviser_id = gs.adviser_id AND status='active'`);
- `return_reason`, `reopened_at`.

**Includes drafts.** `p_status` accepts `NULL`/`'all'` or one of the four statuses.

**B4. `admin_reopen_grading_sheet(p_sheet_id uuid, p_reason text)`**

1. Lock the sheet with `FOR UPDATE`. Not found: `'Grading sheet not found.'`
2. `status` must be `'finalized'`. Otherwise: `'Only a finalized grading sheet can be reopened. Use Return for Correction for a sheet that is still under review or verified.'`
3. The sheet's adviser must still be an active adviser (`account_type='adviser' AND is_active IS TRUE`) **and** must hold the section as above. Otherwise:
   `'The adviser on this sheet no longer holds section <name>. Assign the section to an adviser and have them open this term''s sheet first, then reopen it.'`
   The existing `open_grading_sheet` handoff then moves the sheet to the new adviser.
4. `UPDATE`:
   - `status='draft'`;
   - `return_reason = v_reason`, `returned_at = now()`, `returned_by = auth.uid()`;
   - `submitted_at = NULL`;
   - `verified_at = NULL`, `verified_by = NULL`;
   - `finalized_at = NULL`, `finalized_by = NULL`;
   - `reopened_at = now()`, `reopened_by = auth.uid()`;
   - `updated_at = now()`.
5. Insert into `grade_audit_logs`: `action 'reopen'`, `old_status 'finalized'`, `new_status 'draft'`, `reason`.
6. Notify:
   - the **adviser**: `'warning'`, `'assignment'`, related `grading_sheet`, `action_path '/adviser/grading'`, `action_label 'Open Grading Sheet'`, message `'The finalized <section> Official Grading Sheet was reopened by an administrator. Reason: …'`;
   - the **department coordinators**, using the same recipient filter as `submit_grading_sheet`: `action_path '/coordinator/grading-sheets'`.
7. Write the audit row. Return `{status:'draft'}`.

**B5. Frontend**

- `grading.ts`:
  - `canReopen = (s) => s === 'finalized'`;
  - `AUDIT_ACTION_LABELS.reopen = 'Reopened by the Administrator'`;
  - tests in `grading.test.ts`.

  **Do not** change `STATUS_DESCRIPTIONS.finalized`.
- `gradingService`:
  - `getAdminSheets(status)` → `get_admin_grading_sheets`. Extend `GradingSheetSummary` with optional `adviser_active`, `adviser_holds_section` and `reopened_at`.
  - `reopen(sheetId, reason)` → `admin_reopen_grading_sheet`, with **no** `createAuditLog`.
- `CoordinatorGradingView`: add `mode?: 'coordinator' | 'admin'`, default `'coordinator'`, which must behave **identically** to today. In `'admin'` mode:
  - load with `getAdminSheets`;
  - filters: Draft, For Review, Verified, Finalized, All (default All);
  - show an "Adviser unavailable" warning pill when `adviser_active === false || adviser_holds_section === false`;
  - show a "Reopened" pill when `reopened_at` is set;
  - finalized rows get a **Reopen** action that uses the existing return-reason modal pattern, with its own title, copy and required reason;
  - verify, return and finalize stay available as they are, because the RPCs already allow admins;
  - update the header copy to say the view covers all sheets.
- Phase 0 checks whether `CoordinatorDashboard.css` contains unscoped global selectors. If it does, admin mode must not change the admin portal's look. Report what you found and scope or avoid the import only if needed.
- `AdminDashboard`:
  - add view `'grading'` to `View` and `validSlugs`;
  - nav item "Grading Sheets" after "DTR Submissions";
  - header title "Official Grading Sheets";
  - render `<CoordinatorGradingView mode="admin" />`.

### Part C — Clock-record corrections

**C1.** Add the `timesheets` columns listed in Section 5.

**C2. `get_admin_student_timesheets(p_student_id uuid, p_date date)`** — read-only.

Returns every `timesheets` row for that student whose `(clock_in AT TIME ZONE attendance_time_zone())::date = p_date`, **including rejected** rows. Columns:

- `id`, `clock_in`, `clock_out`, `break_start`, `break_end`, `status`, `approval_status`;
- `worked_minutes` (`timesheet_worked_minutes(..., now())`);
- `daily_limit_status`, `over_limit_minutes`;
- `entry_source`, `corrected_at`, `corrected_by_name`, `correction_reason`.

Order by `clock_in`.

**Shared validation** — one internal helper, `public.admin_validate_timesheet_range(p_user uuid, p_exclude uuid, p_in, p_out, p_bs, p_be)`. It is `SECURITY INVOKER` and revoked from all API roles. It raises:

- `p_in` or `p_out` is null → `'Clock-in and clock-out are both required.'`
- `p_out <= p_in` → `'Clock-out must be later than clock-in.'`
- `p_out > now()` → `'A clock record cannot end in the future.'`
- `p_out - p_in > interval '24 hours'` → `'A single session cannot exceed 24 hours.'`
- Break set only half-way, or not `p_in <= p_bs < p_be <= p_out` → `'The break must start and end inside the session.'`
- Overlap: another non-rejected row for `p_user` with `id <> p_exclude` and `tstzrange(clock_in, coalesce(clock_out, now())) && tstzrange(p_in, p_out)` → `'This session overlaps another clock record on <date>.'`

**DTR lock** — one internal helper, `public.admin_assert_dtr_editable(p_user uuid, p_day date)`:

- A `dtr_submissions` row for `p_user` with `status='pending'` and `p_day BETWEEN period_start AND period_end` → `'This student''s DTR is under review. Request a revision on the DTR first.'`
- A row with `status='approved'` covering the day → `'This day belongs to an approved DTR. Reopen the DTR first.'`
- A day **after** an approved submission's `period_end` is allowed.

**Limit recompute** — one internal helper, `public.admin_refresh_day_limit(p_user uuid, p_day date)`:

- For every non-rejected row that day, sets `daily_limit_status = attendance_limit_state(attendance_daily_minutes(p_user,p_day), attendance_daily_limit_minutes())` and `over_limit_minutes = GREATEST(0, minutes - limit)`.
- Sends **no** notifications and does not touch `attendance_limit_alerts`.

**C3. `admin_correct_timesheet(p_timesheet_id uuid, p_clock_in timestamptz, p_clock_out timestamptz, p_break_start timestamptz, p_break_end timestamptz, p_reason text)`**

1. Lock the row. Not found: `'Clock record not found.'` The owner must be a `student` profile.
2. The attendance day of `p_clock_in` must equal the original day: `'A correction must stay on the same attendance date.'`
3. Run `admin_assert_dtr_editable`, then `admin_validate_timesheet_range`.
4. `UPDATE`:
   - the four times;
   - `status='completed'`;
   - `corrected_at = now()`, `corrected_by = auth.uid()`, `correction_reason = v_reason`.

   Do not change `approval_status`.
5. Run `admin_refresh_day_limit`, write the audit row (old and new times), and notify the student (`notification_type 'attendance'`, `action_path '/student/dtr'`, message with the date and the reason).

**C4. `admin_force_clock_out(p_timesheet_id uuid, p_clock_out timestamptz, p_reason text)`**

- Only for `clock_out IS NULL`. Otherwise: `'This session is already clocked out.'`
- If `status='break'` and `break_end IS NULL`, set `break_end := p_clock_out`.
- Then follow the same assert, validate, update, refresh, audit and notify steps as C3, using the row's existing `clock_in`.

**C5. `admin_add_timesheet(p_student_id uuid, p_clock_in timestamptz, p_clock_out timestamptz, p_break_start timestamptz, p_break_end timestamptz, p_reason text)`**

- The target must be a student with `company_id IS NOT NULL`. Otherwise: `'This student is not deployed to a company.'`
- Run assert and validate with `p_exclude = NULL`.
- `INSERT`:
  - `user_id = p_student_id`, the times, `status='completed'`;
  - `approval_status='approved'`, `requires_approval=false`;
  - `entry_source='admin'`;
  - `corrected_at` / `corrected_by` / `correction_reason` set.
- Then refresh, audit and notify.

**C6. `admin_set_timesheet_voided(p_timesheet_id uuid, p_void boolean, p_reason text)`**

- Run assert on the row's day.
- Void: `approval_status='rejected'`. Refuse if the row is open: `'Clock the session out before voiding it.'`
- Restore: `approval_status='approved'`, after running `admin_validate_timesheet_range` against the other rows (a restore must not create an overlap).
- Set the correction columns. Then refresh, audit (old and new `approval_status`) and notify.

A voided row is already excluded from every DTR and limit computation, because they filter out `rejected`.

**C7. Frontend**

- `attendanceService`:
  - `getAdminStudentTimesheets(studentAuthId, date)`, `adminCorrectTimesheet`, `adminForceClockOut`, `adminAddTimesheet`, `adminSetTimesheetVoided`.
  - Types: `AdminTimesheetRow`.
  - **Do not** route these errors through `mapAttendanceSaveError`. Its keyword matching would rewrite them into attendance-status messages (for example "not authorized" → "record attendance"). Add a small `mapTimesheetOverrideError` that passes short server messages through as they are, like `mapDtrError` in `dtrSubmissionService.ts`.
- New `src/utils/timesheetCorrection.ts` (pure, React-free, like `attendanceLimit.ts`):
  - `zonedLocalToIso(localDateTime: string, timeZone: string): string` converts a `datetime-local` value, interpreted in the **configured attendance time zone** (not the browser's), to an ISO string.
  - `isoToZonedLocal(iso, timeZone)` does the reverse.
  - `validateSessionDraft({in,out,breakStart,breakEnd}, now)` mirrors the server messages for instant feedback. The server stays the authority.
- New `src/utils/timesheetCorrection.test.ts`. Cover Asia/Manila (UTC+8) with a browser time zone that differs, a midnight crossing, a half-set break and a reversed range. **Add it to the `npm test` file list** and add a `test:timesheet-correction` script.
- New `src/components/AdminTimesheetModal.tsx`:
  - Modes: `edit | clock_out | add`.
  - Fields: Clock in, Clock out, Break start, Break end (optional), Reason (required).
  - Show the date and time zone in the header, and a live "Rendered" preview using `sessionWorkedMinutes`.
  - Reuse the `AttendanceRecordModal` structure and `AttendanceView.css` classes. Show the server error inline.
- `AdminAttendanceView` detail drawer — add a **"Clock Records"** `aav-section-title` block **between "Needs Attention" and "Change History"**:
  - Load with `getAdminStudentTimesheets(r.student_auth_id, date)` when the drawer opens.
  - Show a skeleton while loading (`aav-skeleton`).
  - Each session row shows: In, Out (or an "Open" badge), Break, Rendered, and badges for `Voided`, `Admin entry` and `Corrected` (with a tooltip for the reason). Reuse `aav-badge` and `data-tone`.
  - Row actions: **Edit** (completed rows), **Clock Out** (open rows), **Void** / **Restore**. Void and Restore use a small confirm dialog with a required reason.
  - An **Add Session** button, disabled with a tooltip when `!r.company_id`, matching the existing Record Attendance button.
  - After any success: reload the sessions, `load(date)` and the drawer data, then show the existing `notify('success', …)` toast.
  - Read the time zone from `timeTrackingService.getDailyLimitConfig()`, which the view already imports.
  - Leave the existing "Edit/Record Attendance" button and `submitCorrection` unchanged.

---

## 8. EXPECTED BEHAVIOR

- **Orphaned DTR:** an admin sees it under Needs Attention, reassigns it to the current section adviser, and that adviser gets the notification and sees it in their queue.
- **Admin approve:** the submission is approved; the student sees "Approved by an administrator" in the history, and the adviser is informed.
- **Reopen an approved DTR:** the student sees Revision Required with the admin's reason, fixes the records, and resubmits. The same row goes back to pending with `attempt + 1`.
- **Clock-record fix:**
  1. A student cannot submit because of a missing clock-out.
  2. The admin opens Attendance → the day → Clock Records → Clock Out, and enters the time and a reason.
  3. The DTR's blocking issue clears. The student is notified and can submit.
- Correcting a day inside a pending or approved DTR is refused, with the message telling the admin which DTR action to take first.
- **Grading reopen:**
  1. An admin reopens a finalized sheet with a reason. The adviser gets a warning notification.
  2. The adviser opens the section for that term. The sheet shows the returned-for-correction banner, the roster is **not** re-synced, and grades are editable.
  3. The adviser resubmits, and the coordinator verifies and finalizes again.
  4. The history shows reopen, grade changes, submit, verify and finalize.
- Every override creates **exactly one** `audit_logs` row, with the admin as actor, `override: true` and the reason. No duplicate browser audit row is written.
- A non-admin calling any new RPC gets `42501`, including a deactivated admin.

---

## 9. UI / UX

- No new colors, fonts or layout systems. Reuse:
  - **DTR:** `DtrSubmission.css` (`dtr-*`), `DtrStatusBadge`.
  - **Grading:** `GradingSheet.css` (`gs-*`), `gs-modal`, `gs-alert`.
  - **Attendance:** `AdminAttendanceView.css` (`aav-*`), `AttendanceView.css`.
  - **Shared:** `CustomSelect`, `Pagination`, `usePagination`, `Skeletons`.
- Keep it compact and dense: tables over cards, no gradients, no new animations, no emoji.
- Override buttons use the existing warning/danger button variants. Every confirm dialog must:
  - say it is an administrator override;
  - state its consequence in one sentence;
  - require a reason, with the submit button disabled until one is entered.
- Error copy comes from the server messages in Section 7. Show it inline in the dialog.
- The new admin nav items follow the existing `admin-nav-item` markup, with an inline SVG icon of the same size.
- Check responsive behavior at 375px and dark mode for every new element.

---

## 10. SECURITY

- Authorization is enforced **only in the database** (`public.is_admin()`). The UI hiding a control is not security.
- Never take the actor from a parameter. Use `auth.uid()`.
- New helper functions (`write_force_action_audit`, `admin_validate_timesheet_range`, `admin_assert_dtr_editable`, `admin_refresh_day_limit`) are not executable by `anon` or `authenticated`.
- Every table write in this task goes through a DEFINER RPC:
  - add **no** new RLS write policies;
  - do not loosen any existing policy;
  - do not grant table privileges.
- Pin `search_path` on every new or redefined function.
- The `open_grading_sheet` redefinition keeps its existing adviser checks exactly.
- Do not change `review_dtr_submission`, `submit_my_dtr`, `get_coordinator_grading_sheets`, `return_grading_sheet`, `finalize_grading_sheet`, `record_attendance` or `process_attendance_daily_limits`.

---

## 11. EDGE CASES

- **Concurrency.** Two admins act on the same DTR, sheet or timesheet. The `FOR UPDATE` lock plus the status re-check means the second gets a clear state error.
- **Reopen while another submission is open.** The reopen guard fires before the unique index would.
- **Reassign when the section has no active adviser.** Show the clear error. Do not leave `adviser_id` null.
- **Reassign to a deactivated adviser.** Refuse it.
- **Reopen a finalized sheet whose adviser was deactivated or lost the section.** Refuse it and give instructions (B4 step 3).
- **Reopened sheet opened by the adviser.** No roster sync. Also confirm `open_grading_sheet`'s reassign branch still works for a reopened sheet.
- **Time zone.**
  - An admin whose browser is not in Asia/Manila.
  - A session crossing local midnight: the attendance day is the day of `clock_in` in the configured zone.
  - `datetime-local` values are always converted with the configured zone.
- **Force clock-out on a record in `break`.** `break_end` is set to the clock-out time.
- **Force clock-out on a stale record** (open for days). The 24-hour cap means the admin must choose a clock-out within 24 hours of clock-in.
- **Add session on a day with a `company_attendance` status of absent or on_leave.** Allow it, but the modal shows a warning line. The status is not changed.
- **Restoring a voided row that now overlaps.** Refuse it.
- **Over-limit day.** The admin can shorten a session to clear it. Admin cannot approve an exception here (out of scope).
- **Student without a company.** Add Session is disabled; the server also refuses.
- **Notifications CHECK.** If the live `notification_type` list differs from the repo, use only values present live (Phase 0 step 6).
- **A deleted student or adviser.** Existing FKs are `SET NULL` or `CASCADE`, so the new RPCs must handle a NULL `adviser_id` or a missing profile gracefully.

---

## 12. REGRESSION CONSTRAINTS — must remain unchanged

- Adviser DTR review: `AdviserApprovalsView`, and `AdviserDtrReviewModal` in adviser mode, `adviserService.reviewDtrSubmission`.
- Student DTR submission and states: `StudentDtrSubmission`, `get_my_dtr_status`, `submit_my_dtr`, `compute_student_dtr`.
- Coordinator grading: `CoordinatorGradingView` in default mode, `get_coordinator_grading_sheets`, verify/return/finalize.
- Adviser grading: `AdviserGradingView`, `open_grading_sheet` for sheets that were never reopened (roster sync still runs).
- Student clock-in/out/break writes in `timeTracking.ts`, anti-cheat, the geofence monitor, and the daily-limit detector with its emails.
- The existing admin attendance status correction (`record_attendance` via `AttendanceRecordModal`).
- `ApprovalsView` including its legacy `dtr` tab, and `coordinatorService.updateTimesheetStatus`.
- Existing admin views, slugs and nav order. New items are only inserted.
- No new dependencies, no refactoring, no changes to unrelated files.

---

## 13. IMPLEMENTATION CONSTRAINTS

- **SQL:** exactly one new file, `supabase_admin_force_control.sql`.
- **Client file set:**

  | Status | Files |
  |---|---|
  | Modified | `src/services/dtrSubmissionService.ts`, `src/utils/dtrFormat.ts`, `src/utils/dtrFormat.test.ts`, `src/components/AdviserDtrReviewModal.tsx`, `src/components/DtrSubmission.css`, `src/services/gradingService.ts`, `src/utils/grading.ts`, `src/utils/grading.test.ts`, `src/components/CoordinatorGradingView.tsx`, `src/services/attendanceService.ts`, `src/components/AdminAttendanceView.tsx`, `src/components/AdminAttendanceView.css` (only if new classes are needed), `src/components/AdminDashboard.tsx`, `package.json` (test scripts only) |
  | New | `src/components/AdminDtrSubmissionsView.tsx`, `src/components/AdminTimesheetModal.tsx`, `src/utils/timesheetCorrection.ts`, `src/utils/timesheetCorrection.test.ts` |

  Justify any other file you touch.
- Inspect each file before editing it. Follow the surrounding code style: comment tone, `React.FC`, and the `mounted` ref pattern in the modal.
- Services use explicit `{ data, error }` handling and throw `Error` with the server message.
- **Applying the SQL:** `.mcp.json` has no servers configured, so there may be no database tool in your session. Apply the migration using whatever the project already uses (Supabase SQL editor or CLI on the linked ref). If you cannot apply it, **stop after writing the file** and report. Do not fake the verification.

---

## 14. OUT OF SCOPE (do not implement)

- Force-submitting a DTR on the student's behalf, and waiving a blocking issue without fixing the records.
- Daily-limit exceptions, per-student required-hours editing, and geofence or anti-cheat exemptions.
- Moving a session to another date; editing coordinates, photos or `requires_approval`.
- Company evaluation reopen, placement and section-assignment admin screens, and account/session controls (inventory Tier 1 items 5–6 and Tier 2). These are separate prompts.
- Giving coordinators any of these overrides.
- Changing the legacy per-timesheet approval tab.

---

## 15. VERIFICATION

### Phase 0 — evidence before any edit (report raw results)

1. **STOP GATE — hardening is live.**
   - `select pg_get_functiondef('public.is_admin()'::regprocedure);` must show `is_active IS TRUE AND registration_status = 'complete'`.
   - `select count(*) from pg_proc where proname='write_privileged_audit_log';` must be 1.

   If either check fails, stop and report. This task depends on them.
2. **Live definitions.** Run `pg_get_functiondef` for:
   `open_grading_sheet`, `review_dtr_submission`, `submit_my_dtr`, `get_my_dtr_status`, `resolve_student_adviser`, `compute_student_dtr`, `get_coordinator_grading_sheets`, `return_grading_sheet`, `timesheet_worked_minutes`, `attendance_daily_minutes`, `attendance_limit_state`, `attendance_time_zone`.

   Diff each against the repo. **Report any difference.** B2 must copy the **live** `open_grading_sheet`.
3. **`timesheets` shape.**
   - `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='timesheets' order by ordinal_position;`
   - Confirm that the Section 5 columns do not already exist.
4. **`timesheets` policies and triggers.**
   - `select policyname, cmd, roles, qual, with_check from pg_policies where tablename='timesheets';`
   - `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.timesheets'::regclass and not tgisinternal;`
   - **STOP and report** if a trigger would block or rewrite the new updates.
5. **Constraint names.**
   - `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.dtr_submission_events'::regclass,'public.dtr_submissions'::regclass,'public.grading_sheets'::regclass);`
6. **Live notification types.**
   - `select pg_get_constraintdef(oid) from pg_constraint where conname='user_notifications_notification_type_check';`
7. **Data impact snapshot (read-only):**
   - count of `dtr_submissions` by status;
   - count of pending submissions where the adviser is null, inactive or no longer the section adviser;
   - count of `grading_sheets` by status;
   - count of open `timesheets` older than 24 hours.
8. **Frontend checks.**
   - Grep `CoordinatorDashboard.css` for selectors not prefixed with a component scope (e.g. `body`, `:root`, bare element selectors). Report them.
   - Read the `.dtr-history li.is-*` modifiers in `DtrSubmission.css`.
   - Grep `src` for every caller of `get_coordinator_grading_sheets`, `review_dtr_submission` and `AdviserDtrReviewModal`.

### Phase 1 — after the change

**SQL** — run in rolled-back transactions as real test accounts (`set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`):

- **Authorization:** every new RPC fails with `42501` for a student, an adviser, a coordinator and a **deactivated admin**. All helper functions are not executable by `authenticated`: `has_function_privilege('authenticated', '<fn>', 'execute')` returns false.
- **DTR:**
  - admin approve of a pending submission writes 1 row to each of: submission update, `admin_approved` event, student notification, adviser notification (when an adviser exists), `audit_logs`;
  - approving an already-approved submission fails with the state message;
  - reopen of an approved submission gives `revision_requested`;
  - then, as the student, `submit_my_dtr()` resubmits the **same id** with `attempt + 1`;
  - reopen while another open submission exists gives the friendly error;
  - reassign with `NULL` resolves the section adviser; reassign to a coordinator id fails.
- **Grading:**
  - reopen of a verified sheet fails;
  - reopen of a finalized sheet gives `draft`, a `reopen` history row, `reopened_at` set, and the verified/finalized fields cleared;
  - as the adviser, `open_grading_sheet` on that sheet returns the id **and the item count is unchanged**, even after a new student is added to the section;
  - a never-reopened draft still syncs.
- **Timesheets:**
  - force clock-out on an open record: `completed`, correction columns set, `daily_limit_status` recomputed;
  - `compute_student_dtr` for that student no longer lists `missing_clock_out` for the day;
  - validation errors fire for reversed range, future end, over 24 hours, half break and overlap;
  - correction on a day covered by a pending or approved DTR is refused;
  - add session produces `entry_source='admin'`;
  - void excludes the row from `attendance_daily_minutes`;
  - restore into an overlap is refused.
- **Audit:** each successful call adds exactly one `audit_logs` row, with `user_id = admin`, `new_values->>'override' = 'true'` and the reason present.

**Browser, end to end:**

- **Admin → DTR Submissions:** the filters work; the Needs Attention badge count matches; approve, request revision, reopen and reassign each show a required reason; the history shows the new labels.
- **Adviser:** the reassigned DTR appears in `/adviser/approvals?tab=dtr`. The adviser modal looks and behaves exactly as before.
- **Student:** the reopened DTR shows Revision Required with the reason; resubmit works; the history shows the admin events.
- **Admin → Grading Sheets:** drafts are listed; the reopen flow works; the "Adviser unavailable" pill appears for an orphaned sheet.
- **Coordinator grading view:** unchanged; drafts still hidden.
- **Admin → Attendance → a day → Clock Records:** edit, clock-out, add, void and restore all work, and the drawer and table refresh.
  - Test with the OS time zone set to something other than UTC+8 and confirm the saved times are correct.
  - The existing Edit/Record Attendance flow is unchanged.
- Check 375px width and dark mode for every new element.
- `npm run lint` passes. `npm test` passes and includes `timesheetCorrection.test.ts`. `npm run build` succeeds.
- Report:
  - a diff summary;
  - the list of new and redefined SQL objects;
  - Phase 0 findings;
  - confirmation that no file outside Section 13 changed (or a justification for each one that did).

---

## APPENDIX — Findings to report, not fix

- **Stale roster on return.** `return_grading_sheet` on a `verified` sheet from a past term already re-enables roster sync when the adviser reopens it (the same drift B2 prevents for reopen). **[CONFIRMED in repo]** Decide separately.
- **Grading helpers ignore `is_active`.** `current_account_type()` and `can_view_grading_sheet()` do not check it, so a deactivated coordinator or admin passes the grading RPC role checks. **[CONFIRMED in repo; live UNCONFIRMED]**
- **Staff read policy ignores `is_active`.** `"Staff read DTR submissions"` and `get_dtr_submission` check `account_type` inline. **[CONFIRMED in repo]**
- **Students may write their own clock times.** Timesheet writes come from the student's browser. If the live policies let a student UPDATE their own `clock_in`/`clock_out` freely, they can edit their own hours. Phase 0 step 4 reveals this. Report it; do not change it here.
- **Approved students can submit again.** After an approval, `submit_my_dtr` would insert a **new** submission if called, because no open row exists. The student UI hides this path. **[INFERRED]**

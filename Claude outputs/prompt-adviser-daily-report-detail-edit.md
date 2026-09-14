# CODING-AGENT PROMPT — Detailed adviser-written Daily Report, with an Edit feature

> Hand this whole document to the coding agent. Everything marked **[CONFIRMED]** was read from the
> repository at `C:\Users\stewa\monitoring-system`. Nothing here is invented. Items the repository
> could not settle are marked **[UNCONFIRMED]** or **[UNKNOWN]** and must be checked, not guessed.

---

## 1. CONTEXT

You are changing the Adviser's **Automated Daily Report** (`/adviser/reports`) in the Asian College
SIL Monitoring System (React 19 + TypeScript + Vite + React Router + Supabase; one dashboard
component per role; the report itself is built in PostgreSQL and stored as JSONB).

Today the page renders the whole day as **one short paragraph** — roughly six sentences — even though
the stored payload carries per-section rows, per-student rows, the students who are behind on SIL
hours with their exact deltas, per-company rows, journal breakdowns and a ranked alert list. Most of
that data is fetched, stored, and then never shown on this page. The paragraph also reads as system
output ("Of your 16 students across 30 sections, none has attendance recorded yet…"), not as
something the adviser wrote and would put their name to.

**The requested change, in three parts:**

1. **Make the report much more detailed, and write it in the adviser's own voice** — a multi-paragraph
   narrative in the first person that uses the payload data the page currently discards.
2. **Add an edit feature** — the adviser can rewrite the narrative in place, save it, and revert to
   the generated text. The edit survives regeneration and is flagged when the figures move under it.
3. **Remove the "Review it now" link** from the journals sentence.

### 1.1 What "Review it now" was for, and why removing it is safe [CONFIRMED]

`AdviserReportView` takes one prop, `onOpenApprovals`, and `AdviserDashboard` passes
`tab => navigateTo('approvals', tab)` (`AdviserDashboard.tsx:426–432`). The **Review it now** link
(`AdviserReportView.tsx:453–464`) called it with `'journals'`, which switched the dashboard to the
**Pending Approvals** view with its journals tab pre-selected. It was a shortcut, nothing more — it
reviewed nothing itself, and the comment at `AdviserReportView.tsx:114–120` says exactly that:
journal approval lives in the one approval workflow the portal already has.

Removing it costs the adviser nothing: **Pending Approvals** is a permanent sidebar item
(`AdviserDashboard.tsx:170`) carrying a live pending badge. So the link is deleted **together with
the prop that existed only to serve it** — see §8.4.

### 1.2 Scope boundary — do not exceed it

* **The database analysis does not change.** `build_adviser_daily_report` (≈500 lines of
  `supabase_adviser_daily_report.sql`) is not touched. No figure is recomputed, re-derived or
  corrected anywhere in this work. The narrative only *reads* figures the payload already carries.
* **No new figure is invented.** If the payload does not carry it, the narrative does not say it.
* **The narrative never states intent, opinion, judgement or a plan.** First person is a matter of
  *voice* ("I have 16 students across 3 sections"), never of *content*. Do not write "I will follow
  up with…", "this is concerning", "I expect…". Every clause must trace to a field in
  `DailyReportPayload`. This is the single most important constraint in this prompt.
* The other report surfaces stay: the **date picker**, **My Reports** history, **Regenerate**,
  **Email**, the regenerate confirm dialog, `UserProfileModal` on a student's name, and the
  "not generated yet" empty state.
* Do **not** touch the Coordinator, Company, Administrator or Student portals, or any other adviser
  view beyond the two files named in §3.

---

## 2. CURRENT IMPLEMENTATION [CONFIRMED]

### 2.1 The stack for this feature

```
App.tsx  Route "/adviser/*"   (role === 'adviser')
 └─ AdviserDashboard.tsx            currentView from location.pathname; 'reports' → 'Automated Daily Report'
     ├─ AdviserOverviewView → AdviserDailyReportCard.tsx     the dashboard card (counts + Generate/Regenerate/Export PDF)
     └─ AdviserReportView.tsx                                 the full page  ← YOUR MAIN EDIT
          ├─ services/adviserReportService.ts   4 RPCs, all scoped to auth.uid()
          ├─ utils/adviserReport.ts             pure presentation helpers (React-free, Supabase-free, unit-tested)
          ├─ utils/adviserReportPdf.ts          buildDailyReportHtml + html2pdf export
          ├─ components/AdviserReport.css       every .adr-* class
          └─ components/UserProfileModal.tsx    opened from a student's name in the paragraph
```

### 2.2 `src/components/AdviserReportView.tsx` — 511 lines, read all of it

| Lines | What |
|---|---|
| 1–15 | imports (`adviserReportService`, `reportDayKey`, three types; `formatClock/formatMinutes/formatReportDate`; `TableRowSkeleton`; `UserProfileModal`; four stylesheets) |
| 17–26 | the file's purpose comment — **keep it, extend it** |
| 29 | `ATTENTION_PREVIEW = 5` — how many students are named before "and N more" |
| 31–61 | inline icons: `Svg`, `IconRefresh`, `IconMail`, `IconHistory`, `IconAlert`, `IconCheck` |
| 63–110 | the wording helpers: `count`, `verb`, `joinList`, `attendanceSentence`, `silSentence` |
| 112–121 | `interface Props { onOpenApprovals?: … }` — **deleted, see §8.4** |
| 126–140 | state: `date`, `report`, `loading`, `generating`, `error`, `notice`, `showAllAttention`, `showHistory`, `history`, `historyLoading`, `confirmRegenerate`, `emailing`, `profileId` |
| 151–155 | the `mounted` ref, **set on the way in** — its comment explains the StrictMode remount bug it fixes. Do not "simplify" it. |
| 157–175 | `load(target)` → `adviserReportService.get` |
| 177–193 | `generate()` → `adviserReportService.generate`, sets `notice` |
| 195–212 | `emailReport()` → `adviserReportService.email` |
| 214–226 | `openHistory()` → `adviserReportService.history(30)` |
| 230–278 | `historyModal`, defined before the early returns because two states use it |
| 281–289 | `loading` early return — a three-bar `.adr-skeleton` inside `.adr-brief-card` |
| 291–338 | `!report` early return — toolbar + "Today's report isn't ready yet" + Generate |
| 340–344 | `const payload = report.report; const { attention, journals, summary } = payload;` |
| 349–387 | the toolbar: identity block + date input + My Reports + Regenerate + Email |
| 390–395 | `.adr-statusline` — slim inline error/notice pills |
| 398–477 | **the report body: one `<p className="adr-brief">`** ← the heart of this change |
| 445–468 | the journals sentence, containing **Review it now** at 453–464 |
| 479–499 | the regenerate confirm dialog |
| 501–505 | `historyModal`, then `UserProfileModal` when `profileId` is set |

**What the single paragraph uses today:** `summary.*`, `attention[]` (name, section, issue),
`ojt.{on_track,completed,monitoring,behind,not_started}`, `journals.{pending,revision}`,
`summary.students_without_company`. **That is all.**

**What the payload carries and this page throws away [CONFIRMED — `adviserReportService.ts:155–211`]:**

* `sections: ReportSectionRow[]` — per section: `students, present, late, absent, incomplete,
  not_recorded, avg_minutes, issues, journals_pending`
* `students: ReportStudent[]` — the full roster with clock in/out, `day_minutes`, `progress_status`,
  `completion_pct`, `progress_delta`, per-student journal counts and `issues[]`
* `ojt.students_behind: ReportBehindRow[]` — `required_hours, rendered_minutes, expected_minutes,
  delta_minutes, completion_pct, status`
* `journals.{submitted_today, entries_for_date, approved, rejected}` and
  `journals.students: ReportJournalRow[]`
* `companies: ReportCompanyRow[]` — per company: `students, present, absent, incomplete,
  avg_minutes, issues`
* `alerts: ReportAlert[]` — `{ rank, code, severity, count, message }`, already ranked and worded
* `settings: { daily_limit_minutes, working_dows, expected_through, default_required_hours }`
* `attention[].company` and `attention[].issues[]` (only `.issue`, the first one, is shown today)

**This is the material for "much more detailed". Nothing new has to be computed.**

### 2.3 `src/utils/adviserReport.ts` [CONFIRMED]

React-free and Supabase-free **on purpose**, so `node --test` can exercise it directly (its header
comment says so, and `package.json` has `test:adviser-report` plus an aggregate `test` script that
includes it). It exports `formatMinutes`, `minutesToHours`, `formatDelta`, `formatReportDate`,
`formatClock`, `STATUS_LABELS`, `STATUS_CLASS`, `PROGRESS_LABELS`, `PROGRESS_COLORS`, `issueTone`,
`AttendanceFilter` + labels, `matchesAttendanceFilter`, `ALERT_TARGET`, `matchesSearch`.

**`ALERT_TARGET`, `matchesAttendanceFilter`, `matchesSearch`, `STATUS_*` and `AttendanceFilter` are
currently imported by nothing in `src/`** — they are from an earlier tabbed design of this page.
**Leave them alone.** Deleting them is unrequested churn and `adviserReport.test.ts` tests them.

**This is where the narrative builder belongs** (§8.2) — it is pure, and the test file already exists.

### 2.4 `src/services/adviserReportService.ts` [CONFIRMED]

Four RPCs, none of which takes an adviser, section or student id — scope is always `auth.uid()`:

| Method | RPC | Notes |
|---|---|---|
| `generate(date?)` | `generate_my_daily_report(p_date)` | builds + upserts, returns the stored row |
| `get(date?)` | `get_my_daily_report(p_date)` | returns `null` when not generated |
| `history(limit, offset)` | `get_my_daily_report_history` | headline counts only, no payload |
| `email(date?, force?)` | `send_my_daily_report_email` | writes one notification row |

Plus `mapReportError(error)` (turns Postgres failures into adviser-readable text — **extend it**,
§8.6) and `reportDayKey(date, tz='Asia/Manila')` (the day key in the attendance timezone, not the
browser's).

### 2.5 The database [CONFIRMED — `supabase_adviser_daily_report.sql`, 1132 lines]

```sql
CREATE TABLE IF NOT EXISTS public.adviser_daily_reports (
  id, adviser_id, report_date, generated_at, generated_by ('manual'|'scheduled'),
  sections_count, students_count, present_count, absent_count, incomplete_count,
  attention_count, pending_journals_count, total_minutes,
  payload JSONB NOT NULL,
  notification_id, emailed_at, created_at, updated_at
);                                                              -- lines 137–158
CREATE UNIQUE INDEX adviser_daily_reports_once_per_day ON (adviser_id, report_date);  -- 162
ALTER TABLE … ENABLE ROW LEVEL SECURITY;                        -- 167
-- SELECT-only policy, own rows. NO insert/update/delete policy, deliberately:
-- "every write goes through the SECURITY DEFINER routines".    -- 169–175
```

* `adviser_daily_report_json(r)` (722–743) is the **one** shape all three readers return. Extending
  it extends `generate`, `get` and any future reader at once.
* `generate_my_daily_report` (745–812): adviser-only, refuses future dates, `ON CONFLICT
  (adviser_id, report_date) DO UPDATE` over the count columns + `payload` + `updated_at`.
  **It does not, and must not, touch the new narrative columns — that is precisely what makes an
  adviser's edit survive Regenerate.**
* `send_my_daily_report_email` (930–993) writes a `user_notifications` row whose body comes from
  `adviser_daily_report_email_body` (909–928) — **counts and the adviser's name only, no student
  names, no companies**, by design (comment at 905–907).
* `generate_all_adviser_daily_reports` (1009) is the scheduled 5 PM run, `generated_by='scheduled'`.

### 2.6 `src/components/AdviserReport.css` [CONFIRMED]

The `.adr-*` system, in two halves: the dashboard card (`.adr-card*`, `.adr-stat*`, `.adr-stages`,
`.adr-attention-banner`) and the page (`.adr-page`, `.adr-toolbar`, `.adr-toolbar-id`,
`.adr-toolbar-meta`, `.adr-meta-strong`, `.adr-toolbar-actions`, `.adr-date`, `.adr-statusline`,
`.adr-status.is-error`, `.adr-status.is-ok`, `.adr-brief`, `.adr-brief-card`, `.adr-brief-link`,
`.adr-modal*`, `.adr-history*`, `.adr-empty`, `.adr-skeleton`, `.adr-btn`, `.adr-btn--primary`),
with responsive blocks at 900 / 820 / 620 / 460 px.

`.adr-brief` (line 407) is capped near 80 characters a line "so the paragraph reads as prose, not as
a wall" — **that decision carries forward to every paragraph you add.**

### 2.7 `src/utils/adviserReportPdf.ts` [CONFIRMED]

`buildDailyReportHtml(report, logo)` (387–427) emits: brand head → `dr-meta` → `summarySection` →
`attentionSection` → `sectionOverview` → `attendanceSection` → `ojtSection` → `journalSection` →
`companySection` → `alertSection` → `dr-foot`. **`escapeHtml` exists at line 35 and every
interpolation goes through it** — this matters in §8.7.

---

## 3. FILES YOU WILL TOUCH

| Path | What |
|---|---|
| `supabase_adviser_report_narrative.sql` | **NEW** — two columns, one RPC, one extended reader. Additive and idempotent. |
| `src/services/adviserReportService.ts` | two fields on `DailyReport`, one `saveNarrative` method, two `mapReportError` cases |
| `src/utils/adviserReport.ts` | the narrative builder + helpers (pure) |
| `src/utils/adviserReport.test.ts` | tests for the above |
| `src/components/AdviserReportView.tsx` | the narrative render, the editor, the Review-it-now removal |
| `src/components/AdviserReport.css` | the new `.adr-narrative*` / `.adr-editor*` rules |
| `src/components/AdviserDashboard.tsx` | **one deletion only** — the `onOpenApprovals` prop it passes |
| `src/utils/adviserReportPdf.ts` | one new section in the PDF (§8.7) |

**Do NOT change:** `supabase_adviser_daily_report.sql` (the new file is additive — the one exception
is noted in §8.1), `AdviserDailyReportCard.tsx`, `UserProfileModal.tsx`, `Skeletons.tsx`,
`attendanceConstants.ts`, `App.tsx`, any other role's views, any other SQL file, `package.json`
dependencies.

The new SQL file follows the precedent of `supabase_grading_sheet_withdraw.sql`: a small, idempotent
add-on beside the large feature file rather than a rewrite of it.

---

## 4. DATA FLOW (after your change)

```
mount / date change
  → adviserReportService.get(date)        rpc get_my_daily_report
  → DailyReport { …counts, report: payload, narrative, narrative_edited_at }   ← two NEW fields

render:
  narrative === null  → buildDailyNarrative(payload)  → NarrativeParagraph[]  → prose + clickable names
  narrative !== null  → the adviser's saved text      → paragraphs (plain text, no name links)
                        + "Edited <time>" pill
                        + if generated_at > narrative_edited_at → stale notice + "Use the new text"

Edit → textarea seeded with narrativeToText(current)
Save → adviserReportService.saveNarrative(date, text)   rpc save_my_daily_report_narrative
     → returns the SAME DailyReport shape → setReport(fresh)
Revert → saveNarrative(date, null) → narrative cleared → generated text renders again

Regenerate → generate_my_daily_report → payload + counts + generated_at replaced,
             narrative UNTOUCHED → the stale notice appears
```

Round-trip count is unchanged for a plain view (one RPC), plus exactly one RPC per save.

---

## 5. ROLE CONTEXT

| Role | Effect |
|---|---|
| **Adviser** | The only role affected. The report is adviser-only at the database level: `generate_my_daily_report` and `send_my_daily_report_email` both `RAISE EXCEPTION` unless `profiles.account_type = 'adviser'`. Your new RPC must apply the same check. |
| **Coordinator / Company / Administrator / Student** | **Zero change.** No other role has a route to `/adviser/reports`, and no other component imports `adviserReportService`. |

An adviser can only ever see and edit **their own** reports: every RPC filters
`adviser_id = auth.uid()`, and the RLS SELECT policy does the same for any direct table read.

---

## 6. REQUESTED CHANGE, PART 1 — the detailed adviser-voiced narrative

### 6.1 The voice

First person, plain, factual, professional. The adviser is the author; the system is not mentioned.

* **Write:** "I am monitoring 16 students across 3 sections today." /
  "Three students need my attention." / "Nine students have no attendance record yet."
* **Never write:** "I will follow up with them." / "This needs urgent action." /
  "The system detected…" / "Of your 16 students…" (that is the old system-to-adviser voice).
* No emoji, no exclamation marks, no headings shouting, no motivational filler, no hedging.
* Keep the existing rules from `AdviserReportView.tsx:63–66`: **a clause whose figure is zero is left
  out**, and a sentence never opens on a digit.
* Reuse the existing `count` / `verb` / `joinList` helpers — move them into the builder module.

### 6.2 The paragraphs

Build **up to eight** paragraphs, each with a short label, each omitted entirely when it has nothing
to say. Order is fixed:

| # | `id` | Label | Built from | Content |
|---|---|---|---|---|
| 1 | `coverage` | Coverage | `summary.sections/students`, `adviser`, `report_date`, `summary.students_without_company` | Who and what I am monitoring today; how many are not yet placed with a company. Always rendered. |
| 2 | `attendance` | Attendance | `summary.{present,late,absent,on_leave,incomplete,not_recorded,attendance_rate,total_minutes}`, `sections[]` | The breakdown and the rate, plus **which sections carry the gaps** — name up to 3 sections with the most `not_recorded` / `absent`, with their own figures. This is the main new detail. |
| 3 | `attention` | Needs my attention | `attention[]` (`name`, `section`, `company`, `issue`, `issues[]`, `priority`) | Named students, **in payload order (already priority-ranked)**, each with section, company when present, and **every** issue label, not just the first. Cap at `ATTENTION_PREVIEW` with the existing "and N more" expander. |
| 4 | `sil` | SIL hours | `ojt.{on_track,completed,monitoring,behind,not_started}`, `ojt.students_behind[]` | The counts as today, then the students furthest behind — name up to 3 with `formatDelta(delta_minutes)` and `completion_pct`. |
| 5 | `journals` | Journals | `journals.{submitted_today,entries_for_date,pending,approved,rejected,revision}`, `journals.students[]` | What came in today, what is waiting on me, what went back for revision — and up to 3 students with pending entries. **No "Review it now" link.** |
| 6 | `companies` | Companies | `companies[]` | How many companies my students are placed with, and the ones with absences or issues today (up to 3), with their figures. |
| 7 | `exceptions` | Exceptions | `alerts[]` | The alert messages, already ranked and worded by the database, `severity === 'danger'` first. Render `a.message` **verbatim** — do not reword it. |
| 8 | `closing` | — | derived | One sentence only, and only when paragraphs 3, 7 are both empty: "Nothing else needs my attention today." Never a plan, never a promise. |

Caps (`3` above, `ATTENTION_PREVIEW = 5`) exist so the narrative stays prose. Export them as named
constants beside `ATTENTION_PREVIEW`; do not scatter magic numbers.

### 6.3 The shape the builder returns

The narrative must be renderable **two ways** — as rich JSX with clickable student names, and as flat
text the adviser can edit. So it is built as segments, not as strings:

```ts
// src/utils/adviserReport.ts
export type NarrativeSegment =
  | { kind: 'text'; value: string }
  | { kind: 'student'; id: string; name: string };   // id = ReportAttentionRow.student_id / ReportBehindRow.student_id

export interface NarrativeParagraph {
  id: 'coverage' | 'attendance' | 'attention' | 'sil' | 'journals' | 'companies' | 'exceptions' | 'closing';
  label: string | null;          // null = no heading (closing)
  segments: NarrativeSegment[];
}

export const buildDailyNarrative = (payload: DailyReportPayload): NarrativeParagraph[] => …;

/** The same narrative as plain text — blank line between paragraphs, "Label: " prefix kept. */
export const narrativeToText = (paragraphs: NarrativeParagraph[]): string => …;

/** The adviser's saved text back into paragraphs for rendering. Splits on blank lines. */
export const textToParagraphs = (text: string): string[] => …;

/** True when the figures were rebuilt after the adviser wrote their version. */
export const isNarrativeStale = (generatedAt: string, editedAt: string | null): boolean => …;
```

`buildDailyNarrative` imports **types only** from `adviserReportService` (the module already does
this, `adviserReport.ts:8–13`) so it stays React-free and Supabase-free.

### 6.4 Rendering it

Replace the single `<p className="adr-brief">` (`AdviserReportView.tsx:398–477`) with:

```tsx
<div className="ad-att-card">
    <div className="adr-narrative">
        {paragraphs.map(p => (
            <section key={p.id}>
                {p.label && <h2 className="adr-narrative-label">{p.label}</h2>}
                <p className="adr-brief">{/* segments → text, or .adr-brief-link button for 'student' */}</p>
            </section>
        ))}
    </div>
</div>
```

* A `student` segment renders as the existing `<button className="adr-brief-link">` that calls
  `setProfileId(id)` — that is how `UserProfileModal` opens today and it must keep working.
* The "and N more" expander (`showAllAttention`) stays, on the `attention` paragraph.
* `.adr-brief` keeps its ~80-character measure; `<h2 className="adr-narrative-label">` is small,
  uppercase-ish, muted — a label, not a headline (see §10).

---

## 7. REQUESTED CHANGE, PART 2 — the edit feature

### 7.1 What the adviser can do

* **Edit** — the narrative becomes a textarea seeded with `narrativeToText(...)` of whatever is
  currently shown (their saved version if any, otherwise the generated one).
* **Save** — stored against that report date; from then on the page shows their version with an
  "Edited · 4:12 PM" pill beside the generated timestamp.
* **Cancel** — discards the draft. If the textarea differs from what it was seeded with, confirm
  first (reuse the `.adr-modal` pattern).
* **Revert to generated** — clears the stored edit; the generated narrative renders again.
  Confirm first; the adviser's text is gone after this.
* **Stale notice** — when the report was regenerated after the edit was written
  (`generated_at > narrative_edited_at`), show a warn pill: *"The figures were rebuilt at 5:02 PM,
  after you wrote this."* with a **Use the newly generated text** button that opens the editor
  seeded with the *fresh* generated narrative. It **never overwrites silently**.

### 7.2 State to add to `AdviserReportView`

`editing: boolean`, `draft: string`, `saving: boolean`, `confirmDiscard: boolean`,
`confirmRevert: boolean`. Nothing else — reuse the existing `error` / `notice` statusline.

### 7.3 Guards

* Changing the **date** or pressing **Regenerate** while `editing` and the draft is dirty → the
  discard confirm first. Do not lose typed text to a date click.
* **Email** and **My Reports** are harmless while editing; leave them enabled.
* `!report` (never generated) → no Edit button at all; there is nothing to edit.
* A past date's report is editable exactly like today's — the adviser owns it either way.

---

## 8. IMPLEMENTATION

### 8.1 `supabase_adviser_report_narrative.sql` — NEW, additive, idempotent

```sql
-- Adviser Daily Report — the adviser's own version of the narrative.
--
-- The generated analysis is never modified: the narrative is stored beside the
-- payload, and generate_my_daily_report's ON CONFLICT list does not mention it,
-- so regenerating the figures leaves the adviser's words intact. The UI compares
-- generated_at with narrative_edited_at to say so.

ALTER TABLE public.adviser_daily_reports
  ADD COLUMN IF NOT EXISTS narrative           TEXT,
  ADD COLUMN IF NOT EXISTS narrative_edited_at TIMESTAMPTZ;

-- Extended so all three readers expose the two new fields at once.
CREATE OR REPLACE FUNCTION public.adviser_daily_report_json(r public.adviser_daily_reports)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    …every existing key, unchanged…,
    'narrative',           r.narrative,
    'narrative_edited_at', r.narrative_edited_at
  );
$$;

CREATE OR REPLACE FUNCTION public.save_my_daily_report_narrative(
  p_date      date,
  p_narrative text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_date date := COALESCE(p_date, (now() AT TIME ZONE public.attendance_time_zone())::date);
  v_text text := NULLIF(btrim(COALESCE(p_narrative, '')), '');   -- empty/blank = revert
  v_row  public.adviser_daily_reports;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT account_type INTO v_role FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_role IS DISTINCT FROM 'adviser' THEN
    RAISE EXCEPTION 'Only advisers can edit the daily SIL report.';
  END IF;

  IF v_text IS NOT NULL AND length(v_text) > 20000 THEN
    RAISE EXCEPTION 'The report narrative is too long.';
  END IF;

  UPDATE public.adviser_daily_reports
     SET narrative           = v_text,
         narrative_edited_at = CASE WHEN v_text IS NULL THEN NULL ELSE now() END,
         updated_at          = now()
   WHERE adviser_id = v_uid AND report_date = v_date
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No report for % yet. Generate it first.', to_char(v_date, 'FMMonth FMDD, YYYY');
  END IF;

  RETURN public.adviser_daily_report_json(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_daily_report_narrative(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_daily_report_narrative(date, text) TO authenticated;
```

**Non-negotiable rules for this file:**

* `WHERE adviser_id = v_uid` is what keeps one adviser out of another's report. There is **no**
  adviser-id parameter, and you must not add one.
* **Do not add an UPDATE policy to `adviser_daily_reports`.** The table is SELECT-only for
  `authenticated` on purpose (comment at lines 169–171); this `SECURITY DEFINER` function is the
  sanctioned write path.
* **Do not touch `generate_my_daily_report`'s `ON CONFLICT … DO UPDATE SET` list.** Adding
  `narrative` there would wipe the adviser's words on every Regenerate — the exact opposite of the
  agreed behaviour.
* `ALTER TABLE … ADD COLUMN IF NOT EXISTS` and `CREATE OR REPLACE` make the file re-runnable.
  **[UNCONFIRMED]** whether this project applies SQL files through the Supabase SQL editor or a
  migration runner — write it to be safe under both, and re-running it must be harmless.
* The one edit permitted inside `supabase_adviser_daily_report.sql` is **none**. If you believe the
  `adviser_daily_report_json` replacement must live in the original file, say so and stop — do not
  rewrite that 1132-line file.

### 8.2 `src/utils/adviserReport.ts`

Add `NarrativeSegment`, `NarrativeParagraph`, `buildDailyNarrative`, `narrativeToText`,
`textToParagraphs`, `isNarrativeStale`, and the caps (`ATTENTION_PREVIEW`, `SECTION_DETAIL_LIMIT`,
`BEHIND_DETAIL_LIMIT`, `JOURNAL_DETAIL_LIMIT`, `COMPANY_DETAIL_LIMIT`). Move `count`, `verb` and
`joinList` here from `AdviserReportView.tsx:69–76` and export them; the view imports them back.

Keep the module free of React and Supabase imports — type-only imports from the service are already
the established pattern and stay.

### 8.3 `src/services/adviserReportService.ts`

```ts
export interface DailyReport {
  …unchanged…
  /** The adviser's own version of the narrative, or null when they have not written one. */
  narrative: string | null;
  narrative_edited_at: string | null;
}

async saveNarrative(date: string, narrative: string | null): Promise<DailyReport> {
  const { data, error } = await supabase.rpc('save_my_daily_report_narrative', {
    p_date: date, p_narrative: narrative,
  });
  if (error) { console.error('save_my_daily_report_narrative failed:', error); throw new Error(mapReportError(error)); }
  return data as DailyReport;
}
```

`DailyReportSummary` (the history row) is **unchanged** — see §16.

### 8.4 `src/components/AdviserReportView.tsx` — remove "Review it now"

Delete, in this order:

1. the `onOpenApprovals` block at **453–464** (the button and its wrapping fragment),
2. the `Props` interface at **112–121** and its doc comment,
3. `({ onOpenApprovals })` from the component signature at **123** — it becomes
   `const AdviserReportView: React.FC = () => {`,
4. in `src/components/AdviserDashboard.tsx`, the prop and its comment at **428–430**, leaving
   `{currentView === 'reports' && <AdviserReportView />}`.

`navigateTo` stays — seven other call sites use it. The journals paragraph keeps its sentence; only
the link goes. **Pending Approvals** in the sidebar remains the way to the journals queue.

### 8.5 `src/components/AdviserReportView.tsx` — the narrative and the editor

Replace `attendanceSentence` / `silSentence` (63–110) with `buildDailyNarrative` from the utils
module. Render per §6.4. Add the editor per §7. Toolbar order becomes:
`date · My Reports · Edit · Regenerate · Email` — Edit sits beside Regenerate because both act on the
report you are looking at. Add one icon in the file's existing inline style (`IconEdit`, a feather
pencil); do not add an icon package.

Keep `mounted`, `load`, `generate`, `emailReport`, `openHistory`, `historyModal`, the three page
states, the confirm-regenerate dialog and `UserProfileModal` exactly as they are, apart from the
guards in §7.3.

### 8.6 `mapReportError`

Add two cases, in the existing style (before the generic fallbacks):

* `text.includes('only advisers can edit')` → "Only Section Advisers can edit this report."
* `text.includes('too long')` → "That report is too long to save. Please shorten it."

`no report for` is already handled (line 274).

### 8.7 `src/utils/adviserReportPdf.ts`

Add one section, rendered **between `dr-meta` and `summarySection`** in `buildDailyReportHtml`:

* when `report.narrative` is set → `<h2>Adviser's Report</h2>` + the adviser's paragraphs, and a
  small line noting it was written by the adviser at `formatClock(report.narrative_edited_at)`;
* otherwise → `<h2>Summary</h2>` + `narrativeToText(buildDailyNarrative(p))` as paragraphs.

**Every piece of adviser text must go through the existing `escapeHtml` (line 35).** The narrative is
free-form adviser input rendered into an HTML string and then into a PDF; skipping `escapeHtml`
turns a `<script>` an adviser typed into markup. React escapes for you on screen — this template
string does not. Style it with the existing `REPORT_STYLE` classes (`dr-section`, `dr-empty`); add
at most one small rule if a paragraph measure needs it.

The **email body is deliberately not changed** (`adviser_daily_report_email_body`, SQL 909–928): it
carries counts and the adviser's name only, never student names, because the email leaves the
system's login boundary. An edited narrative names students, so it stays behind the login. Do not
"improve" this.

### 8.8 `src/components/AdviserReport.css`

Add only these, beside the existing `.adr-brief` block, using the same tokens
(`--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `#0d9488` for the accent):

`.adr-narrative` (a `grid` with ~0.9rem gap), `.adr-narrative-label` (≈0.68rem, 600,
`var(--text-muted)`, letter-spacing, margin-bottom ~0.25rem), `.adr-editor` (textarea: inherits the
page font, ~60vh max, same border/radius/background as `.adr-date`, teal focus ring matching
`.adr-date:focus-visible`), `.adr-editor-actions` (flex, right-aligned, wraps), `.adr-editor-hint`
(small muted line), `.adr-status.is-warn` (amber, matching the `is-error`/`is-ok` shape), and
`.adr-edited-pill` if `.adr-status.is-ok` does not fit.

Extend the existing `@media (max-width: 620px)` / `(460px)` blocks rather than adding new
breakpoints. **No new colour outside the tokens and the hexes already in this file.**

---

## 9. EXPECTED BEHAVIOUR

**The screenshot's state** (16 students, 3 issues, nothing recorded, 1 pending journal) becomes
roughly:

> **Coverage** — I am monitoring 16 students across 3 sections today, September 14, 2026.
> **Attendance** — None of them has an attendance record yet for today. DIT-1A (6 students), DIT-3F
> (5) and DIT-3I (5) are all still unrecorded.
> **Needs my attention** — Three students need my attention: **Frenchelle Jean Inoferio** (DIT-1A,
> behind SIL hours), **francis Seblos** (DIT-3F, behind SIL hours) and **Juline Rubi Lacapag**
> (DIT-3I, behind SIL hours).
> **SIL hours** — 3 are behind schedule, 1 needs monitoring and 12 have not started. The furthest
> behind is Frenchelle Jean Inoferio, −18h against the expected hours, at 12% of the requirement.
> **Journals** — 1 journal entry is waiting for my approval.

(Wording is illustrative; the figures and the omit-if-zero rule are the specification.)

* **Edit** → the card becomes a textarea holding that text; Save → the same words render back, with
  "Edited · 9:34 AM" beside the generated time.
* **Regenerate afterwards** → new figures, the adviser's words still there, plus the stale notice and
  **Use the newly generated text**.
* **Revert to generated** → confirm, then the generated narrative is back and the pill is gone.
* **Switching to a date with no report** → the existing "Today's report isn't ready yet" state, no
  Edit button.
* **Switching date mid-edit with a dirty draft** → discard confirm.
* **A report with no attention, no alerts, no pending journals** → the empty paragraphs are absent
  and the closing sentence appears.
* **Loading / error** → unchanged from today.

---

## 10. UI / UX

The project's direction is **compact, modern, minimalist, professional, information-dense**, and this
page's own established idea is **prose, not tabs of tables**. The change makes the prose longer, not
the page busier.

* Still **one card** holding the narrative. Do not introduce tabs, accordions, stat tiles, charts,
  or a second column. The paragraph labels are the only new structure.
* Keep the ~80-character measure. Eight short paragraphs read; one 300-word block does not.
* Labels are **quiet** — small, muted, weight 600. Not headings, not coloured, not iconed.
* The editor is a plain textarea in the page's own font, sized to the content, with Save / Cancel /
  Revert as existing `.adr-btn` / `.adr-btn--primary`. No rich-text toolbar, no markdown preview, no
  autosave, no new dependency.
* No gradients, no glassmorphism, no emoji, no new animation beyond the existing `fade-in`.
* **Dark mode:** every new rule uses tokens; verify both themes on the narrative, the editor, the
  pills and the modals.
* **Responsive:** verify at ~390 px — the toolbar now has four buttons plus the date input and
  already wraps at 820/620/460 px; the textarea must not overflow the card.
* **Accessibility:** the textarea gets a real `<label>` or `aria-label`; Save/Cancel/Revert are real
  buttons; the stale notice uses `role="status"`, errors `role="alert"` (both patterns already exist
  at lines 390–395); the "and N more" expander stays a button; focus moves into the textarea when
  editing opens and back to the Edit button when it closes.

---

## 11. SECURITY

* The new RPC is `SECURITY DEFINER` with `SET search_path = public, pg_catalog`, takes **no adviser
  id**, and filters `adviser_id = auth.uid()` — matching the three RPCs beside it. Nothing a client
  sends can widen its scope.
* It re-checks `profiles.account_type = 'adviser'` server-side, like `generate_my_daily_report`.
  **A hidden Edit button is not security.**
* `REVOKE ALL … FROM PUBLIC, anon` then `GRANT EXECUTE … TO authenticated`, in that order, exactly as
  the file's other functions do.
* **Do not add an UPDATE/INSERT/DELETE RLS policy** to `adviser_daily_reports`.
* Adviser text is stored as TEXT and rendered by React (escaped) on screen and through `escapeHtml`
  in the PDF (§8.7). The 20 000-character cap is enforced **in the database**, with a matching
  `maxLength` on the textarea for the user's sake — the database one is the real limit.
* The email body stays counts-only (§8.7).
* Do not weaken `mapReportError`: it deliberately hides SQLSTATE/relation/permission text and shows
  only messages the database raised on purpose.

---

## 12. EDGE CASES

1. **Never generated** → no Edit button; Save is unreachable. The RPC also raises "No report for …".
2. **Saved an empty or whitespace-only narrative** → treated as a revert (`NULLIF(btrim(...), '')`),
   `narrative_edited_at` back to NULL, generated text returns. The UI must not show an empty card.
3. **Regenerate while edited** → narrative kept, stale notice shown. Confirm this by reading
   `generate_my_daily_report`'s `ON CONFLICT` list, not by testing alone.
4. **Regenerate while not edited** → nothing new; no stale notice (`narrative` is NULL).
5. **Two tabs open** → last save wins; the RPC returns the stored row, so the UI re-syncs from the
   response rather than from local state. Do not add optimistic-only updates.
6. **A student in `attention` with `name === null`** → the existing "Unnamed student" fallback stays.
7. **`attention.length > ATTENTION_PREVIEW`** → the expander; when the adviser has *edited*, the text
   is whatever they wrote and there is no expander.
8. **Scheduled 5 PM regeneration** (`generate_all_adviser_daily_reports`) → same as case 3: it
   replaces figures, never the narrative. **[UNCONFIRMED]** — that function was not read line by
   line for this prompt; **verify its UPSERT does not set `narrative`, and report what you find.**
9. **A very long narrative** → capped at 20 000 characters, error mapped in §8.6.
10. **A section with 0 students / a company with no rows** → the paragraph is omitted, not rendered
    with "0".
11. **`report_date` in the future** → already impossible; the date input's `max={today}` plus the
    database guard.
12. **Timezone** → all day keys still come from `reportDayKey` (Asia/Manila), never the browser.

---

## 13. REGRESSION PROTECTION — must remain true afterwards

* `build_adviser_daily_report`, `generate_my_daily_report`, `get_my_daily_report`,
  `get_my_daily_report_history`, `send_my_daily_report_email`,
  `adviser_daily_report_email_body` and `generate_all_adviser_daily_reports` are **unchanged**, apart
  from `adviser_daily_report_json` gaining two keys.
* Every existing figure on the page is still the database's figure. No number is computed in
  TypeScript that was not computed there before.
* **Generate**, **Regenerate** (with its confirm dialog), **Email** (including the "already emailed"
  path), **My Reports** history (and jumping to a date from it), the date picker, the three page
  states and the loading skeleton all behave exactly as today.
* Clicking a student's name still opens `UserProfileModal` in the generated narrative.
* `AdviserDailyReportCard` on the Overview — counts, stage list, attention banner, **Export PDF** —
  is untouched and still exports a valid PDF.
* `AdviserDashboard` is untouched apart from the one deleted prop; `navigateTo`, the `View` union,
  the sidebar, `viewTitles.reports` and routing all stay.
* `adviserReport.test.ts`'s existing tests still pass; `npm test` passes.
* No other role's portal changes. No new npm dependency. No renamed export. No file deleted.

---

## 14. IMPLEMENTATION CONSTRAINTS

* **Read in full before writing:** `AdviserReportView.tsx` (511 lines), `adviserReport.ts`,
  `adviserReportService.ts`, `AdviserReport.css`, `supabase_adviser_daily_report.sql` **lines
  120–200 and 700–1000**, `adviserReportPdf.ts` **lines 380–430**, and
  `AdviserDashboard.tsx` **lines 410–435**.
* Match the house style: **4-space indentation in `.tsx`, 2-space in `.ts` utils** (that is the
  existing split — `AdviserReportView.tsx` uses 4, `adviserReport.ts` uses 2), `React.FC`, inline
  feather SVGs, `/* ── Name ── */` dividers, and comments that explain **why**, not what. The
  existing comments about the `mounted` ref and about journals staying in the approvals queue set the
  register; match it.
* TypeScript strict: **no `any`, no non-null assertions, no `@ts-ignore`**, no widening of
  `DailyReportPayload`.
* Do not rename existing exports, reorder functions, or reformat untouched lines.
* Do not delete the unused `adviserReport.ts` exports listed in §2.3.
* SQL style: match the file you are sitting beside — `REVOKE`/`GRANT` after every function, a
  `COMMENT ON FUNCTION` for the new RPC, `SET search_path` on every `SECURITY DEFINER`.

---

## 15. VERIFICATION — do all of these before reporting done

**Build / static**

* `npm run build` (`tsc -b && vite build`) passes with no new errors — in particular no
  unused-declaration error for `attendanceSentence`, `silSentence` or `Props`.
* `npm run lint` reports nothing new.
* `npm test` passes, including the new narrative tests.
* `grep -rn "onOpenApprovals" src/` returns **zero** matches.
* `grep -rn "Review it now\|Review them now" src/` returns **zero** matches.
* `git diff --stat` shows exactly the eight files in §3 and no others.
* Zero new entries in `package.json` dependencies.

**Database**

* Run `supabase_adviser_report_narrative.sql` **twice** — the second run is a no-op, not an error.
* `\d public.adviser_daily_reports` shows the two new columns; every old column is intact.
* As an adviser: `select save_my_daily_report_narrative(current_date, 'test')` returns the report
  JSON with `narrative` set; calling it again with `''` clears it.
* As a **non-adviser** account: the same call raises "Only advisers can edit…".
* Confirm you cannot reach another adviser's report: there is no parameter that would let you try —
  say so explicitly in your report.
* Generate → edit → **Regenerate** → confirm in SQL that `narrative` is still set and `generated_at`
  moved.

**UI — signed in as an adviser with at least one section**

* The report shows several labelled paragraphs, each omitted when empty; the figures in the prose
  match the stored payload (`summary`, `sections[]`, `ojt`, `journals`, `companies`, `alerts`).
* No "Review it now" link anywhere; the journals sentence still reads correctly without it.
* Clicking a student's name opens the profile modal.
* Edit → Save → the adviser's text renders with an "Edited" time. Reload the page: it is still there.
* Regenerate → stale notice appears → **Use the newly generated text** opens the editor with the
  *fresh* text and does **not** overwrite until Save.
* Revert to generated → confirm → generated narrative returns, pill gone.
* Start editing, type, then change the date → discard confirm appears; Cancel keeps the draft.
* **Export PDF** from the Overview card: the PDF carries the adviser's narrative when edited and the
  generated one otherwise, correctly escaped. Test by saving a narrative containing
  `<b>x</b> & "y"` and confirming it appears as literal text in the PDF.
* **Email** still sends the counts-only body, unchanged.
* An adviser with no sections, and a date with no report: both states unchanged.

**Cross-cutting**

* Light and dark mode on every state above.
* ~390 px: the toolbar wraps, the textarea fits, no horizontal page scroll.
* Keyboard only: Tab reaches date → My Reports → Edit → Regenerate → Email → the narrative's student
  links → (in edit mode) textarea → Save → Cancel → Revert, with visible focus throughout.
* Sign in as a coordinator, a company supervisor and an administrator: nothing changed for them.

---

## 16. WHAT THIS PROMPT DELIBERATELY DID NOT ASK FOR

Do not implement any of these, even though they may look like improvements:

* Tabs, tables, charts, stat tiles or a section drill-down on the report page. It stays prose.
* Rich text, markdown, autosave, draft history or version diffing for the edit.
* An "edited" marker in the **My Reports** history list — that needs `get_my_daily_report_history`'s
  `RETURNS TABLE` signature to change, which requires dropping and recreating the function. Out of
  scope. Mention it as a possible follow-up.
* Putting the narrative in the **email** body (§8.7 explains why).
* Letting a coordinator or administrator read or edit an adviser's report.
* Changing any figure, threshold or classification in `build_adviser_daily_report`.
* Touching `AdviserDailyReportCard`'s layout, stages or banner.
* Removing the unused exports in `adviserReport.ts`.

---

## 17. UNKNOWN / UNCONFIRMED — report, do not guess

* **[UNCONFIRMED]** `generate_all_adviser_daily_reports` (SQL line 1009) was not read line by line.
  Verify its UPSERT does not write `narrative`, and report what you find. If it does, the fix is to
  remove `narrative` from its SET list — not to change the column.
* **[UNCONFIRMED]** How SQL files are applied in this project (Supabase SQL editor vs a migration
  runner). Write the file to be idempotent either way and ask before assuming a migrations folder.
* **[CONFIRMED, worth reporting]** The screenshot shows **"16 students across 30 sections"**, and the
  sidebar badge reads 30. Thirty sections for sixteen students is implausible and suggests either
  seeded test data or a counting issue in `build_adviser_daily_report`'s section scope. **Do not
  change the SQL.** After implementing, check `summary.sections` against
  `adviser_sections` for that adviser and **report the finding** — it deserves its own prompt.
* **[CONFIRMED, out of scope]** `ALERT_TARGET`, `matchesAttendanceFilter`, `matchesSearch`,
  `STATUS_LABELS`, `STATUS_CLASS` and `AttendanceFilter` in `adviserReport.ts` are imported by no
  component — leftovers from a tabbed design of this page. Leave them; they are tested.
* **[UNKNOWN]** Whether any adviser has already generated reports in production whose narrative
  column would start NULL. The design handles it (NULL = show generated), but confirm on real data
  rather than only on a fresh row.

---

### One-line summary for the agent

Replace the Daily Report's single generated paragraph with a multi-paragraph, first-person narrative
built by a new pure `buildDailyNarrative` in `src/utils/adviserReport.ts` from the payload data the
page currently discards (per-section rows, students behind on hours, journal detail, companies,
alerts); add an in-place edit stored in two new `adviser_daily_reports` columns through one new
`SECURITY DEFINER` RPC — surviving Regenerate and flagged as stale when the figures move — and delete
the "Review it now" link along with the `onOpenApprovals` prop that existed only to serve it, leaving
every figure, RPC, RLS policy and other role's portal exactly as they are.

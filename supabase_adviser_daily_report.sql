-- ==============================================================================
-- Automated Daily Report — Adviser only
-- ==============================================================================
-- One adviser -> every section assigned to them -> every student in those
-- sections -> ONE consolidated report for the day.
--
-- The adviser never picks a section. The scope is derived from
-- `adviser_sections` on the server, so an adviser cannot widen it by editing a
-- request: the only entry points granted to `authenticated` take no adviser id
-- at all and read auth.uid().
--
-- What this reuses rather than rebuilds
--   * public.canonical_section_name() — the same section resolution every other
--     adviser query uses ("A" + DIT + 1st Year -> "DIT-1A").
--   * public.timesheet_worked_minutes() and public.attendance_time_zone() —
--     the rendered-time rule and the attendance day boundary, unchanged.
--   * public.attendance_daily_limit_minutes() — system_settings -> ojt_hours ->
--     max_daily. Nothing here hard-codes 8 hours.
--   * public.company_attendance — the recorded status. This report reads it and
--     never writes it.
--   * public.user_notifications — writing one row is how an email is sent: the
--     existing `notification_email` webhook and Edge Function do the delivery,
--     the retry accounting and the per-user email preferences. No second mailer.
--   * The anomaly rules mirror src/components/attendanceConstants.ts, so the
--     report flags exactly the rows the attendance monitors flag.
--
-- Contents
--   1. Settings readers for expected OJT progress
--   2. adviser_daily_reports — one stored report per adviser per day
--   3. build_adviser_daily_report() — the analysis, one set-based pass
--   4. generate_my_daily_report() / get_my_daily_report() / history
--   5. send_my_daily_report_email()
--   6. generate_all_adviser_daily_reports() — the 5 PM run
--   7. Supporting indexes
--   8. pg_cron schedule
--
-- Safe to re-run. It creates nothing that already exists and modifies no
-- attendance, journal, student or section row.
-- ==============================================================================


-- ----------------------------------------------------------------------------
-- 1. Expected-progress settings
--
--    "Behind" cannot mean "has not reached the final required hours yet" — that
--    would flag every student on their first day. It means: less rendered than
--    the working days elapsed so far can account for.
--
--    Both inputs are configurable in system_settings -> ojt_hours alongside the
--    existing `required` and `max_daily` keys, so the rule can be tuned without
--    touching this file:
--      working_dows : ISO weekdays that count as OJT days, default Mon-Fri
--      required     : fallback required hours when a profile has none
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ojt_working_dows()
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT array_agg(d::integer ORDER BY d::integer)
       FROM public.system_settings s,
            LATERAL jsonb_array_elements_text(s.value -> 'working_dows') AS d
      WHERE s.key = 'ojt_hours'
        AND jsonb_typeof(s.value -> 'working_dows') = 'array'
        AND d ~ '^[1-7]$'),
    ARRAY[1, 2, 3, 4, 5]);
$$;

COMMENT ON FUNCTION public.ojt_working_dows() IS
  'ISO weekdays (1=Mon .. 7=Sun) counted as OJT working days when projecting expected progress. system_settings -> ojt_hours -> working_dows, default Mon-Fri.';

REVOKE EXECUTE ON FUNCTION public.ojt_working_dows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ojt_working_dows() TO authenticated;

CREATE OR REPLACE FUNCTION public.ojt_default_required_hours()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT GREATEST(1, COALESCE(
    (SELECT (value ->> 'required')::integer
       FROM public.system_settings
      WHERE key = 'ojt_hours'
        AND jsonb_typeof(value -> 'required') = 'number'),
    300));
$$;

COMMENT ON FUNCTION public.ojt_default_required_hours() IS
  'Required OJT hours used when a student profile carries none. system_settings -> ojt_hours -> required.';

REVOKE EXECUTE ON FUNCTION public.ojt_default_required_hours() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ojt_default_required_hours() TO authenticated;

-- How many OJT working days fall in a closed date range. NULL start (a student
-- who has never clocked in) yields 0 — they have no elapsed schedule to be
-- behind against.
CREATE OR REPLACE FUNCTION public.ojt_working_days_between(
  p_from date,
  p_to   date,
  p_dows integer[] DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN 0
    ELSE (
      SELECT count(*)::integer
        FROM generate_series(p_from, p_to, interval '1 day') AS d
       WHERE extract(isodow FROM d)::integer = ANY (COALESCE(p_dows, ARRAY[1, 2, 3, 4, 5]))
    )
  END;
$$;

COMMENT ON FUNCTION public.ojt_working_days_between(date, date, integer[]) IS
  'Count of OJT working days in [p_from, p_to]. Used to project the hours a student is expected to have rendered by a given date.';


-- ----------------------------------------------------------------------------
-- 2. Stored reports
--
--    The payload is kept rather than recomputed on every view, so "yesterday's
--    report" is what the adviser actually saw yesterday — attendance edited
--    later does not silently rewrite history. Regenerating is an explicit act
--    (section 4) and stamps a new generated_at.
--
--    The summary columns are duplicated out of the payload on purpose: the
--    history list and the dashboard card read them without loading a 200-student
--    JSON document.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adviser_daily_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adviser_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date            DATE NOT NULL,
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by           TEXT NOT NULL DEFAULT 'manual'
                           CHECK (generated_by IN ('manual', 'scheduled')),
  sections_count         INTEGER NOT NULL DEFAULT 0,
  students_count         INTEGER NOT NULL DEFAULT 0,
  present_count          INTEGER NOT NULL DEFAULT 0,
  absent_count           INTEGER NOT NULL DEFAULT 0,
  incomplete_count       INTEGER NOT NULL DEFAULT 0,
  attention_count        INTEGER NOT NULL DEFAULT 0,
  pending_journals_count INTEGER NOT NULL DEFAULT 0,
  total_minutes          INTEGER NOT NULL DEFAULT 0,
  payload                JSONB NOT NULL,
  -- The notification whose email carried this report, when one was sent.
  notification_id        UUID REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  emailed_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One report per adviser per day. This is also what makes the 5 PM run and a
-- manual click idempotent rather than duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS adviser_daily_reports_once_per_day
  ON public.adviser_daily_reports (adviser_id, report_date);
CREATE INDEX IF NOT EXISTS adviser_daily_reports_adviser_recent_idx
  ON public.adviser_daily_reports (adviser_id, report_date DESC);

ALTER TABLE public.adviser_daily_reports ENABLE ROW LEVEL SECURITY;

-- Read-only, and only your own. Every write goes through the SECURITY DEFINER
-- routines below, so there is deliberately no INSERT/UPDATE/DELETE policy: a
-- forged request cannot write a report into another adviser's history.
DROP POLICY IF EXISTS "Advisers read their own daily reports" ON public.adviser_daily_reports;
CREATE POLICY "Advisers read their own daily reports"
  ON public.adviser_daily_reports FOR SELECT TO authenticated
  USING (adviser_id = (SELECT auth.uid()));


-- ----------------------------------------------------------------------------
-- 3. The analysis
--
--    One pass, set-based. Every per-student figure is produced by aggregating
--    over the whole roster at once — there is no per-student query anywhere, so
--    an adviser with 7 sections costs the same round trips as one with 1.
--
--    Takes the adviser id as an argument and is therefore NOT granted to
--    `authenticated`: only the wrappers in sections 4-6 may call it, and they
--    supply auth.uid() or run as the scheduler.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_adviser_daily_report(
  p_adviser_id uuid,
  p_date       date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tz            text      := public.attendance_time_zone();
  v_now           timestamptz := now();
  v_limit_minutes integer   := public.attendance_daily_limit_minutes();
  v_dows          integer[] := public.ojt_working_dows();
  v_default_req   integer   := public.ojt_default_required_hours();
  -- Expected progress counts COMPLETED working days only, so a day still in
  -- progress can never make a student read as "behind".
  v_through       date      := p_date - 1;
  v_adviser       jsonb;
  v_result        jsonb;
BEGIN
  SELECT jsonb_build_object(
           'id',           p.auth_user_id,
           'name',         NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           'email',        p.email,
           'adviser_type', p.adviser_type,
           'course',       p.course
         )
    INTO v_adviser
    FROM public.profiles p
   WHERE p.auth_user_id = p_adviser_id;

  IF v_adviser IS NULL THEN
    RAISE EXCEPTION 'No profile found for adviser %.', p_adviser_id;
  END IF;

  WITH
  -- ── Scope: the adviser's own sections, and nothing else ──────────────────
  my_sections AS (
    SELECT s.id, s.name, s.course_code, upper(btrim(s.name)) AS key
      FROM public.adviser_sections a
      JOIN public.sections s ON s.id = a.section_id
     WHERE a.adviser_id = p_adviser_id
       AND a.status = 'active'
  ),
  roster AS (
    SELECT p.auth_user_id      AS uid,
           p.id                AS pid,
           p.first_name, p.last_name, p.email,
           p.company_id,
           COALESCE(NULLIF(p.required_ojt_hours, 0), v_default_req) AS required_hours,
           ms.id               AS section_id,
           ms.name             AS section_name,
           ms.course_code
      FROM public.profiles p
      JOIN my_sections ms
        ON ms.key = public.canonical_section_name(p.section, p.course, p.year_level)
     WHERE p.account_type = 'student'
       AND COALESCE(p.is_active, true) = true
       AND COALESCE(p.approval_status, 'approved') <> 'rejected'
  ),
  -- ── Today's clock records, on the attendance day boundary ────────────────
  day_ts AS (
    SELECT ts.user_id                                   AS uid,
           min(ts.clock_in)                             AS time_in,
           max(ts.clock_out)                            AS time_out,
           count(*)::integer                            AS entries,
           count(*) FILTER (WHERE ts.clock_out IS NULL)::integer AS open_entries,
           COALESCE(sum(public.timesheet_worked_minutes(
             ts.clock_in, ts.clock_out, ts.break_start, ts.break_end, v_now
           )), 0)::integer                              AS minutes,
           bool_or(ts.clock_out IS NOT NULL AND ts.clock_out < ts.clock_in) AS reversed
      FROM public.timesheets ts
      JOIN roster r ON r.uid = ts.user_id
     WHERE COALESCE(ts.approval_status, 'pending') <> 'rejected'
       AND (ts.clock_in AT TIME ZONE v_tz)::date = p_date
     GROUP BY ts.user_id
  ),
  -- ── Accumulated OJT: closed sessions only, matching the attendance monitors ──
  life_ts AS (
    SELECT ts.user_id AS uid,
           COALESCE(sum(public.timesheet_worked_minutes(
             ts.clock_in, ts.clock_out, ts.break_start, ts.break_end, v_now
           )), 0)::integer                                  AS minutes,
           min((ts.clock_in AT TIME ZONE v_tz)::date)       AS started_on,
           count(DISTINCT (ts.clock_in AT TIME ZONE v_tz)::date)::integer AS logged_days
      FROM public.timesheets ts
      JOIN roster r ON r.uid = ts.user_id
     WHERE COALESCE(ts.approval_status, 'pending') <> 'rejected'
       AND ts.clock_out IS NOT NULL
       AND ts.clock_out > ts.clock_in
       AND (ts.clock_in AT TIME ZONE v_tz)::date <= p_date
     GROUP BY ts.user_id
  ),
  -- ── The supervisor's recorded status for the day ─────────────────────────
  att AS (
    SELECT ca.student_id AS uid, ca.status, ca.reason, ca.remarks
      FROM public.company_attendance ca
      JOIN roster r ON r.uid = ca.student_id
     WHERE ca.attendance_date = p_date
  ),
  -- ── Journals: today's activity plus the standing backlog ─────────────────
  jr AS (
    SELECT j.user_id AS uid,
           count(*) FILTER (WHERE j.entry_date = p_date)::integer                           AS today_entries,
           count(*) FILTER (WHERE (j.created_at AT TIME ZONE v_tz)::date = p_date)::integer AS submitted_today,
           count(*) FILTER (WHERE COALESCE(j.approval_status, 'pending') = 'pending')::integer AS pending,
           count(*) FILTER (WHERE j.approval_status = 'approved')::integer                  AS approved,
           count(*) FILTER (WHERE j.approval_status = 'rejected')::integer                  AS rejected,
           count(*) FILTER (WHERE j.status = 'revision_requested')::integer                 AS revision,
           max(j.entry_date)                                                                AS last_entry_date
      FROM public.daily_journals j
      JOIN roster r ON r.uid = j.user_id
     GROUP BY j.user_id
  ),
  -- ── One row per student, every derived figure resolved ───────────────────
  stu AS (
    SELECT
      r.uid, r.pid, r.first_name, r.last_name, r.email,
      r.section_id, r.section_name, r.course_code,
      r.company_id,
      COALESCE(c.name, '')                       AS company_name,
      r.required_hours,
      d.time_in,
      d.time_out,
      COALESCE(d.minutes, 0)                     AS day_minutes,
      COALESCE(d.entries, 0)                     AS entries,
      COALESCE(d.open_entries, 0)                AS open_entries,
      COALESCE(d.reversed, false)                AS reversed,
      COALESCE(l.minutes, 0)                     AS rendered_minutes,
      l.started_on,
      COALESCE(l.logged_days, 0)                 AS logged_days,
      a.status                                   AS recorded_status,
      a.reason, a.remarks,
      COALESCE(j.today_entries, 0)               AS journal_today,
      COALESCE(j.submitted_today, 0)             AS journal_submitted_today,
      COALESCE(j.pending, 0)                     AS journal_pending,
      COALESCE(j.approved, 0)                    AS journal_approved,
      COALESCE(j.rejected, 0)                    AS journal_rejected,
      COALESCE(j.revision, 0)                    AS journal_revision,
      j.last_entry_date,
      -- Recorded status always wins; only an unrecorded day is inferred, so a
      -- student nobody has marked reads as "not recorded", never as absent.
      COALESCE(
        a.status,
        CASE
          WHEN COALESCE(d.open_entries, 0) > 0                   THEN 'incomplete'
          WHEN d.time_in IS NOT NULL AND d.time_out IS NOT NULL   THEN 'present'
          ELSE NULL
        END
      )                                          AS effective_status,
      -- Expected hours by the end of yesterday, capped at what is required.
      LEAST(
        r.required_hours * 60,
        public.ojt_working_days_between(l.started_on, v_through, v_dows) * v_limit_minutes
      )                                          AS expected_minutes
      FROM roster r
      LEFT JOIN day_ts  d ON d.uid = r.uid
      LEFT JOIN life_ts l ON l.uid = r.uid
      LEFT JOIN att     a ON a.uid = r.uid
      LEFT JOIN jr      j ON j.uid = r.uid
      LEFT JOIN public.companies c ON c.id = r.company_id
  ),
  -- ── Progress banding and the day's issue flags ───────────────────────────
  flagged AS (
    SELECT s.*,
           GREATEST(0, s.required_hours * 60 - s.rendered_minutes) AS remaining_minutes,
           CASE WHEN s.required_hours > 0
                THEN LEAST(100, round((s.rendered_minutes::numeric / (s.required_hours * 60)) * 100, 1))
                ELSE 0 END                                          AS completion_pct,
           s.rendered_minutes - s.expected_minutes                  AS progress_delta,
           CASE
             WHEN s.rendered_minutes >= s.required_hours * 60          THEN 'completed'
             WHEN s.started_on IS NULL                                 THEN 'not_started'
             WHEN s.rendered_minutes - s.expected_minutes <= -v_limit_minutes THEN 'behind'
             WHEN s.rendered_minutes < s.expected_minutes              THEN 'monitoring'
             ELSE 'on_track'
           END                                                      AS progress_status,
           -- Every flag below is a stated rule about the record, never a guess
           -- about the student.
           (s.open_entries > 0)                                     AS f_missing_out,
           (s.recorded_status IN ('present', 'late') AND s.entries = 0) AS f_missing_in,
           (s.day_minutes > v_limit_minutes)                        AS f_over_limit,
           (s.reversed
             OR s.entries > 1
             OR s.day_minutes > 960
             OR (s.time_in IS NOT NULL AND s.time_out IS NOT NULL
                 AND s.day_minutes > 0 AND s.day_minutes < 60))     AS f_suspicious,
           (s.recorded_status = 'absent')                           AS f_absent,
           (s.recorded_status = 'incomplete')                       AS f_incomplete,
           (s.journal_revision > 0 OR s.journal_rejected > 0)       AS f_journal
      FROM stu s
  ),
  scored AS (
    SELECT f.*,
           (f.progress_status = 'behind') AS f_behind
      FROM flagged f
  ),
  -- ── The issue labels, as an array per student ────────────────────────────
  --    `ord` is the priority order from section 10 of the specification, so the
  --    issue an adviser should act on first is both the label shown and the
  --    student's rank in the attention list.
  issues AS (
    SELECT sc.uid,
           jsonb_agg(
             jsonb_build_object('code', v.code, 'label', v.label, 'rank', v.ord)
             ORDER BY v.ord
           )            AS list,
           min(v.ord)   AS top_rank
      FROM scored sc
      CROSS JOIN LATERAL (
        VALUES
          (1, sc.f_missing_out, 'missing_clock_out', 'Missing Clock-out'),
          (2, sc.f_missing_in,  'missing_clock_in',  'Missing Clock-in'),
          (3, sc.f_over_limit,  'over_limit',        'Exceeded ' || (v_limit_minutes / 60) || ' Hours'),
          (4, sc.f_suspicious,  'suspicious',        'Suspicious Attendance'),
          (5, sc.f_absent,      'absent',            'Absent Today'),
          (6, sc.f_behind,      'behind_ojt',        'Behind OJT Hours'),
          (7, sc.f_journal,     'journal',           'Journal Needs Revision'),
          (8, sc.f_incomplete,  'incomplete',        'Incomplete Log')
      ) AS v(ord, hit, code, label)
     WHERE v.hit
     GROUP BY sc.uid
  ),
  students AS (
    SELECT sc.*,
           COALESCE(i.list, '[]'::jsonb) AS issue_list,
           i.top_rank
      FROM scored sc
      LEFT JOIN issues i ON i.uid = sc.uid
  ),
  -- ── Aggregations ─────────────────────────────────────────────────────────
  totals AS (
    SELECT
      count(*)::integer                                                        AS students,
      count(*) FILTER (WHERE effective_status = 'present')::integer            AS present,
      count(*) FILTER (WHERE effective_status = 'late')::integer               AS late,
      count(*) FILTER (WHERE effective_status = 'absent')::integer             AS absent,
      count(*) FILTER (WHERE effective_status = 'incomplete')::integer         AS incomplete,
      count(*) FILTER (WHERE effective_status = 'on_leave')::integer           AS on_leave,
      count(*) FILTER (WHERE effective_status IS NULL)::integer                AS not_recorded,
      COALESCE(sum(day_minutes), 0)::integer                                   AS total_minutes,
      count(*) FILTER (WHERE top_rank IS NOT NULL)::integer                    AS attention,
      COALESCE(sum(journal_pending), 0)::integer                               AS journals_pending,
      COALESCE(sum(journal_submitted_today), 0)::integer                       AS journals_submitted_today,
      COALESCE(sum(journal_today), 0)::integer                                 AS journals_for_today,
      COALESCE(sum(journal_approved), 0)::integer                              AS journals_approved,
      COALESCE(sum(journal_rejected), 0)::integer                              AS journals_rejected,
      COALESCE(sum(journal_revision), 0)::integer                              AS journals_revision,
      count(*) FILTER (WHERE progress_status = 'on_track')::integer            AS ojt_on_track,
      count(*) FILTER (WHERE progress_status = 'completed')::integer           AS ojt_completed,
      count(*) FILTER (WHERE progress_status = 'monitoring')::integer          AS ojt_monitoring,
      count(*) FILTER (WHERE progress_status = 'behind')::integer              AS ojt_behind,
      count(*) FILTER (WHERE progress_status = 'not_started')::integer         AS ojt_not_started,
      count(*) FILTER (WHERE f_missing_out)::integer                           AS c_missing_out,
      count(*) FILTER (WHERE f_missing_in)::integer                            AS c_missing_in,
      count(*) FILTER (WHERE f_over_limit)::integer                            AS c_over_limit,
      count(*) FILTER (WHERE f_suspicious)::integer                            AS c_suspicious,
      count(*) FILTER (WHERE company_id IS NULL)::integer                      AS c_no_company
      FROM students
  ),
  by_section AS (
    SELECT ms.id, ms.name, ms.course_code,
           count(st.uid)::integer                                               AS students,
           count(*) FILTER (WHERE st.effective_status = 'present')::integer     AS present,
           count(*) FILTER (WHERE st.effective_status = 'late')::integer        AS late,
           count(*) FILTER (WHERE st.effective_status = 'absent')::integer      AS absent,
           count(*) FILTER (WHERE st.effective_status = 'incomplete')::integer  AS incomplete,
           count(*) FILTER (WHERE st.uid IS NOT NULL AND st.effective_status IS NULL)::integer AS not_recorded,
           COALESCE(round(avg(st.day_minutes), 0), 0)::integer                  AS avg_minutes,
           count(*) FILTER (WHERE st.top_rank IS NOT NULL)::integer             AS issues,
           COALESCE(sum(st.journal_pending), 0)::integer                        AS journals_pending
      FROM my_sections ms
      LEFT JOIN students st ON st.section_id = ms.id
     GROUP BY ms.id, ms.name, ms.course_code
  ),
  by_company AS (
    SELECT st.company_id,
           CASE WHEN st.company_id IS NULL THEN 'Not yet deployed'
                ELSE COALESCE(NULLIF(st.company_name, ''), 'Unknown company') END AS name,
           count(*)::integer                                                      AS students,
           count(*) FILTER (WHERE st.effective_status = 'present')::integer       AS present,
           count(*) FILTER (WHERE st.effective_status = 'absent')::integer        AS absent,
           count(*) FILTER (WHERE st.effective_status = 'incomplete')::integer    AS incomplete,
           COALESCE(round(avg(st.day_minutes), 0), 0)::integer                    AS avg_minutes,
           count(*) FILTER (WHERE st.top_rank IS NOT NULL)::integer               AS issues
      FROM students st
     GROUP BY st.company_id,
              CASE WHEN st.company_id IS NULL THEN 'Not yet deployed'
                   ELSE COALESCE(NULLIF(st.company_name, ''), 'Unknown company') END
  ),
  -- ── Serialisation ────────────────────────────────────────────────────────
  student_rows AS (
    SELECT jsonb_agg(row ORDER BY section_name, last_name NULLS LAST, first_name NULLS LAST) AS list
      FROM (
        SELECT st.section_name, st.last_name, st.first_name,
               jsonb_build_object(
                 'student_id',        st.uid,
                 'profile_id',        st.pid,
                 'name',              NULLIF(btrim(concat_ws(' ', st.first_name, st.last_name)), ''),
                 'first_name',        st.first_name,
                 'last_name',         st.last_name,
                 'email',             st.email,
                 'section_id',        st.section_id,
                 'section',           st.section_name,
                 'course_code',       st.course_code,
                 'company_id',        st.company_id,
                 'company',           NULLIF(st.company_name, ''),
                 'clock_in',          st.time_in,
                 'clock_out',         st.time_out,
                 'entries',           st.entries,
                 'open_entries',      st.open_entries,
                 'day_minutes',       st.day_minutes,
                 'status',            st.effective_status,
                 'recorded_status',   st.recorded_status,
                 'reason',            st.reason,
                 'remarks',           st.remarks,
                 'required_hours',    st.required_hours,
                 'rendered_minutes',  st.rendered_minutes,
                 'expected_minutes',  st.expected_minutes,
                 'remaining_minutes', st.remaining_minutes,
                 'completion_pct',    st.completion_pct,
                 'progress_delta',    st.progress_delta,
                 'progress_status',   st.progress_status,
                 'started_on',        st.started_on,
                 'logged_days',       st.logged_days,
                 'journal_today',     st.journal_today,
                 'journal_pending',   st.journal_pending,
                 'journal_approved',  st.journal_approved,
                 'journal_rejected',  st.journal_rejected,
                 'journal_revision',  st.journal_revision,
                 'last_journal_date', st.last_entry_date,
                 'issues',            st.issue_list,
                 'priority',          st.top_rank
               ) AS row
          FROM students st
      ) q
  ),
  attention_rows AS (
    SELECT jsonb_agg(row ORDER BY top_rank, section_name, last_name NULLS LAST) AS list
      FROM (
        SELECT st.top_rank, st.section_name, st.last_name,
               jsonb_build_object(
                 'student_id', st.uid,
                 'name',       NULLIF(btrim(concat_ws(' ', st.first_name, st.last_name)), ''),
                 'section',    st.section_name,
                 'section_id', st.section_id,
                 'company',    NULLIF(st.company_name, ''),
                 'issue',      st.issue_list -> 0 ->> 'label',
                 'issue_code', st.issue_list -> 0 ->> 'code',
                 'issues',     st.issue_list,
                 'priority',   st.top_rank
               ) AS row
          FROM students st
         WHERE st.top_rank IS NOT NULL
      ) q
  ),
  behind_rows AS (
    SELECT jsonb_agg(row ORDER BY delta) AS list
      FROM (
        SELECT st.progress_delta AS delta,
               jsonb_build_object(
                 'student_id',       st.uid,
                 'name',             NULLIF(btrim(concat_ws(' ', st.first_name, st.last_name)), ''),
                 'section',          st.section_name,
                 'company',          NULLIF(st.company_name, ''),
                 'required_hours',   st.required_hours,
                 'rendered_minutes', st.rendered_minutes,
                 'expected_minutes', st.expected_minutes,
                 'delta_minutes',    st.progress_delta,
                 'completion_pct',   st.completion_pct,
                 'status',           st.progress_status
               ) AS row
          FROM students st
         WHERE st.progress_status = 'behind'
      ) q
  ),
  journal_rows AS (
    SELECT jsonb_agg(row ORDER BY section_name, last_name NULLS LAST) AS list
      FROM (
        SELECT st.section_name, st.last_name,
               jsonb_build_object(
                 'student_id',       st.uid,
                 'name',             NULLIF(btrim(concat_ws(' ', st.first_name, st.last_name)), ''),
                 'section',          st.section_name,
                 'pending',          st.journal_pending,
                 'approved',         st.journal_approved,
                 'rejected',         st.journal_rejected,
                 'revision',         st.journal_revision,
                 'submitted_today',  st.journal_submitted_today,
                 'entry_today',      st.journal_today > 0,
                 'last_entry_date',  st.last_entry_date
               ) AS row
          FROM students st
         WHERE st.journal_pending > 0
            OR st.journal_revision > 0
            OR st.journal_rejected > 0
            OR st.journal_submitted_today > 0
      ) q
  ),
  section_rows AS (
    SELECT jsonb_agg(jsonb_build_object(
             'section_id',       bs.id,
             'section',          bs.name,
             'course_code',      bs.course_code,
             'students',         bs.students,
             'present',          bs.present,
             'late',             bs.late,
             'absent',           bs.absent,
             'incomplete',       bs.incomplete,
             'not_recorded',     bs.not_recorded,
             'avg_minutes',      bs.avg_minutes,
             'issues',           bs.issues,
             'journals_pending', bs.journals_pending
           ) ORDER BY bs.name) AS list
      FROM by_section bs
  ),
  company_rows AS (
    SELECT jsonb_agg(jsonb_build_object(
             'company_id',  bc.company_id,
             'company',     bc.name,
             'students',    bc.students,
             'present',     bc.present,
             'absent',      bc.absent,
             'incomplete',  bc.incomplete,
             'avg_minutes', bc.avg_minutes,
             'issues',      bc.issues
           ) ORDER BY bc.students DESC, bc.name) AS list
      FROM by_company bc
  )
  SELECT jsonb_build_object(
    'version',      1,
    'report_date',  p_date,
    'generated_at', v_now,
    'time_zone',    v_tz,
    'adviser',      v_adviser,
    'settings', jsonb_build_object(
      'daily_limit_minutes',  v_limit_minutes,
      'working_dows',         to_jsonb(v_dows),
      'expected_through',     v_through,
      'default_required_hours', v_default_req
    ),
    'summary', jsonb_build_object(
      'sections',                 (SELECT count(*)::integer FROM my_sections),
      'students',                 t.students,
      'present',                  t.present,
      'late',                     t.late,
      'absent',                   t.absent,
      'incomplete',               t.incomplete,
      'on_leave',                 t.on_leave,
      'not_recorded',             t.not_recorded,
      'attendance_rate',          CASE WHEN t.students > 0
                                       THEN round(((t.present + t.late + t.on_leave)::numeric / t.students) * 100, 1)
                                       ELSE 0 END,
      'total_minutes',            t.total_minutes,
      'attention',                t.attention,
      'journals_pending',         t.journals_pending,
      'journals_submitted_today', t.journals_submitted_today,
      'students_without_company', t.c_no_company
    ),
    'sections',   COALESCE((SELECT list FROM section_rows), '[]'::jsonb),
    'students',   COALESCE((SELECT list FROM student_rows), '[]'::jsonb),
    'attention',  COALESCE((SELECT list FROM attention_rows), '[]'::jsonb),
    'ojt', jsonb_build_object(
      'on_track',    t.ojt_on_track,
      'completed',   t.ojt_completed,
      'monitoring',  t.ojt_monitoring,
      'behind',      t.ojt_behind,
      'not_started', t.ojt_not_started,
      'students_behind', COALESCE((SELECT list FROM behind_rows), '[]'::jsonb)
    ),
    'journals', jsonb_build_object(
      'submitted_today',  t.journals_submitted_today,
      'entries_for_date', t.journals_for_today,
      'pending',          t.journals_pending,
      'approved',         t.journals_approved,
      'rejected',         t.journals_rejected,
      'revision',         t.journals_revision,
      'students',         COALESCE((SELECT list FROM journal_rows), '[]'::jsonb)
    ),
    'companies', COALESCE((SELECT list FROM company_rows), '[]'::jsonb),
    'alerts', (
      SELECT COALESCE(jsonb_agg(
               jsonb_build_object('rank', v.ord, 'code', v.code,
                                  'severity', v.severity, 'count', v.n,
                                  'message', v.message)
               ORDER BY v.ord), '[]'::jsonb)
        FROM (
          VALUES
            (1, 'missing_clock_out', 'danger',  t.c_missing_out,
             t.c_missing_out || ' student(s) have missing clock-outs.'),
            (2, 'missing_clock_in',  'danger',  t.c_missing_in,
             t.c_missing_in || ' student(s) were marked present without a clock-in.'),
            (3, 'over_limit',        'warning', t.c_over_limit,
             t.c_over_limit || ' student(s) exceeded the ' || (v_limit_minutes / 60) || '-hour daily limit.'),
            (4, 'suspicious',        'warning', t.c_suspicious,
             t.c_suspicious || ' student(s) have attendance records worth a second look.'),
            (5, 'absent',            'danger',  t.absent,
             t.absent || ' student(s) are absent today.'),
            (6, 'behind_ojt',        'warning', t.ojt_behind,
             t.ojt_behind || ' student(s) are behind expected OJT progress.'),
            (7, 'journals_pending',  'info',    t.journals_pending,
             t.journals_pending || ' journal(s) are pending approval.'),
            (8, 'journals_revision', 'info',    t.journals_revision,
             t.journals_revision || ' journal(s) need revision.'),
            (9, 'no_company',        'info',    t.c_no_company,
             t.c_no_company || ' student(s) have no company assigned.')
        ) AS v(ord, code, severity, n, message)
       WHERE v.n > 0
    )
  )
    INTO v_result
    FROM totals t;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.build_adviser_daily_report(uuid, date) IS
  'Builds one consolidated daily report across every section assigned to the given adviser. Internal: only the auth.uid()-scoped wrappers and the scheduled run may call it.';

REVOKE ALL ON FUNCTION public.build_adviser_daily_report(uuid, date) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. What the adviser portal calls
--
--    None of these accept an adviser id. The scope is auth.uid(), so there is
--    no parameter an adviser could change to reach another adviser's students.
-- ----------------------------------------------------------------------------

-- Shared shape for a stored report, so the three readers agree.
CREATE OR REPLACE FUNCTION public.adviser_daily_report_json(r public.adviser_daily_reports)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id',                     r.id,
    'report_date',            r.report_date,
    'generated_at',           r.generated_at,
    'generated_by',           r.generated_by,
    'emailed_at',             r.emailed_at,
    'sections_count',         r.sections_count,
    'students_count',         r.students_count,
    'present_count',          r.present_count,
    'absent_count',           r.absent_count,
    'incomplete_count',       r.incomplete_count,
    'attention_count',        r.attention_count,
    'pending_journals_count', r.pending_journals_count,
    'total_minutes',          r.total_minutes,
    'report',                 r.payload
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_my_daily_report(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_today  date := (now() AT TIME ZONE public.attendance_time_zone())::date;
  v_date   date := COALESCE(p_date, v_today);
  v_report jsonb;
  v_row    public.adviser_daily_reports;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type INTO v_role
    FROM public.profiles WHERE auth_user_id = v_uid;

  -- Adviser-only by design: this report exists for the adviser's daily round.
  IF v_role IS DISTINCT FROM 'adviser' THEN
    RAISE EXCEPTION 'Only advisers can generate the daily SIL/OJT report.';
  END IF;

  IF v_date > v_today THEN
    RAISE EXCEPTION 'A report cannot be generated for a future date.';
  END IF;

  v_report := public.build_adviser_daily_report(v_uid, v_date);

  INSERT INTO public.adviser_daily_reports AS r (
    adviser_id, report_date, generated_at, generated_by,
    sections_count, students_count, present_count, absent_count,
    incomplete_count, attention_count, pending_journals_count, total_minutes,
    payload
  ) VALUES (
    v_uid, v_date, now(), 'manual',
    (v_report -> 'summary' ->> 'sections')::integer,
    (v_report -> 'summary' ->> 'students')::integer,
    (v_report -> 'summary' ->> 'present')::integer,
    (v_report -> 'summary' ->> 'absent')::integer,
    (v_report -> 'summary' ->> 'incomplete')::integer,
    (v_report -> 'summary' ->> 'attention')::integer,
    (v_report -> 'summary' ->> 'journals_pending')::integer,
    (v_report -> 'summary' ->> 'total_minutes')::integer,
    v_report
  )
  ON CONFLICT (adviser_id, report_date) DO UPDATE
    SET generated_at           = EXCLUDED.generated_at,
        generated_by           = EXCLUDED.generated_by,
        sections_count         = EXCLUDED.sections_count,
        students_count         = EXCLUDED.students_count,
        present_count          = EXCLUDED.present_count,
        absent_count           = EXCLUDED.absent_count,
        incomplete_count       = EXCLUDED.incomplete_count,
        attention_count        = EXCLUDED.attention_count,
        pending_journals_count = EXCLUDED.pending_journals_count,
        total_minutes          = EXCLUDED.total_minutes,
        payload                = EXCLUDED.payload,
        updated_at             = now()
  RETURNING r.* INTO v_row;

  RETURN public.adviser_daily_report_json(v_row);
END;
$$;

COMMENT ON FUNCTION public.generate_my_daily_report(date) IS
  'Generates (or regenerates) the calling adviser''s consolidated daily report and stores it. Adviser-only; the section scope comes from auth.uid().';

REVOKE ALL ON FUNCTION public.generate_my_daily_report(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_my_daily_report(date) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_my_daily_report(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_date date := COALESCE(p_date, (now() AT TIME ZONE public.attendance_time_zone())::date);
  v_row  public.adviser_daily_reports;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
    FROM public.adviser_daily_reports
   WHERE adviser_id = v_uid AND report_date = v_date;

  IF NOT FOUND THEN
    RETURN NULL;   -- "not generated yet", which the card renders as its own state
  END IF;

  RETURN public.adviser_daily_report_json(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_daily_report(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_daily_report(date) TO authenticated;


-- History list. Deliberately excludes `payload`: the list needs headline counts,
-- not thirty 200-student documents.
CREATE OR REPLACE FUNCTION public.get_my_daily_report_history(
  p_limit  integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id                     uuid,
  report_date            date,
  generated_at           timestamptz,
  generated_by           text,
  emailed_at             timestamptz,
  sections_count         integer,
  students_count         integer,
  present_count          integer,
  absent_count           integer,
  incomplete_count       integer,
  attention_count        integer,
  pending_journals_count integer,
  total_minutes          integer,
  total_count            bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT r.id, r.report_date, r.generated_at, r.generated_by, r.emailed_at,
         r.sections_count, r.students_count, r.present_count, r.absent_count,
         r.incomplete_count, r.attention_count, r.pending_journals_count,
         r.total_minutes,
         count(*) OVER () AS total_count
    FROM public.adviser_daily_reports r
   WHERE r.adviser_id = auth.uid()
   ORDER BY r.report_date DESC
   LIMIT GREATEST(1, LEAST(100, COALESCE(p_limit, 30)))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.get_my_daily_report_history(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_daily_report_history(integer, integer) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Emailing a report
--
--    "Send the email" means "write one notification row": the existing
--    notification_email webhook owns delivery, retries and the recipient's own
--    email preferences. Nothing here talks to a mail provider, and no second
--    notification is created for a report that already has one unless the
--    adviser explicitly asks again.
--
--    The body carries counts and the adviser's own name only — no student
--    names, no companies, no record ids. The report itself stays behind the
--    login.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adviser_daily_report_email_body(
  p_adviser_name text,
  p_row          public.adviser_daily_reports
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Daily SIL/OJT Monitoring Report' || E'\n\n'
      || 'Adviser: ' || COALESCE(p_adviser_name, 'Section Adviser') || E'\n'
      || 'Date: ' || to_char(p_row.report_date, 'FMMonth FMDD, YYYY') || E'\n'
      || 'Sections: ' || p_row.sections_count || E'\n'
      || 'Students: ' || p_row.students_count || E'\n\n'
      || 'Present: ' || p_row.present_count || E'\n'
      || 'Absent: ' || p_row.absent_count || E'\n'
      || 'Incomplete: ' || p_row.incomplete_count || E'\n'
      || 'Students Needing Attention: ' || p_row.attention_count || E'\n'
      || 'Pending Journals: ' || p_row.pending_journals_count || E'\n\n'
      || 'Open your Adviser portal to review the full report.';
$$;

CREATE OR REPLACE FUNCTION public.send_my_daily_report_email(
  p_date  date    DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
  v_date  date := COALESCE(p_date, (now() AT TIME ZONE public.attendance_time_zone())::date);
  v_row   public.adviser_daily_reports;
  v_name  text;
  v_notif uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type,
         NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
    INTO v_role, v_name
    FROM public.profiles WHERE auth_user_id = v_uid;

  IF v_role IS DISTINCT FROM 'adviser' THEN
    RAISE EXCEPTION 'Only advisers can email the daily SIL/OJT report.';
  END IF;

  SELECT * INTO v_row
    FROM public.adviser_daily_reports
   WHERE adviser_id = v_uid AND report_date = v_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no report for % yet. Generate it first.', to_char(v_date, 'FMMonth FMDD, YYYY');
  END IF;

  IF v_row.notification_id IS NOT NULL AND NOT p_force THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'already_sent', 'emailed_at', v_row.emailed_at);
  END IF;

  INSERT INTO public.user_notifications (
    user_id, title, message, type, is_read,
    notification_type, related_type, related_id, action_path, action_label
  ) VALUES (
    v_uid,
    'Daily SIL/OJT Report — ' || to_char(v_row.report_date, 'FMMonth FMDD, YYYY'),
    public.adviser_daily_report_email_body(v_name, v_row),
    CASE WHEN v_row.attention_count > 0 THEN 'warning' ELSE 'info' END,
    false,
    'system', 'adviser_daily_report', v_row.id,
    '/adviser/reports', 'View full report'
  )
  RETURNING id INTO v_notif;

  UPDATE public.adviser_daily_reports
     SET notification_id = v_notif, emailed_at = now(), updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('sent', true, 'notification_id', v_notif);
END;
$$;

REVOKE ALL ON FUNCTION public.send_my_daily_report_email(date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_my_daily_report_email(date, boolean) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. The 5 PM run
--
--    Every adviser holding at least one active section gets ONE report — never
--    one per section. Idempotent: the unique (adviser_id, report_date) index
--    means a second run of the same day updates rather than duplicates, and the
--    notification is only created the first time.
--
--    A failure for one adviser must not abandon the rest, so each is wrapped.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_all_adviser_daily_reports(
  p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_date     date := COALESCE(p_date, (now() AT TIME ZONE public.attendance_time_zone())::date);
  v_adviser  record;
  v_report   jsonb;
  v_row      public.adviser_daily_reports;
  v_notif    uuid;
  v_built    integer := 0;
  v_notified integer := 0;
  v_failed   integer := 0;
BEGIN
  FOR v_adviser IN
    SELECT DISTINCT p.auth_user_id AS uid,
           NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') AS name
      FROM public.adviser_sections a
      JOIN public.profiles p ON p.auth_user_id = a.adviser_id
     WHERE a.status = 'active'
       AND p.account_type = 'adviser'
       AND COALESCE(p.is_active, true) = true
  LOOP
    BEGIN
      v_report := public.build_adviser_daily_report(v_adviser.uid, v_date);

      INSERT INTO public.adviser_daily_reports AS r (
        adviser_id, report_date, generated_at, generated_by,
        sections_count, students_count, present_count, absent_count,
        incomplete_count, attention_count, pending_journals_count, total_minutes,
        payload
      ) VALUES (
        v_adviser.uid, v_date, now(), 'scheduled',
        (v_report -> 'summary' ->> 'sections')::integer,
        (v_report -> 'summary' ->> 'students')::integer,
        (v_report -> 'summary' ->> 'present')::integer,
        (v_report -> 'summary' ->> 'absent')::integer,
        (v_report -> 'summary' ->> 'incomplete')::integer,
        (v_report -> 'summary' ->> 'attention')::integer,
        (v_report -> 'summary' ->> 'journals_pending')::integer,
        (v_report -> 'summary' ->> 'total_minutes')::integer,
        v_report
      )
      ON CONFLICT (adviser_id, report_date) DO UPDATE
        SET generated_at           = EXCLUDED.generated_at,
            generated_by           = EXCLUDED.generated_by,
            sections_count         = EXCLUDED.sections_count,
            students_count         = EXCLUDED.students_count,
            present_count          = EXCLUDED.present_count,
            absent_count           = EXCLUDED.absent_count,
            incomplete_count       = EXCLUDED.incomplete_count,
            attention_count        = EXCLUDED.attention_count,
            pending_journals_count = EXCLUDED.pending_journals_count,
            total_minutes          = EXCLUDED.total_minutes,
            payload                = EXCLUDED.payload,
            updated_at             = now()
      RETURNING r.* INTO v_row;

      v_built := v_built + 1;

      -- One email per adviser per day. An adviser who already has the
      -- notification (they generated and sent it themselves) is not mailed twice.
      IF v_row.notification_id IS NULL THEN
        INSERT INTO public.user_notifications (
          user_id, title, message, type, is_read,
          notification_type, related_type, related_id, action_path, action_label
        ) VALUES (
          v_adviser.uid,
          'Daily SIL/OJT Report — ' || to_char(v_date, 'FMMonth FMDD, YYYY'),
          public.adviser_daily_report_email_body(v_adviser.name, v_row),
          CASE WHEN v_row.attention_count > 0 THEN 'warning' ELSE 'info' END,
          false,
          'system', 'adviser_daily_report', v_row.id,
          '/adviser/reports', 'View full report'
        )
        RETURNING id INTO v_notif;

        UPDATE public.adviser_daily_reports
           SET notification_id = v_notif, emailed_at = now(), updated_at = now()
         WHERE id = v_row.id;

        v_notified := v_notified + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'Daily report failed for adviser %: %', v_adviser.uid, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'report_date', v_date,
    'built',       v_built,
    'notified',    v_notified,
    'failed',      v_failed
  );
END;
$$;

COMMENT ON FUNCTION public.generate_all_adviser_daily_reports(date) IS
  'Builds and delivers one consolidated daily report per adviser. Run by pg_cron at 17:00 Asia/Manila; also callable manually by an admin.';

REVOKE ALL ON FUNCTION public.generate_all_adviser_daily_reports(date) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Indexes the report relies on
--    Without these, a 200-student roster means a sequential scan of every
--    timesheet and journal on every generation.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS timesheets_user_clock_in_idx
  ON public.timesheets (user_id, clock_in);
CREATE INDEX IF NOT EXISTS daily_journals_user_status_idx
  ON public.daily_journals (user_id, approval_status);
CREATE INDEX IF NOT EXISTS company_attendance_date_student_idx
  ON public.company_attendance (attendance_date, student_id);
-- The roster join resolves a student's section through canonical_section_name,
-- so the plain `section` column cannot serve it. This expression index can.
CREATE INDEX IF NOT EXISTS profiles_student_canonical_section_idx
  ON public.profiles (public.canonical_section_name(section, course, year_level))
  WHERE account_type = 'student';


-- ----------------------------------------------------------------------------
-- 8. Automatic daily generation
--
--    17:00 Asia/Manila = 09:00 UTC. Wrapped like the daily-limit schedule so a
--    project without pg_cron still gets a working migration — advisers can
--    always press "Generate Today's Report" themselves; the timer only means
--    the report is already waiting when they log in.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  BEGIN
    PERFORM cron.unschedule('adviser-daily-report');
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- not scheduled yet, which is the normal first run
  END;

  PERFORM cron.schedule(
    'adviser-daily-report',
    '0 9 * * *',
    'SELECT public.generate_all_adviser_daily_reports();'
  );
  RAISE NOTICE 'Scheduled adviser-daily-report daily at 09:00 UTC (17:00 Asia/Manila).';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not schedule the adviser daily report (%). Enable pg_cron in the Supabase dashboard (Database -> Extensions) and re-run this block, or call generate_all_adviser_daily_reports() from an external scheduler. Advisers can still generate the report from the portal.', SQLERRM;
END;
$$;


-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
--   -- What one adviser's report looks like, without storing it:
--   SELECT jsonb_pretty(public.build_adviser_daily_report(
--            (SELECT auth_user_id FROM public.profiles WHERE email = 'adviser@example.com'),
--            current_date));
--
--   -- Stored reports, newest first:
--   SELECT report_date, generated_by, sections_count, students_count,
--          present_count, absent_count, attention_count, emailed_at
--     FROM public.adviser_daily_reports
--    ORDER BY report_date DESC;
--
--   -- Is the timer live?
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'adviser-daily-report';

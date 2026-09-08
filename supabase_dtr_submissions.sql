-- ==============================================================================
-- Final DTR submission & review
-- ==============================================================================
-- The adviser approves ONE complete Daily Time Record, not each clock-in.
--
-- What this replaces
--   The Adviser -> Approvals page treated every completed `timesheets` row as an
--   approval request, so a student with 25 attendance days produced 25 approval
--   tasks. That is not the SIL workflow: clocking in and out is automatic
--   record-keeping, and the adviser only becomes involved once the student has
--   finished their SIL and formally submits the whole record.
--
--   The per-timesheet approval path is removed from the adviser portal (see
--   src/services/adviserService.ts). `timesheets.approval_status` is left in
--   place — the coordinator portal still uses it, and the attendance/limit
--   queries still exclude 'rejected' rows — but nothing in the adviser flow
--   writes it any more.
--
-- The shape
--     timesheets             -> individual daily clock-in/out records (unchanged)
--     dtr_submissions        -> the student's complete submitted DTR
--     dtr_submission_events  -> the audit trail of that submission
--
-- What it reuses rather than rebuilds
--   * timesheet_worked_minutes()       - the rendered-time rule
--   * attendance_time_zone()           - the attendance day boundary
--   * attendance_daily_limit_minutes() - system_settings -> ojt_hours -> max_daily
--   * ojt_default_required_hours()     - the fallback required hours
--   * canonical_section_name()         - resolving a student to their section
--   * user_notifications               - one row IS the email, via the existing
--                                        notification_email webhook
--
-- Contents
--   1. dtr_submissions / dtr_submission_events + RLS
--   2. compute_student_dtr()  - the day-by-day record, summary and validation
--   3. Student entry points   - get_my_dtr_status(), submit_my_dtr()
--   4. Adviser entry points   - list, read one, review
--
-- Safe to re-run. It creates nothing that already exists and modifies no
-- timesheet, attendance or student row.
-- ==============================================================================


-- ----------------------------------------------------------------------------
-- 1. The store
--    The submission carries a `snapshot` of exactly what the student sent, so
--    the adviser always reviews the record as submitted even if a later edit
--    lands while it sits in the queue.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dtr_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Resolved from the student's section at submit time; never chosen by the client.
  adviser_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  section_id      UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  section_name    TEXT,
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name    TEXT,
  period_start    DATE,
  period_end      DATE,
  required_hours  INTEGER NOT NULL DEFAULT 0,
  total_minutes   INTEGER NOT NULL DEFAULT 0,
  working_days    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'revision_requested')),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  adviser_remarks TEXT,
  -- How many times the student has submitted this DTR (1 = first submission).
  attempt         INTEGER NOT NULL DEFAULT 1,
  snapshot        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A student may have many approved DTRs in their history but only ONE open
-- submission at a time. This is also what makes a double-click idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS dtr_submissions_one_active
  ON public.dtr_submissions (student_id) WHERE status <> 'approved';
CREATE INDEX IF NOT EXISTS dtr_submissions_adviser_status_idx
  ON public.dtr_submissions (adviser_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS dtr_submissions_student_idx
  ON public.dtr_submissions (student_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.dtr_submission_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.dtr_submissions(id) ON DELETE CASCADE,
  event         TEXT NOT NULL
                  CHECK (event IN ('submitted', 'resubmitted', 'revision_requested', 'approved')),
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name    TEXT,
  remarks       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dtr_submission_events_submission_idx
  ON public.dtr_submission_events (submission_id, created_at);

ALTER TABLE public.dtr_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dtr_submission_events ENABLE ROW LEVEL SECURITY;

-- Read-only policies. Every write goes through the SECURITY DEFINER routines in
-- sections 3 and 4, so a student cannot approve their own DTR by writing the
-- table and an adviser cannot reach a student outside their sections.
DROP POLICY IF EXISTS "Students read their own DTR submissions" ON public.dtr_submissions;
CREATE POLICY "Students read their own DTR submissions"
  ON public.dtr_submissions FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Advisers read DTR submissions addressed to them" ON public.dtr_submissions;
CREATE POLICY "Advisers read DTR submissions addressed to them"
  ON public.dtr_submissions FOR SELECT TO authenticated
  USING (adviser_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff read DTR submissions" ON public.dtr_submissions;
CREATE POLICY "Staff read DTR submissions"
  ON public.dtr_submissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = (SELECT auth.uid())
      AND p.account_type IN ('admin', 'coordinator')
  ));

DROP POLICY IF EXISTS "Read events of a visible submission" ON public.dtr_submission_events;
CREATE POLICY "Read events of a visible submission"
  ON public.dtr_submission_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dtr_submissions s WHERE s.id = submission_id
  ));

-- The DTR gets notification categories of its own, so the decisions that matter
-- are not mixed in with attendance chatter.
ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_notification_type_check;
ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_notification_type_check
  CHECK (notification_type IN (
    'announcement', 'journal_approved', 'journal_rejected', 'journal_revision',
    'attendance', 'assignment', 'company', 'system', 'reminder', 'general',
    'dtr_submitted', 'dtr_approved', 'dtr_revision'
  ));


-- ----------------------------------------------------------------------------
-- 2. Computing a student's DTR
--    Reads `timesheets` (the automatic attendance log) and `company_attendance`
--    (the supervisor's recorded status) and returns the day-by-day record, the
--    summary, and the validation issues that gate submission.
--
--    Blocking issues stop a submission; advisory ones are shown to both parties
--    but do not. A day the supervisor recorded but the student never clocked
--    into still belongs in the DTR — that gap is exactly what review must catch.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_student_dtr(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_tz       text        := public.attendance_time_zone();
  v_limit    integer     := public.attendance_daily_limit_minutes();
  v_now      timestamptz := now();
  v_student  record;
  v_required integer;
  v_result   jsonb;
BEGIN
  SELECT p.auth_user_id, p.id AS profile_id, p.first_name, p.last_name, p.email,
         p.section, p.course, p.year_level, p.company_id, p.required_ojt_hours
    INTO v_student
    FROM public.profiles p
   WHERE p.auth_user_id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Student profile not found.';
  END IF;

  v_required := GREATEST(1, COALESCE(NULLIF(v_student.required_ojt_hours, 0),
                                     public.ojt_default_required_hours()));

  WITH ts_days AS (
    SELECT (ts.clock_in AT TIME ZONE v_tz)::date            AS day,
           min(ts.clock_in)                                  AS time_in,
           max(ts.clock_out)                                 AS time_out,
           count(*)::integer                                 AS sessions,
           count(*) FILTER (WHERE ts.clock_out IS NULL)::integer AS open_sessions,
           COALESCE(sum(public.timesheet_worked_minutes(
             ts.clock_in, ts.clock_out, ts.break_start, ts.break_end, v_now)), 0)::integer AS minutes,
           COALESCE(sum(
             CASE WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                       AND ts.break_end > ts.break_start
                  THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 60
                  ELSE 0 END), 0)::integer                   AS break_minutes,
           bool_or(ts.clock_out IS NOT NULL AND ts.clock_out < ts.clock_in) AS reversed
      FROM public.timesheets ts
     WHERE ts.user_id = p_student_id
       AND ts.clock_in IS NOT NULL
       AND COALESCE(ts.approval_status, 'pending') <> 'rejected'
     GROUP BY 1
  ),
  att_days AS (
    SELECT ca.attendance_date AS day, ca.status, ca.reason, ca.remarks
      FROM public.company_attendance ca
     WHERE ca.student_id = p_student_id
  ),
  all_days AS (
    SELECT day FROM ts_days
    UNION
    SELECT day FROM att_days
  ),
  rows AS (
    SELECT d.day,
           t.time_in,
           t.time_out,
           COALESCE(t.sessions, 0)          AS sessions,
           COALESCE(t.open_sessions, 0)     AS open_sessions,
           COALESCE(t.minutes, 0)           AS minutes,
           COALESCE(t.break_minutes, 0)     AS break_minutes,
           COALESCE(t.reversed, false)      AS reversed,
           a.status                         AS recorded_status,
           a.reason, a.remarks,
           to_char(d.day, 'Dy')             AS weekday,
           -- Blocking: the DTR is not a complete record until these are fixed.
           (COALESCE(t.open_sessions, 0) > 0)                                   AS f_missing_out,
           (a.status IN ('present', 'late') AND COALESCE(t.sessions, 0) = 0)    AS f_missing_in,
           COALESCE(t.reversed, false)                                          AS f_invalid,
           (COALESCE(t.minutes, 0) > v_limit)                                   AS f_over_limit,
           -- Advisory: worth the adviser's eye, but not a reason to block.
           (COALESCE(t.sessions, 0) > 1)                                        AS f_multi,
           (COALESCE(t.minutes, 0) > 0 AND COALESCE(t.minutes, 0) < 60
             AND COALESCE(t.open_sessions, 0) = 0)                              AS f_short
      FROM all_days d
      LEFT JOIN ts_days  t ON t.day = d.day
      LEFT JOIN att_days a ON a.day = d.day
  ),
  scored AS (
    SELECT r.*,
           (r.f_missing_out OR r.f_missing_in OR r.f_invalid OR r.f_over_limit) AS blocking,
           (r.f_multi OR r.f_short)                                             AS advisory
      FROM rows r
  ),
  totals AS (
    SELECT COALESCE(sum(minutes), 0)::integer                       AS total_minutes,
           count(*) FILTER (WHERE minutes > 0)::integer             AS working_days,
           count(*)::integer                                        AS recorded_days,
           min(day)                                                 AS period_start,
           max(day)                                                 AS period_end,
           count(*) FILTER (WHERE recorded_status = 'late')::integer      AS late_days,
           count(*) FILTER (WHERE recorded_status = 'absent')::integer    AS absent_days,
           count(*) FILTER (WHERE f_missing_out OR f_missing_in)::integer AS incomplete_days,
           COALESCE(sum(GREATEST(0, minutes - v_limit)), 0)::integer      AS overtime_minutes,
           count(*) FILTER (WHERE blocking)::integer                      AS blocking_days
      FROM scored
  ),
  day_rows AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'date',            s.day,
             'weekday',         s.weekday,
             'time_in',         s.time_in,
             'time_out',        s.time_out,
             'sessions',        s.sessions,
             'open_sessions',   s.open_sessions,
             'minutes',         s.minutes,
             'break_minutes',   s.break_minutes,
             'recorded_status', s.recorded_status,
             'remarks',         s.remarks,
             'blocking',        s.blocking,
             'issues',          (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'code', v.code, 'label', v.label, 'severity', v.severity)), '[]'::jsonb)
                 FROM (VALUES
                   (s.f_missing_out, 'missing_clock_out',  'Missing Clock-out',           'blocking'),
                   (s.f_missing_in,  'missing_clock_in',   'Missing Clock-in',            'blocking'),
                   (s.f_invalid,     'invalid_range',      'Clock-out before Clock-in',   'blocking'),
                   (s.f_over_limit,  'over_limit',         'Exceeds the daily hour limit','blocking'),
                   (s.f_multi,       'multiple_sessions',  'Multiple sessions that day',  'advisory'),
                   (s.f_short,       'very_short',         'Unusually short duration',    'advisory')
                 ) AS v(hit, code, label, severity)
                WHERE v.hit
             )
           ) ORDER BY s.day), '[]'::jsonb) AS list
      FROM scored s
  ),
  issue_rows AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'date', s.day, 'code', v.code, 'label', v.label, 'severity', v.severity
           ) ORDER BY s.day, v.ord), '[]'::jsonb) AS list
      FROM scored s
      CROSS JOIN LATERAL (VALUES
        (1, s.f_missing_out, 'missing_clock_out', 'Missing Clock-out',            'blocking'),
        (2, s.f_missing_in,  'missing_clock_in',  'Missing Clock-in',             'blocking'),
        (3, s.f_invalid,     'invalid_range',     'Clock-out before Clock-in',    'blocking'),
        (4, s.f_over_limit,  'over_limit',        'Exceeds the daily hour limit', 'blocking'),
        (5, s.f_multi,       'multiple_sessions', 'Multiple sessions that day',   'advisory'),
        (6, s.f_short,       'very_short',        'Unusually short duration',     'advisory')
      ) AS v(ord, hit, code, label, severity)
     WHERE v.hit
  )
  SELECT jsonb_build_object(
    'student', jsonb_build_object(
      'id',         v_student.auth_user_id,
      'profile_id', v_student.profile_id,
      'name',       NULLIF(btrim(concat_ws(' ', v_student.first_name, v_student.last_name)), ''),
      'email',      v_student.email,
      'section',    public.canonical_section_name(v_student.section, v_student.course, v_student.year_level),
      'company_id', v_student.company_id,
      'company',    (SELECT c.name FROM public.companies c WHERE c.id = v_student.company_id)
    ),
    'settings', jsonb_build_object('daily_limit_minutes', v_limit, 'time_zone', v_tz),
    'summary', jsonb_build_object(
      'required_hours',    v_required,
      'required_minutes',  v_required * 60,
      'total_minutes',     t.total_minutes,
      'remaining_minutes', GREATEST(0, v_required * 60 - t.total_minutes),
      'completion_pct',    LEAST(100, round((t.total_minutes::numeric / (v_required * 60)) * 100, 1)),
      'working_days',      t.working_days,
      'recorded_days',     t.recorded_days,
      'late_days',         t.late_days,
      'absent_days',       t.absent_days,
      'incomplete_days',   t.incomplete_days,
      'overtime_minutes',  t.overtime_minutes,
      'period_start',      t.period_start,
      'period_end',        t.period_end
    ),
    'days',   (SELECT list FROM day_rows),
    'issues', (SELECT list FROM issue_rows),
    'hours_met',    (t.total_minutes >= v_required * 60),
    'has_blocking', (t.blocking_days > 0),
    -- The single gate the student's Submit button reads.
    'can_submit',   (t.total_minutes >= v_required * 60 AND t.blocking_days = 0 AND t.recorded_days > 0),
    'computed_at',  v_now
  )
    INTO v_result
    FROM totals t;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.compute_student_dtr(uuid) IS
  'The day-by-day DTR, summary and validation issues for one student, derived from timesheets and company_attendance. Internal: called by the student and adviser entry points.';

REVOKE ALL ON FUNCTION public.compute_student_dtr(uuid) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Student entry points
--    Neither accepts an adviser id: the recipient is derived from the student's
--    own section assignment.
-- ----------------------------------------------------------------------------

-- Which adviser owns a student, via their section assignment.
CREATE OR REPLACE FUNCTION public.resolve_student_adviser(p_student_id uuid)
RETURNS TABLE (adviser_id uuid, adviser_name text, adviser_type text, section_id uuid, section_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT a.adviser_id,
         NULLIF(btrim(concat_ws(' ', ap.first_name, ap.last_name)), ''),
         ap.adviser_type,
         s.id,
         s.name
    FROM public.profiles p
    JOIN public.sections s
      ON upper(btrim(s.name)) = public.canonical_section_name(p.section, p.course, p.year_level)
    JOIN public.adviser_sections a
      ON a.section_id = s.id AND a.status = 'active'
    LEFT JOIN public.profiles ap ON ap.auth_user_id = a.adviser_id
   WHERE p.auth_user_id = p_student_id
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_student_adviser(uuid) FROM PUBLIC, anon, authenticated;

-- The submission's event trail, oldest first.
CREATE OR REPLACE FUNCTION public.dtr_submission_history(p_submission_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'event',      e.event,
           'actor',      e.actor_name,
           'remarks',    e.remarks,
           'created_at', e.created_at
         ) ORDER BY e.created_at), '[]'::jsonb)
    FROM public.dtr_submission_events e
   WHERE e.submission_id = p_submission_id;
$$;

-- Everything the student's DTR page needs, in one read.
CREATE OR REPLACE FUNCTION public.get_my_dtr_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
  v_dtr   jsonb;
  v_sub   public.dtr_submissions;
  v_adv   record;
  v_state text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT account_type INTO v_role FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Only students have a DTR of their own.';
  END IF;

  v_dtr := public.compute_student_dtr(v_uid);

  SELECT * INTO v_sub FROM public.dtr_submissions
   WHERE student_id = v_uid ORDER BY submitted_at DESC LIMIT 1;

  SELECT * INTO v_adv FROM public.resolve_student_adviser(v_uid);

  -- The five states the student's banner and button read from.
  v_state := CASE
    WHEN v_sub.id IS NOT NULL AND v_sub.status = 'pending'            THEN 'pending_review'
    WHEN v_sub.id IS NOT NULL AND v_sub.status = 'approved'           THEN 'approved'
    WHEN v_sub.id IS NOT NULL AND v_sub.status = 'revision_requested' THEN 'revision_required'
    WHEN (v_dtr ->> 'can_submit')::boolean                            THEN 'ready'
    ELSE 'in_progress'
  END;

  RETURN v_dtr || jsonb_build_object(
    'state', v_state,
    'adviser', CASE WHEN v_adv.adviser_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_adv.adviser_id, 'name', v_adv.adviser_name,
      'adviser_type', v_adv.adviser_type, 'section', v_adv.section_name
    ) END,
    'submission', CASE WHEN v_sub.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',              v_sub.id,
      'status',          v_sub.status,
      'submitted_at',    v_sub.submitted_at,
      'reviewed_at',     v_sub.reviewed_at,
      'adviser_remarks', v_sub.adviser_remarks,
      'attempt',         v_sub.attempt,
      'total_minutes',   v_sub.total_minutes,
      'required_hours',  v_sub.required_hours,
      'period_start',    v_sub.period_start,
      'period_end',      v_sub.period_end,
      'reviewer',        (SELECT NULLIF(btrim(concat_ws(' ', r.first_name, r.last_name)), '')
                            FROM public.profiles r WHERE r.auth_user_id = v_sub.reviewed_by),
      'history',         public.dtr_submission_history(v_sub.id)
    ) END
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_dtr_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dtr_status() TO authenticated;


-- Submit the complete DTR. Idempotent while one is already pending.
CREATE OR REPLACE FUNCTION public.submit_my_dtr()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_name    text;
  v_dtr     jsonb;
  v_sub     public.dtr_submissions;
  v_adv     record;
  v_id      uuid;
  v_event   text := 'submitted';
  v_attempt integer := 1;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT account_type, NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
    INTO v_role, v_name
    FROM public.profiles WHERE auth_user_id = v_uid;

  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Only students can submit a DTR.';
  END IF;

  SELECT * INTO v_sub FROM public.dtr_submissions
   WHERE student_id = v_uid AND status <> 'approved'
   ORDER BY submitted_at DESC LIMIT 1;

  -- Already under review: the DTR is locked, so this is a no-op rather than a
  -- second approval task for the adviser.
  IF v_sub.id IS NOT NULL AND v_sub.status = 'pending' THEN
    RETURN jsonb_build_object('submitted', false, 'reason', 'already_pending', 'submission_id', v_sub.id);
  END IF;

  v_dtr := public.compute_student_dtr(v_uid);

  IF NOT (v_dtr ->> 'can_submit')::boolean THEN
    RAISE EXCEPTION 'This DTR cannot be submitted yet. Resolve the outstanding issues and complete the required hours first.';
  END IF;

  SELECT * INTO v_adv FROM public.resolve_student_adviser(v_uid);
  IF v_adv.adviser_id IS NULL THEN
    RAISE EXCEPTION 'No adviser is assigned to your section yet. Please contact the SIL/OJT Coordinator.';
  END IF;

  IF v_sub.id IS NOT NULL THEN
    v_event   := 'resubmitted';
    v_attempt := v_sub.attempt + 1;
  END IF;

  INSERT INTO public.dtr_submissions AS s (
    student_id, adviser_id, section_id, section_name, company_id, company_name,
    period_start, period_end, required_hours, total_minutes, working_days,
    status, submitted_at, attempt, snapshot, reviewed_at, reviewed_by, adviser_remarks
  ) VALUES (
    v_uid, v_adv.adviser_id, v_adv.section_id, v_adv.section_name,
    (v_dtr -> 'student' ->> 'company_id')::uuid,
    v_dtr -> 'student' ->> 'company',
    (v_dtr -> 'summary' ->> 'period_start')::date,
    (v_dtr -> 'summary' ->> 'period_end')::date,
    (v_dtr -> 'summary' ->> 'required_hours')::integer,
    (v_dtr -> 'summary' ->> 'total_minutes')::integer,
    (v_dtr -> 'summary' ->> 'working_days')::integer,
    'pending', now(), v_attempt, v_dtr, NULL, NULL, NULL
  )
  ON CONFLICT (student_id) WHERE status <> 'approved' DO UPDATE
    SET adviser_id = EXCLUDED.adviser_id, section_id = EXCLUDED.section_id,
        section_name = EXCLUDED.section_name, company_id = EXCLUDED.company_id,
        company_name = EXCLUDED.company_name, period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end, required_hours = EXCLUDED.required_hours,
        total_minutes = EXCLUDED.total_minutes, working_days = EXCLUDED.working_days,
        status = 'pending', submitted_at = now(), attempt = EXCLUDED.attempt,
        snapshot = EXCLUDED.snapshot, reviewed_at = NULL, reviewed_by = NULL,
        adviser_remarks = NULL, updated_at = now()
  RETURNING s.id INTO v_id;

  INSERT INTO public.dtr_submission_events (submission_id, event, actor_id, actor_name)
  VALUES (v_id, v_event, v_uid, v_name);

  -- ONE approval task for the adviser, regardless of how many days it contains.
  INSERT INTO public.user_notifications (
    user_id, title, message, type, is_read,
    notification_type, related_type, related_id, action_path, action_label
  ) VALUES (
    v_adv.adviser_id,
    'New DTR Submission',
    COALESCE(v_name, 'A student') || ' submitted a complete DTR for adviser review.' || E'\n\n'
      || 'Section: ' || COALESCE(v_adv.section_name, '—') || E'\n'
      || 'Total rendered: ' || ((v_dtr -> 'summary' ->> 'total_minutes')::integer / 60) || 'h '
      || ((v_dtr -> 'summary' ->> 'total_minutes')::integer % 60) || 'm' || E'\n'
      || 'Required: ' || (v_dtr -> 'summary' ->> 'required_hours') || 'h',
    'info', false,
    'dtr_submitted', 'dtr_submission', v_id,
    '/adviser/approvals?tab=dtr', 'Review DTR'
  );

  RETURN jsonb_build_object('submitted', true, 'submission_id', v_id, 'attempt', v_attempt);
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_my_dtr() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_my_dtr() TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Adviser entry points
-- ----------------------------------------------------------------------------

-- The approvals list. One row per SUBMISSION, never per attendance record.
CREATE OR REPLACE FUNCTION public.get_adviser_dtr_submissions(p_status text DEFAULT NULL)
RETURNS TABLE (
  id              uuid,
  student_id      uuid,
  student_name    text,
  student_email   text,
  section_name    text,
  company_name    text,
  period_start    date,
  period_end      date,
  required_hours  integer,
  total_minutes   integer,
  working_days    integer,
  status          text,
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  adviser_remarks text,
  attempt         integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_filter text := nullif(lower(btrim(coalesce(p_status, ''))), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT account_type INTO v_role FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_role IS DISTINCT FROM 'adviser' THEN
    RAISE EXCEPTION 'Only advisers can review DTR submissions.';
  END IF;

  RETURN QUERY
    SELECT s.id, s.student_id,
           NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           p.email, s.section_name, s.company_name,
           s.period_start, s.period_end, s.required_hours, s.total_minutes,
           s.working_days, s.status, s.submitted_at, s.reviewed_at,
           s.adviser_remarks, s.attempt
      FROM public.dtr_submissions s
      LEFT JOIN public.profiles p ON p.auth_user_id = s.student_id
     WHERE s.adviser_id = v_uid
       AND (v_filter IS NULL OR v_filter = 'all' OR s.status = v_filter)
     ORDER BY
       -- Pending first: that is the queue the adviser actually works.
       CASE s.status WHEN 'pending' THEN 0 WHEN 'revision_requested' THEN 1 ELSE 2 END,
       s.submitted_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_adviser_dtr_submissions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_adviser_dtr_submissions(text) TO authenticated;


-- One complete submitted DTR, as the student sent it.
CREATE OR REPLACE FUNCTION public.get_dtr_submission(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_sub  public.dtr_submissions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT account_type INTO v_role FROM public.profiles WHERE auth_user_id = v_uid;

  SELECT * INTO v_sub FROM public.dtr_submissions WHERE id = p_id;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'DTR submission not found.'; END IF;

  -- The student may read their own; the adviser only the ones addressed to them.
  IF NOT (v_sub.student_id = v_uid
          OR v_sub.adviser_id = v_uid
          OR v_role IN ('admin', 'coordinator')) THEN
    RAISE EXCEPTION 'Unauthorized: that DTR submission is not yours to review.';
  END IF;

  RETURN jsonb_build_object(
    'id',              v_sub.id,
    'student_id',      v_sub.student_id,
    'student_name',    (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
                          FROM public.profiles p WHERE p.auth_user_id = v_sub.student_id),
    'student_email',   (SELECT p.email FROM public.profiles p WHERE p.auth_user_id = v_sub.student_id),
    'section_name',    v_sub.section_name,
    'company_name',    v_sub.company_name,
    'period_start',    v_sub.period_start,
    'period_end',      v_sub.period_end,
    'required_hours',  v_sub.required_hours,
    'total_minutes',   v_sub.total_minutes,
    'working_days',    v_sub.working_days,
    'status',          v_sub.status,
    'submitted_at',    v_sub.submitted_at,
    'reviewed_at',     v_sub.reviewed_at,
    'adviser_remarks', v_sub.adviser_remarks,
    'attempt',         v_sub.attempt,
    'reviewer',        (SELECT NULLIF(btrim(concat_ws(' ', r.first_name, r.last_name)), '')
                          FROM public.profiles r WHERE r.auth_user_id = v_sub.reviewed_by),
    -- The snapshot, not a fresh computation: the adviser reviews exactly what
    -- was submitted, even if the student's records move afterwards.
    'snapshot',        v_sub.snapshot,
    'history',         public.dtr_submission_history(v_sub.id)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_dtr_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dtr_submission(uuid) TO authenticated;


-- Approve, or send it back for revision. The only way a submission changes state.
CREATE OR REPLACE FUNCTION public.review_dtr_submission(
  p_id      uuid,
  p_action  text,
  p_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_name   text;
  v_sub    public.dtr_submissions;
  v_status text;
  v_remark text := nullif(btrim(coalesce(p_remarks, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT account_type, NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
    INTO v_role, v_name
    FROM public.profiles WHERE auth_user_id = v_uid;

  IF v_role IS DISTINCT FROM 'adviser' THEN
    RAISE EXCEPTION 'Only advisers can review a DTR submission.';
  END IF;

  SELECT * INTO v_sub FROM public.dtr_submissions WHERE id = p_id;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'DTR submission not found.'; END IF;

  IF v_sub.adviser_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Unauthorized: that DTR submission is not assigned to you.';
  END IF;

  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'This DTR has already been reviewed.';
  END IF;

  IF p_action = 'approve' THEN
    v_status := 'approved';
  ELSIF p_action = 'request_revision' THEN
    v_status := 'revision_requested';
    -- A revision the student cannot act on is worse than no revision at all.
    IF v_remark IS NULL THEN
      RAISE EXCEPTION 'Please describe what the student needs to correct.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown review action.';
  END IF;

  UPDATE public.dtr_submissions
     SET status = v_status, reviewed_at = now(), reviewed_by = v_uid,
         adviser_remarks = v_remark, updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.dtr_submission_events (submission_id, event, actor_id, actor_name, remarks)
  VALUES (p_id, CASE WHEN v_status = 'approved' THEN 'approved' ELSE 'revision_requested' END,
          v_uid, v_name, v_remark);

  INSERT INTO public.user_notifications (
    user_id, title, message, type, is_read,
    notification_type, related_type, related_id, action_path, action_label
  ) VALUES (
    v_sub.student_id,
    CASE WHEN v_status = 'approved' THEN 'DTR Approved' ELSE 'DTR Revision Required' END,
    CASE WHEN v_status = 'approved'
         THEN 'Your complete DTR has been reviewed and approved by your adviser.'
              || E'\n\n' || 'Total hours: ' || (v_sub.total_minutes / 60) || 'h '
              || (v_sub.total_minutes % 60) || 'm'
         ELSE 'Your adviser reviewed your DTR and requested revisions.' || E'\n\n'
              || 'Remarks: ' || v_remark || E'\n\n'
              || 'Please review and resubmit your DTR.'
    END,
    CASE WHEN v_status = 'approved' THEN 'success' ELSE 'warning' END,
    false,
    CASE WHEN v_status = 'approved' THEN 'dtr_approved' ELSE 'dtr_revision' END,
    'dtr_submission', p_id,
    '/student/dtr', CASE WHEN v_status = 'approved' THEN 'View DTR' ELSE 'Review my DTR' END
  );

  RETURN jsonb_build_object('status', v_status, 'reviewed_at', now());
END;
$fn$;

REVOKE ALL ON FUNCTION public.review_dtr_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_dtr_submission(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
--   -- What a student's DTR looks like, without submitting it:
--   SELECT jsonb_pretty(public.compute_student_dtr(
--            (SELECT auth_user_id FROM public.profiles WHERE email = 'student@example.com')) - 'days');
--
--   -- The adviser queue, one row per submission:
--   SELECT student_name, section_name, status, total_minutes, submitted_at
--     FROM public.dtr_submissions s
--     LEFT JOIN public.profiles p ON p.auth_user_id = s.student_id
--    ORDER BY s.submitted_at DESC;
--
--   -- The audit trail of one submission:
--   SELECT event, actor_name, remarks, created_at
--     FROM public.dtr_submission_events WHERE submission_id = '...' ORDER BY created_at;

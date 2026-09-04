-- ═══════════════════════════════════════════════════════════════════════════
-- Admin attendance monitoring — read-only RPCs
--
-- These add NO new attendance storage. Every figure is read from the existing
-- sources that the student, company and adviser portals already write to:
--   * public.company_attendance  — the recorded status for a student + date
--   * public.timesheets          — the clock in/out entries
-- There is no second attendance system here.
--
-- Why new functions were needed:
--   * get_all_attendance() is record-based: its FROM is company_attendance, so a
--     student with no record for the date simply does not appear. An admin
--     monitoring page has to show who was NOT recorded, which is the gap it
--     exists to surface.
--   * get_adviser_attendance() is roster-based and already admits admins, but
--     its roster JOINs public.sections. On this database only 10 of 21 students
--     resolve to a sections row (3rd/4th-year sections were never seeded), so an
--     admin would silently lose 11 students.
--   * Neither returns a per-student history, which the summary view needs.
--
-- Roster rule (documented because it is a judgement call): a student is in
-- scope for a date when they are deployed to a company, OR they already have an
-- attendance record for that date, OR they clocked at least once that date.
-- Students who have never been deployed have no attendance obligation, so
-- listing them as permanently "not recorded" would be noise, not signal.
--
-- Authorization: admin only, enforced inside SECURITY DEFINER bodies, and
-- EXECUTE is revoked from PUBLIC so an anonymous caller cannot reach them.
-- Knowing the URL — or the function name — is not enough.
--
-- Safe to run repeatedly: CREATE OR REPLACE only, no DDL on any table.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. One date, every student in scope ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_attendance(p_attendance_date date)
RETURNS TABLE (
    attendance_id          uuid,
    student_auth_id        uuid,
    student_profile_id     uuid,
    first_name             text,
    last_name              text,
    email                  text,
    program                text,
    department             text,
    section_id             uuid,
    section_name           text,
    year_level             text,
    company_id             uuid,
    company_name           text,
    schedule_start         time without time zone,
    schedule_end           time without time zone,
    time_in                timestamp with time zone,
    time_out               timestamp with time zone,
    worked_hours           numeric,
    total_rendered_hours   numeric,
    required_hours         integer,
    timesheet_count        integer,
    open_timesheet_count   integer,
    status                 text,
    reason                 text,
    remarks                text,
    recorded_by            uuid,
    recorded_by_name       text,
    recorded_at            timestamp with time zone,
    updated_by             uuid,
    updated_at             timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_role text;
BEGIN
    SELECT account_type INTO v_role
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: administrator access is required.';
    END IF;

    RETURN QUERY
    WITH roster AS (
        SELECT
            p.*,
            public.canonical_section_name(p.section, p.course, p.year_level) AS canon_section
        FROM public.profiles p
        WHERE p.account_type = 'student'
          AND (
                p.company_id IS NOT NULL
                OR EXISTS (
                    SELECT 1 FROM public.company_attendance ca
                    WHERE ca.student_id = p.auth_user_id
                      AND ca.attendance_date = p_attendance_date
                )
                OR EXISTS (
                    SELECT 1 FROM public.timesheets ts
                    WHERE ts.user_id = p.auth_user_id
                      AND ts.clock_in IS NOT NULL
                      AND ts.clock_in::date = p_attendance_date
                )
              )
    )
    SELECT
        ar.id,
        r.auth_user_id,
        r.id,
        r.first_name,
        r.last_name,
        COALESCE(r.email, ''),
        r.course,
        r.department,
        sec.id,
        -- Fall back to the canonical name so a student whose section has no row
        -- in public.sections still shows the section they are actually in.
        COALESCE(sec.name, r.canon_section),
        r.year_level,
        COALESCE(ar.company_id, r.company_id),
        COALESCE(c.name, ''),
        sch.schedule_start,
        sch.schedule_end,
        day_ts.time_in,
        day_ts.time_out,
        COALESCE(day_ts.worked_hours, 0)::numeric,
        COALESCE(all_ts.total_hours, 0)::numeric,
        COALESCE(r.required_ojt_hours, 0),
        COALESCE(day_ts.entries, 0),
        COALESCE(day_ts.open_entries, 0),
        ar.status,
        ar.reason,
        ar.remarks,
        ar.recorded_by,
        NULLIF(btrim(COALESCE(rb.first_name, '') || ' ' || COALESCE(rb.last_name, '')), ''),
        ar.recorded_at,
        ar.updated_by,
        ar.updated_at
    FROM roster r
    LEFT JOIN public.company_attendance ar
           ON ar.student_id = r.auth_user_id
          AND ar.attendance_date = p_attendance_date
    LEFT JOIN public.sections sec
           ON upper(btrim(sec.name)) = r.canon_section
    LEFT JOIN public.companies c
           ON c.id = COALESCE(ar.company_id, r.company_id)
    LEFT JOIN public.profiles rb
           ON rb.auth_user_id = ar.recorded_by
    -- Clock records for the selected day: earliest in, latest out, hours worked
    -- (a completed break removed), plus the counts used to flag incomplete logs.
    LEFT JOIN LATERAL (
        SELECT
            min(ts.clock_in)  AS time_in,
            max(ts.clock_out) AS time_out,
            count(*)::int     AS entries,
            count(*) FILTER (WHERE ts.clock_out IS NULL)::int AS open_entries,
            COALESCE(sum(
                CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                    EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                    - CASE
                        WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                             AND ts.break_end > ts.break_start
                        THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                        ELSE 0
                      END
                ELSE 0 END
            ), 0) AS worked_hours
        FROM public.timesheets ts
        WHERE ts.user_id = r.auth_user_id
          AND ts.clock_in IS NOT NULL
          AND ts.clock_in::date = p_attendance_date
    ) day_ts ON TRUE
    -- Lifetime rendered hours, for OJT progress.
    LEFT JOIN LATERAL (
        SELECT COALESCE(sum(
            CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                - CASE
                    WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                         AND ts.break_end > ts.break_start
                    THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                    ELSE 0
                  END
            ELSE 0 END
        ), 0) AS total_hours
        FROM public.timesheets ts
        WHERE ts.user_id = r.auth_user_id
          AND ts.clock_in IS NOT NULL
    ) all_ts ON TRUE
    LEFT JOIN LATERAL (
        SELECT s2.start_time AS schedule_start, s2.end_time AS schedule_end
        FROM public.schedules s2
        LEFT JOIN public.schedule_students ss2 ON ss2.schedule_id = s2.id
        WHERE (ss2.student_id = r.auth_user_id
               OR (ss2.student_id IS NULL AND s2.student_id = r.auth_user_id))
          AND s2.status <> 'cancelled'
          AND (s2.start_date IS NULL OR s2.start_date <= p_attendance_date)
          AND (s2.end_date IS NULL OR s2.end_date >= p_attendance_date)
        ORDER BY s2.start_time NULLS LAST
        LIMIT 1
    ) sch ON TRUE
    ORDER BY COALESCE(sec.name, r.canon_section) NULLS LAST,
             r.last_name NULLS LAST,
             r.first_name NULLS LAST;
END;
$function$;

-- ── 2. Lifetime summary for one student ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_student_attendance_summary(p_student_id uuid)
RETURNS TABLE (
    present_count        integer,
    late_count           integer,
    absent_count         integer,
    on_leave_count       integer,
    incomplete_count     integer,
    recorded_days        integer,
    logged_days          integer,
    total_rendered_hours numeric,
    required_hours       integer,
    first_record_date    date,
    last_record_date     date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_role text;
BEGIN
    SELECT account_type INTO v_role
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: administrator access is required.';
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE ca.status = 'present')::int,
        COUNT(*) FILTER (WHERE ca.status = 'late')::int,
        COUNT(*) FILTER (WHERE ca.status = 'absent')::int,
        COUNT(*) FILTER (WHERE ca.status = 'on_leave')::int,
        COUNT(*) FILTER (WHERE ca.status = 'incomplete')::int,
        COUNT(ca.id)::int,
        (SELECT COUNT(DISTINCT ts.clock_in::date)::int
           FROM public.timesheets ts
          WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL),
        (SELECT COALESCE(sum(
                    CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                        EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                        - CASE
                            WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                                 AND ts.break_end > ts.break_start
                            THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                            ELSE 0
                          END
                    ELSE 0 END
                ), 0)::numeric
           FROM public.timesheets ts
          WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL),
        (SELECT COALESCE(p.required_ojt_hours, 0)
           FROM public.profiles p WHERE p.auth_user_id = p_student_id),
        MIN(ca.attendance_date),
        MAX(ca.attendance_date)
    FROM public.company_attendance ca
    WHERE ca.student_id = p_student_id;
END;
$function$;

-- ── 3. Paginated history for one student ───────────────────────────────────
-- A day appears when it has an attendance record OR any clock entry, so days
-- the student worked without being marked are visible rather than missing.
CREATE OR REPLACE FUNCTION public.get_admin_student_attendance_history(
    p_student_id uuid,
    p_limit      integer DEFAULT 10,
    p_offset     integer DEFAULT 0
)
RETURNS TABLE (
    record_date          date,
    attendance_id        uuid,
    status               text,
    reason               text,
    remarks              text,
    time_in              timestamp with time zone,
    time_out             timestamp with time zone,
    worked_hours         numeric,
    timesheet_count      integer,
    open_timesheet_count integer,
    company_name         text,
    total_count          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_role text;
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    SELECT account_type INTO v_role
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: administrator access is required.';
    END IF;

    RETURN QUERY
    WITH days AS (
        SELECT ca.attendance_date AS d
        FROM public.company_attendance ca
        WHERE ca.student_id = p_student_id
        UNION
        SELECT ts.clock_in::date
        FROM public.timesheets ts
        WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL
    )
    SELECT
        days.d,
        ca.id,
        ca.status,
        ca.reason,
        ca.remarks,
        day_ts.time_in,
        day_ts.time_out,
        COALESCE(day_ts.worked_hours, 0)::numeric,
        COALESCE(day_ts.entries, 0),
        COALESCE(day_ts.open_entries, 0),
        COALESCE(c.name, ''),
        COUNT(*) OVER ()
    FROM days
    LEFT JOIN public.company_attendance ca
           ON ca.student_id = p_student_id AND ca.attendance_date = days.d
    LEFT JOIN public.companies c ON c.id = ca.company_id
    LEFT JOIN LATERAL (
        SELECT
            min(ts.clock_in)  AS time_in,
            max(ts.clock_out) AS time_out,
            count(*)::int     AS entries,
            count(*) FILTER (WHERE ts.clock_out IS NULL)::int AS open_entries,
            COALESCE(sum(
                CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                    EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                    - CASE
                        WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                             AND ts.break_end > ts.break_start
                        THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                        ELSE 0
                      END
                ELSE 0 END
            ), 0) AS worked_hours
        FROM public.timesheets ts
        WHERE ts.user_id = p_student_id
          AND ts.clock_in IS NOT NULL
          AND ts.clock_in::date = days.d
    ) day_ts ON TRUE
    ORDER BY days.d DESC
    LIMIT v_limit OFFSET v_offset;
END;
$function$;

-- ── 4. Execution rights ────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, which would let the anon role
-- reach these. Revoke, then grant to signed-in users only; the body still
-- rejects anyone whose profile is not an admin.
REVOKE ALL ON FUNCTION public.get_admin_attendance(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_student_attendance_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_student_attendance_history(uuid, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_attendance(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_student_attendance_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_student_attendance_history(uuid, integer, integer) TO authenticated;

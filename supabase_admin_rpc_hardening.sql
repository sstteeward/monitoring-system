-- ============================================================================
-- Admin RPC hardening, part 2: every function behind the admin portal checks
-- for an ACTIVE administrator (or coordinator), pins its search_path, is closed
-- to anon, and actually runs.
--
-- Follows supabase_admin_privilege_hardening.sql, which made is_admin(),
-- is_coordinator() and is_admin_or_coordinator() require an active, finished
-- account. An audit of every RPC the admin screens call, run as the real admin
-- on 2026-09-15, found:
--
--   * admin_get_security_alerts never worked. Calling it with no arguments was
--     ambiguous between the () and (uuid DEFAULT NULL) overloads (42725), and
--     the uuid overload declared record_id uuid while audit_logs.record_id is
--     text (42804). The Security Alerts screen has only ever shown its fallback
--     query, which has no clock-in/out rows. Both overloads are replaced by one
--     function whose result shape matches the table.
--   * admin_assign_department, the four audit-log RPCs, the three admin
--     attendance RPCs, get_all_attendance, get_attendance_audit and
--     get_attendance_limit_alerts re-checked account_type inline, so a
--     deactivated administrator or coordinator kept using them. Ten were also
--     executable by anon and five had no search_path (Supabase advisor 0011 /
--     0028).
--   * admin_assign_department updated department_id but left the department
--     name column stale, and the browser wrote (or skipped) its audit row.
--
-- Apart from the role check, every body below is unchanged. Supersedes the
-- admin_get_security_alerts definitions in supabase_admin_privilege_hardening.sql.
-- Safe to re-run.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Security alerts: one function, a result shape that matches audit_logs
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_security_alerts();
DROP FUNCTION IF EXISTS public.admin_get_security_alerts(uuid);

-- p_department_id is kept so existing callers resolve; coordinator scoping is
-- applied by the client (adminService._filterByDepartment), as before.
CREATE FUNCTION public.admin_get_security_alerts(p_department_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid, user_id uuid, action text, table_name text, record_id text, details jsonb,
  ip_address text, device_fingerprint text, created_at timestamp with time zone,
  latitude numeric, longitude numeric, accuracy double precision,
  distance_from_geofence double precision, location_address text, map_url text,
  profile_first_name text, profile_last_name text, profile_email text,
  profile_account_type text, profile_department_id uuid, profile_company_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_or_coordinator() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.user_id,
        a.action,
        a.table_name,
        a.record_id,
        a.details,
        a.ip_address,
        a.device_fingerprint,
        a.created_at,
        a.latitude,
        a.longitude,
        a.accuracy,
        a.distance_from_geofence,
        a.location_address,
        a.map_url,
        p.first_name AS profile_first_name,
        p.last_name AS profile_last_name,
        p.email AS profile_email,
        p.account_type AS profile_account_type,
        p.department_id AS profile_department_id,
        p.company_id AS profile_company_id
    FROM public.audit_logs a
    LEFT JOIN public.profiles p ON a.user_id = p.auth_user_id
    WHERE a.action IN ('anti_cheat_flag', 'successful_clock_in', 'successful_clock_out')
    ORDER BY a.created_at DESC
    LIMIT 200;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. Department assignment: active admin, name kept in sync, server audit row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_department(target_user_id uuid, new_department_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target    public.profiles%ROWTYPE;
  v_dept_name text;
  v_name      text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF new_department_id IS NOT NULL THEN
    SELECT d.name INTO v_dept_name FROM public.departments d WHERE d.id = new_department_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- department_id and the department name must stay in sync, as they do in
  -- departmentRequestService and the onboarding views.
  UPDATE public.profiles
  SET department_id = new_department_id,
      department    = v_dept_name
  WHERE auth_user_id = target_user_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'ASSIGN', 'Departments',
    CASE WHEN new_department_id IS NULL
      THEN format('Removed department for %s', coalesce(v_name, target_user_id::text))
      ELSE format('Assigned %s department to %s', v_dept_name, coalesce(v_name, target_user_id::text))
    END,
    target_user_id, v_name,
    jsonb_build_object('department_id', v_target.department_id, 'department', v_target.department),
    jsonb_build_object('department_id', new_department_id, 'department', v_dept_name)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. Audit log RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_audit_logs_paginated(
  p_search text DEFAULT NULL::text,
  p_action text DEFAULT NULL::text,
  p_module text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_status text DEFAULT NULL::text,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, user_id uuid, user_name text, user_role text, action text, module text, description text, target_type text, target_id text, target_name text, old_values jsonb, new_values jsonb, ip_address text, user_agent text, status text, created_at timestamp with time zone, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Authorization: only active admins can query audit logs
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can access audit logs';
  END IF;

  -- Count total matching rows for pagination
  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs a
  WHERE
    (p_action IS NULL OR a.action = p_action)
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_date_from IS NULL OR a.created_at >= p_date_from)
    AND (p_date_to IS NULL OR a.created_at <= p_date_to)
    AND (
      p_search IS NULL
      OR a.user_name ILIKE '%' || p_search || '%'
      OR a.description ILIKE '%' || p_search || '%'
      OR a.target_name ILIKE '%' || p_search || '%'
      OR a.target_id ILIKE '%' || p_search || '%'
    );

  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.user_name,
    a.user_role,
    a.action,
    a.module,
    a.description,
    a.target_type,
    a.target_id,
    a.target_name,
    a.old_values,
    a.new_values,
    a.ip_address,
    a.user_agent,
    a.status,
    a.created_at,
    v_total AS total_count
  FROM public.audit_logs a
  WHERE
    (p_action IS NULL OR a.action = p_action)
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_date_from IS NULL OR a.created_at >= p_date_from)
    AND (p_date_to IS NULL OR a.created_at <= p_date_to)
    AND (
      p_search IS NULL
      OR a.user_name ILIKE '%' || p_search || '%'
      OR a.description ILIKE '%' || p_search || '%'
      OR a.target_name ILIKE '%' || p_search || '%'
      OR a.target_id ILIKE '%' || p_search || '%'
    )
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_audit_log_users()
RETURNS TABLE(user_id uuid, user_name text, user_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: only active admins
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (a.user_id)
    a.user_id,
    a.user_name,
    a.user_role
  FROM public.audit_logs a
  WHERE a.user_id IS NOT NULL AND a.user_name IS NOT NULL
  ORDER BY a.user_id, a.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_audit_logs_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_seen TIMESTAMPTZ;
  v_unread_count BIGINT;
BEGIN
  -- Authorization check: only active admins
  IF NOT public.is_admin() THEN
    RETURN 0;
  END IF;

  -- Get admin's last_seen timestamp
  SELECT last_seen_at INTO v_last_seen
  FROM public.audit_log_reads
  WHERE user_id = auth.uid();

  -- If admin has never viewed, default to 7 days ago
  IF v_last_seen IS NULL THEN
    v_last_seen := NOW() - INTERVAL '7 days';
  END IF;

  -- Count unseen logs
  SELECT COUNT(*) INTO v_unread_count
  FROM public.audit_logs
  WHERE created_at > v_last_seen;

  RETURN v_unread_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_audit_logs_as_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization check: only active admins
  IF NOT public.is_admin() THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_log_reads (user_id, last_seen_at, updated_at)
  VALUES (auth.uid(), NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    last_seen_at = NOW(),
    updated_at = NOW();
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. Attendance RPCs used by the admin (and coordinator / company) screens
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_attendance(p_attendance_date date)
RETURNS TABLE(attendance_id uuid, student_auth_id uuid, student_profile_id uuid, first_name text, last_name text, email text, program text, department text, section_id uuid, section_name text, year_level text, company_id uuid, company_name text, schedule_start time without time zone, schedule_end time without time zone, time_in timestamp with time zone, time_out timestamp with time zone, worked_hours numeric, total_rendered_hours numeric, required_hours integer, timesheet_count integer, open_timesheet_count integer, status text, reason text, remarks text, recorded_by uuid, recorded_by_name text, recorded_at timestamp with time zone, updated_by uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: administrator access is required.';
    END IF;

    RETURN QUERY
    WITH roster AS (
        SELECT p.*, public.canonical_section_name(p.section, p.course, p.year_level) AS canon_section
        FROM public.profiles p
        WHERE p.account_type = 'student'
          AND (
                p.company_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.company_attendance ca
                            WHERE ca.student_id = p.auth_user_id AND ca.attendance_date = p_attendance_date)
                OR EXISTS (SELECT 1 FROM public.timesheets ts
                            WHERE ts.user_id = p.auth_user_id AND ts.clock_in IS NOT NULL
                              AND ts.clock_in::date = p_attendance_date)
              )
    )
    SELECT
        ar.id, r.auth_user_id, r.id,
        r.first_name, r.last_name, COALESCE(r.email, ''), r.course, r.department,
        sec.id, COALESCE(sec.name, r.canon_section), r.year_level,
        COALESCE(ar.company_id, r.company_id), COALESCE(c.name, ''),
        sch.schedule_start, sch.schedule_end,
        day_ts.time_in, day_ts.time_out,
        COALESCE(day_ts.worked_hours, 0)::numeric,
        COALESCE(all_ts.total_hours, 0)::numeric,
        COALESCE(r.required_ojt_hours, 0),
        COALESCE(day_ts.entries, 0), COALESCE(day_ts.open_entries, 0),
        ar.status, ar.reason, ar.remarks, ar.recorded_by,
        NULLIF(btrim(COALESCE(rb.first_name, '') || ' ' || COALESCE(rb.last_name, '')), ''),
        ar.recorded_at, ar.updated_by, ar.updated_at
    FROM roster r
    LEFT JOIN public.company_attendance ar
           ON ar.student_id = r.auth_user_id AND ar.attendance_date = p_attendance_date
    LEFT JOIN public.sections sec ON upper(btrim(sec.name)) = r.canon_section
    LEFT JOIN public.companies c ON c.id = COALESCE(ar.company_id, r.company_id)
    LEFT JOIN public.profiles rb ON rb.auth_user_id = ar.recorded_by
    LEFT JOIN LATERAL (
        SELECT min(ts.clock_in) AS time_in, max(ts.clock_out) AS time_out,
               count(*)::int AS entries,
               count(*) FILTER (WHERE ts.clock_out IS NULL)::int AS open_entries,
               COALESCE(sum(
                   CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                       EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                       - CASE WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                                   AND ts.break_end > ts.break_start
                              THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                              ELSE 0 END
                   ELSE 0 END), 0) AS worked_hours
        FROM public.timesheets ts
        WHERE ts.user_id = r.auth_user_id AND ts.clock_in IS NOT NULL
          AND ts.clock_in::date = p_attendance_date
    ) day_ts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(sum(
                   CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                       EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                       - CASE WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                                   AND ts.break_end > ts.break_start
                              THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                              ELSE 0 END
                   ELSE 0 END), 0) AS total_hours
        FROM public.timesheets ts
        WHERE ts.user_id = r.auth_user_id AND ts.clock_in IS NOT NULL
    ) all_ts ON TRUE
    LEFT JOIN LATERAL (
        SELECT s2.start_time AS schedule_start, s2.end_time AS schedule_end
        FROM public.schedules s2
        LEFT JOIN public.schedule_students ss2 ON ss2.schedule_id = s2.id
        WHERE (ss2.student_id = r.auth_user_id OR (ss2.student_id IS NULL AND s2.student_id = r.auth_user_id))
          AND s2.status <> 'cancelled'
          AND (s2.start_date IS NULL OR s2.start_date <= p_attendance_date)
          AND (s2.end_date IS NULL OR s2.end_date >= p_attendance_date)
        ORDER BY s2.start_time NULLS LAST LIMIT 1
    ) sch ON TRUE
    ORDER BY COALESCE(sec.name, r.canon_section) NULLS LAST,
             r.last_name NULLS LAST, r.first_name NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_student_attendance_summary(p_student_id uuid)
RETURNS TABLE(present_count integer, late_count integer, absent_count integer, on_leave_count integer, incomplete_count integer, recorded_days integer, logged_days integer, total_rendered_hours numeric, required_hours integer, first_record_date date, last_record_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
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
        (SELECT COUNT(DISTINCT ts.clock_in::date)::int FROM public.timesheets ts
          WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL),
        (SELECT COALESCE(sum(
                   CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                       EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                       - CASE WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                                   AND ts.break_end > ts.break_start
                              THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                              ELSE 0 END
                   ELSE 0 END), 0)::numeric
           FROM public.timesheets ts
          WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL),
        (SELECT COALESCE(p.required_ojt_hours, 0) FROM public.profiles p WHERE p.auth_user_id = p_student_id),
        MIN(ca.attendance_date), MAX(ca.attendance_date)
    FROM public.company_attendance ca
    WHERE ca.student_id = p_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_student_attendance_history(p_student_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
RETURNS TABLE(record_date date, attendance_id uuid, status text, reason text, remarks text, time_in timestamp with time zone, time_out timestamp with time zone, worked_hours numeric, timesheet_count integer, open_timesheet_count integer, company_name text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: administrator access is required.';
    END IF;

    RETURN QUERY
    WITH days AS (
        SELECT ca.attendance_date AS d FROM public.company_attendance ca WHERE ca.student_id = p_student_id
        UNION
        SELECT ts.clock_in::date FROM public.timesheets ts
         WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL
    )
    SELECT days.d, ca.id, ca.status, ca.reason, ca.remarks,
           day_ts.time_in, day_ts.time_out,
           COALESCE(day_ts.worked_hours, 0)::numeric,
           COALESCE(day_ts.entries, 0), COALESCE(day_ts.open_entries, 0),
           COALESCE(c.name, ''), COUNT(*) OVER ()
    FROM days
    LEFT JOIN public.company_attendance ca
           ON ca.student_id = p_student_id AND ca.attendance_date = days.d
    LEFT JOIN public.companies c ON c.id = ca.company_id
    LEFT JOIN LATERAL (
        SELECT min(ts.clock_in) AS time_in, max(ts.clock_out) AS time_out,
               count(*)::int AS entries,
               count(*) FILTER (WHERE ts.clock_out IS NULL)::int AS open_entries,
               COALESCE(sum(
                   CASE WHEN ts.clock_out IS NOT NULL AND ts.clock_out > ts.clock_in THEN
                       EXTRACT(EPOCH FROM (ts.clock_out - ts.clock_in)) / 3600.0
                       - CASE WHEN ts.break_start IS NOT NULL AND ts.break_end IS NOT NULL
                                   AND ts.break_end > ts.break_start
                              THEN EXTRACT(EPOCH FROM (ts.break_end - ts.break_start)) / 3600.0
                              ELSE 0 END
                   ELSE 0 END), 0) AS worked_hours
        FROM public.timesheets ts
        WHERE ts.user_id = p_student_id AND ts.clock_in IS NOT NULL AND ts.clock_in::date = days.d
    ) day_ts ON TRUE
    ORDER BY days.d DESC
    LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_attendance(p_attendance_date date)
RETURNS TABLE(attendance_id uuid, student_auth_id uuid, student_profile_id uuid, first_name text, last_name text, email text, program text, department text, company_id uuid, company_name text, schedule_start time without time zone, schedule_end time without time zone, time_in timestamp with time zone, time_out timestamp with time zone, status text, reason text, remarks text, recorded_by uuid, recorded_by_name text, recorded_at timestamp with time zone, updated_by uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin_or_coordinator() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        ar.id,
        p.auth_user_id,
        p.id,
        p.first_name,
        p.last_name,
        COALESCE(p.email, ''),
        p.course,
        p.department,
        ar.company_id,
        COALESCE(c.name, ''),
        s.schedule_start,
        s.schedule_end,
        t.time_in,
        t.time_out,
        ar.status,
        ar.reason,
        ar.remarks,
        ar.recorded_by,
        rb.first_name || ' ' || COALESCE(rb.last_name, ''),
        ar.recorded_at,
        ar.updated_by,
        ar.updated_at
    FROM public.company_attendance ar
    JOIN public.profiles p
        ON p.auth_user_id = ar.student_id
       AND p.account_type = 'student'
    LEFT JOIN public.companies c ON c.id = ar.company_id
    LEFT JOIN LATERAL (
        SELECT s2.start_time AS schedule_start, s2.end_time AS schedule_end
        FROM public.schedules s2
        LEFT JOIN public.schedule_students ss ON ss.schedule_id = s2.id
        WHERE (ss.student_id = p.auth_user_id OR (ss.student_id IS NULL AND s2.student_id = p.auth_user_id))
          AND s2.company_id = ar.company_id
          AND s2.status <> 'cancelled'
          AND (s2.start_date IS NULL OR s2.start_date <= p_attendance_date)
          AND (s2.end_date IS NULL OR s2.end_date >= p_attendance_date)
          AND (s2.recurrence IN ('none', 'daily') OR s2.working_days ? trim(to_char(p_attendance_date, 'Day')))
        ORDER BY s2.start_time NULLS LAST
        LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
        SELECT min(ts.clock_in) AS time_in, max(ts.clock_out) AS time_out
        FROM public.timesheets ts
        WHERE ts.user_id = p.auth_user_id
          AND ts.clock_in IS NOT NULL
          AND ts.clock_in::date = p_attendance_date
    ) t ON TRUE
    LEFT JOIN public.profiles rb ON rb.auth_user_id = ar.recorded_by
    WHERE ar.attendance_date = p_attendance_date
    ORDER BY c.name NULLS LAST, p.first_name NULLS LAST, p.last_name NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_audit(p_attendance_id uuid)
RETURNS TABLE(id uuid, action text, old_status text, new_status text, reason text, remarks text, changed_by uuid, changed_by_name text, changed_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_profile public.profiles%ROWTYPE;
    v_company_id uuid;
BEGIN
    SELECT * INTO v_actor_profile FROM public.profiles WHERE auth_user_id = auth.uid();

    -- A deactivated account of any role reads nothing.
    IF v_actor_profile.id IS NULL OR v_actor_profile.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    IF v_actor_profile.account_type = 'company' THEN
        v_company_id := v_actor_profile.company_id;
        IF NOT EXISTS (
            SELECT 1 FROM public.company_attendance ca
            WHERE ca.id = p_attendance_id AND ca.company_id = v_company_id
        ) THEN
            RAISE EXCEPTION 'Attendance record not found in your company';
        END IF;
    ELSIF NOT public.is_admin_or_coordinator() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.action,
        a.old_status,
        a.new_status,
        a.reason,
        a.remarks,
        a.changed_by,
        COALESCE(p.first_name || ' ' || COALESCE(p.last_name, ''), ''),
        a.changed_at
    FROM public.company_attendance_audit a
    LEFT JOIN public.profiles p ON p.auth_user_id = a.changed_by
    WHERE a.attendance_id = p_attendance_id
    ORDER BY a.changed_at DESC;
END;
$$;

-- Staff (admin, coordinator, adviser) read the daily-limit warning log.
-- is_adviser() already requires an active adviser.
CREATE OR REPLACE FUNCTION public.get_attendance_limit_alerts(
  p_from date DEFAULT ((now() - '30 days'::interval))::date,
  p_to date DEFAULT (now())::date
)
RETURNS TABLE(id uuid, student_id uuid, student_name text, attendance_date date, alert_type text, recipient_email text, rendered_minutes integer, limit_minutes integer, over_limit_minutes integer, email_sent boolean, email_error text, email_attempts integer, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT a.id, a.student_id,
         NULLIF(trim(concat_ws(' ', s.first_name, s.last_name)), ''),
         a.attendance_date, a.alert_type, a.recipient_email,
         a.rendered_minutes, a.limit_minutes, a.over_limit_minutes,
         n.email_sent, n.email_error, n.email_attempts, a.created_at
    FROM public.attendance_limit_alerts a
    LEFT JOIN public.profiles s ON s.auth_user_id = a.student_id
    LEFT JOIN public.user_notifications n ON n.id = a.notification_id
   WHERE a.attendance_date BETWEEN p_from AND p_to
     AND (public.is_admin_or_coordinator() OR public.is_adviser())
   ORDER BY a.created_at DESC;
$$;


-- ---------------------------------------------------------------------------
-- 5. Grants: signed-in callers only; the functions decide who gets data.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_get_security_alerts(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_assign_department(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_audit_logs_paginated(text, text, text, uuid, text, timestamp with time zone, timestamp with time zone, integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_audit_log_users() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_unread_audit_logs_count() FROM public, anon;
REVOKE ALL ON FUNCTION public.mark_audit_logs_as_seen() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_admin_attendance(date) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_admin_student_attendance_summary(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_admin_student_attendance_history(uuid, integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_all_attendance(date) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_attendance_audit(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_attendance_limit_alerts(date, date) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_security_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_department(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_logs_paginated(text, text, text, uuid, text, timestamp with time zone, timestamp with time zone, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_log_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_audit_logs_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_audit_logs_as_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_attendance(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_student_attendance_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_student_attendance_history(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_attendance(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_audit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_limit_alerts(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

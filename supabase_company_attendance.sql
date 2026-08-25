-- =============================================================================
-- Company Supervisor Attendance Management
--
-- Adds date-based attendance records that a Company Supervisor can record for
-- their assigned students (especially marking them ABSENT), with a full audit
-- trail, student notifications, and coordinator/admin visibility.
--
-- Tables: company_attendance, company_attendance_audit
-- RPCs:   record_attendance, get_company_attendance, get_all_attendance,
--         get_attendance_audit
-- Helpers: public.is_admin(), public.is_admin_or_coordinator()
--
-- Re-runnable: idempotent CREATE/DROP statements.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper role checks
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type IN ('admin', 'coordinator')
    );
$$;

-- -----------------------------------------------------------------------------
-- company_attendance table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    attendance_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'on_leave', 'incomplete')),
    reason text,
    remarks text,
    recorded_by uuid REFERENCES auth.users(id),
    recorded_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT company_attendance_unique_student_date UNIQUE (student_id, attendance_date)
);

ALTER TABLE public.company_attendance ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS company_attendance_company_date_idx
    ON public.company_attendance (company_id, attendance_date);
CREATE INDEX IF NOT EXISTS company_attendance_student_idx
    ON public.company_attendance (student_id);

-- updated_at maintenance
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'company_attendance_updated_at') THEN
        CREATE TRIGGER company_attendance_updated_at
        BEFORE UPDATE ON public.company_attendance
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

DROP POLICY IF EXISTS "Company attendance: company owner select" ON public.company_attendance;
CREATE POLICY "Company attendance: company owner select" ON public.company_attendance
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.auth_user_id = auth.uid()
              AND p.account_type = 'company'
              AND p.company_id = company_attendance.company_id
        )
    );

DROP POLICY IF EXISTS "Company attendance: coordinators and admins select" ON public.company_attendance;
CREATE POLICY "Company attendance: coordinators and admins select" ON public.company_attendance
    FOR SELECT
    USING (public.is_admin_or_coordinator());

-- Writes are intentionally NOT granted via RLS: all mutations go through the
-- SECURITY DEFINER record_attendance() RPC, which enforces authorization.
DROP POLICY IF EXISTS "Company attendance: no direct insert" ON public.company_attendance;
CREATE POLICY "Company attendance: no direct insert" ON public.company_attendance
    FOR INSERT
    WITH CHECK (false);

DROP POLICY IF EXISTS "Company attendance: no direct update" ON public.company_attendance;
CREATE POLICY "Company attendance: no direct update" ON public.company_attendance
    FOR UPDATE
    USING (false);

DROP POLICY IF EXISTS "Company attendance: no direct delete" ON public.company_attendance;
CREATE POLICY "Company attendance: no direct delete" ON public.company_attendance
    FOR DELETE
    USING (false);

-- -----------------------------------------------------------------------------
-- company_attendance_audit table (append-only history, never deletable)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_attendance_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id uuid REFERENCES public.company_attendance(id) ON DELETE CASCADE,
    student_id uuid NOT NULL,
    company_id uuid NOT NULL,
    attendance_date date NOT NULL,
    action text NOT NULL CHECK (action IN ('created', 'updated')),
    old_status text,
    new_status text NOT NULL,
    reason text,
    remarks text,
    changed_by uuid,
    changed_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_attendance_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS company_attendance_audit_attendance_idx
    ON public.company_attendance_audit (attendance_id);

DROP POLICY IF EXISTS "Company attendance audit: company owner select" ON public.company_attendance_audit;
CREATE POLICY "Company attendance audit: company owner select" ON public.company_attendance_audit
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.auth_user_id = auth.uid()
              AND p.account_type = 'company'
              AND p.company_id = company_attendance_audit.company_id
        )
    );

DROP POLICY IF EXISTS "Company attendance audit: coordinators and admins select" ON public.company_attendance_audit;
CREATE POLICY "Company attendance audit: coordinators and admins select" ON public.company_attendance_audit
    FOR SELECT
    USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Company attendance audit: no direct write" ON public.company_attendance_audit;
CREATE POLICY "Company attendance audit: no direct write" ON public.company_attendance_audit
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- record_attendance(company supervisor / coordinator / admin)
-- Inserts or updates a single student's attendance for a date, deriving the
-- company from the session (never from the client). Writes an audit entry.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_attendance(
    p_student_id uuid,
    p_attendance_date date,
    p_status text,
    p_reason text DEFAULT NULL,
    p_remarks text DEFAULT NULL
)
RETURNS public.company_attendance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_profile public.profiles%ROWTYPE;
    v_company_id uuid;
    v_existing public.company_attendance%ROWTYPE;
    v_result public.company_attendance%ROWTYPE;
BEGIN
    IF p_status NOT IN ('present', 'absent', 'late', 'on_leave', 'incomplete') THEN
        RAISE EXCEPTION 'Invalid attendance status "%"', p_status;
    END IF;

    IF p_attendance_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Cannot record attendance for a future date';
    END IF;

    SELECT * INTO v_actor_profile FROM public.profiles WHERE auth_user_id = auth.uid();

    IF v_actor_profile.id IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    IF v_actor_profile.account_type = 'company' THEN
        v_company_id := v_actor_profile.company_id;
    ELSIF v_actor_profile.account_type IN ('coordinator', 'admin') THEN
        -- Coordinator/admin must target a company that the student belongs to.
        SELECT p.company_id INTO v_company_id
        FROM public.profiles p
        WHERE p.auth_user_id = p_student_id AND p.account_type = 'student';
        IF v_company_id IS NULL THEN
            RAISE EXCEPTION 'Student not found';
        END IF;
    ELSE
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Verify the student is actually assigned to the target company.
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.auth_user_id = p_student_id
          AND p.account_type = 'student'
          AND p.company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Student is not assigned to your company';
    END IF;

    SELECT * INTO v_existing
    FROM public.company_attendance
    WHERE student_id = p_student_id AND attendance_date = p_attendance_date;

    IF v_existing.id IS NOT NULL THEN
        -- Guard against editing a record that belongs to another company.
        IF v_existing.company_id <> v_company_id THEN
            RAISE EXCEPTION 'Attendance record belongs to another company';
        END IF;

        UPDATE public.company_attendance
        SET status = p_status,
            reason = p_reason,
            remarks = p_remarks,
            updated_by = auth.uid(),
            updated_at = now()
        WHERE id = v_existing.id;

        INSERT INTO public.company_attendance_audit (
            attendance_id, student_id, company_id, attendance_date,
            action, old_status, new_status, reason, remarks, changed_by
        ) VALUES (
            v_existing.id, p_student_id, v_company_id, p_attendance_date,
            'updated', v_existing.status, p_status, p_reason, p_remarks, auth.uid()
        );
    ELSE
        INSERT INTO public.company_attendance (
            student_id, company_id, attendance_date,
            status, reason, remarks, recorded_by, recorded_at, updated_by, updated_at
        ) VALUES (
            p_student_id, v_company_id, p_attendance_date,
            p_status, p_reason, p_remarks, auth.uid(), now(), auth.uid(), now()
        )
        RETURNING * INTO v_result;

        INSERT INTO public.company_attendance_audit (
            attendance_id, student_id, company_id, attendance_date,
            action, old_status, new_status, reason, remarks, changed_by
        ) VALUES (
            v_result.id, p_student_id, v_company_id, p_attendance_date,
            'created', NULL, p_status, p_reason, p_remarks, auth.uid()
        );

        v_existing := v_result;
    END IF;

    -- source_id is uuid, so retain the attendance UUID rather than converting
    -- it to text. The explicit text cast causes SQLSTATE 42804 and rolls back
    -- this entire RPC for absent records.
    IF p_status = 'absent' THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read, source_type, source_id
        ) VALUES (
            p_student_id,
            'Attendance: Absent',
            'You have been marked as absent on ' || to_char(p_attendance_date, 'Mon DD, YYYY') || '. Please contact your supervisor for details.',
            'danger',
            false,
            'company_attendance',
            COALESCE(v_existing.id, v_result.id)
        );
    END IF;

    SELECT * INTO v_result FROM public.company_attendance WHERE id = v_existing.id;
    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_attendance(uuid, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, date, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_student_attendance_stats(company supervisor / coordinator / admin / self)
-- Counts from company_attendance rather than the legacy profiles.absences field.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_attendance_stats(p_student_id uuid)
RETURNS TABLE (absence_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_profile public.profiles%ROWTYPE;
    v_student_company_id uuid;
BEGIN
    SELECT * INTO v_actor_profile
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF v_actor_profile.id IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT company_id INTO v_student_company_id
    FROM public.profiles
    WHERE auth_user_id = p_student_id
      AND account_type = 'student';

    IF v_student_company_id IS NULL THEN
        RAISE EXCEPTION 'Student not found';
    END IF;

    IF v_actor_profile.account_type = 'company'
       AND v_actor_profile.company_id <> v_student_company_id THEN
        RAISE EXCEPTION 'Student is not assigned to your company';
    ELSIF v_actor_profile.account_type NOT IN ('company', 'coordinator', 'admin')
       AND auth.uid() <> p_student_id THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT count(*)::bigint
    FROM public.company_attendance ca
    WHERE ca.student_id = p_student_id
      AND ca.company_id = v_student_company_id
      AND ca.status = 'absent';
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_attendance_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_attendance_stats(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_company_attendance(company supervisor)
-- Returns one row per assigned student for the selected date, joining their
-- schedule and any existing attendance record and time logs for that date.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_company_attendance(p_attendance_date date)
RETURNS TABLE (
    student_auth_id uuid,
    student_profile_id uuid,
    first_name text,
    last_name text,
    email text,
    program text,
    department text,
    schedule_start time,
    schedule_end time,
    time_in timestamptz,
    time_out timestamptz,
    attendance_id uuid,
    status text,
    reason text,
    remarks text,
    recorded_by uuid,
    recorded_by_name text,
    recorded_at timestamptz,
    updated_by uuid,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_company_id uuid;
    v_role text;
BEGIN
    SELECT p.account_type, p.company_id INTO v_role, v_company_id
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid();

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    IF v_role = 'company' THEN
        NULL; -- v_company_id already set
    ELSIF v_role IN ('coordinator', 'admin') THEN
        -- Fall back to the first company the coordinator is associated with.
        SELECT p.company_id INTO v_company_id
        FROM public.profiles p
        WHERE p.auth_user_id = auth.uid() AND p.company_id IS NOT NULL
        LIMIT 1;
        IF v_company_id IS NULL THEN
            RETURN QUERY SELECT NULL::uuid WHERE false;
            RETURN;
        END IF;
    ELSE
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        p.auth_user_id,
        p.id,
        p.first_name,
        p.last_name,
        COALESCE(p.email, ''),
        p.course,
        p.department,
        s.schedule_start,
        s.schedule_end,
        t.time_in,
        t.time_out,
        ar.id,
        ar.status,
        ar.reason,
        ar.remarks,
        ar.recorded_by,
        rb.first_name || ' ' || COALESCE(rb.last_name, ''),
        ar.recorded_at,
        ar.updated_by,
        ar.updated_at
    FROM public.profiles p
    LEFT JOIN LATERAL (
        SELECT s2.start_time AS schedule_start, s2.end_time AS schedule_end
        FROM public.schedules s2
        LEFT JOIN public.schedule_students ss ON ss.schedule_id = s2.id
        WHERE (ss.student_id = p.auth_user_id OR (ss.student_id IS NULL AND s2.student_id = p.auth_user_id))
          AND s2.company_id = v_company_id
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
    LEFT JOIN public.company_attendance ar
        ON ar.student_id = p.auth_user_id
       AND ar.attendance_date = p_attendance_date
    LEFT JOIN public.profiles rb
        ON rb.auth_user_id = ar.recorded_by
    WHERE p.account_type = 'student'
      AND p.company_id = v_company_id
    ORDER BY p.first_name NULLS LAST, p.last_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_attendance(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_attendance(date) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_all_attendance(coordinator / admin)
-- Monitors attendance records across all companies for a given date.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_attendance(p_attendance_date date)
RETURNS TABLE (
    attendance_id uuid,
    student_auth_id uuid,
    student_profile_id uuid,
    first_name text,
    last_name text,
    email text,
    program text,
    department text,
    company_id uuid,
    company_name text,
    schedule_start time,
    schedule_end time,
    time_in timestamptz,
    time_out timestamptz,
    status text,
    reason text,
    remarks text,
    recorded_by uuid,
    recorded_by_name text,
    recorded_at timestamptz,
    updated_by uuid,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_profile public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_actor_profile FROM public.profiles WHERE auth_user_id = auth.uid();

    IF v_actor_profile.id IS NULL OR v_actor_profile.account_type NOT IN ('coordinator', 'admin') THEN
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

REVOKE ALL ON FUNCTION public.get_all_attendance(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_attendance(date) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_attendance_audit(attendance id)
-- Returns the change history for one attendance record.
-- Callable by the owning company, coordinators, and admins only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attendance_audit(p_attendance_id uuid)
RETURNS TABLE (
    id uuid,
    action text,
    old_status text,
    new_status text,
    reason text,
    remarks text,
    changed_by uuid,
    changed_by_name text,
    changed_at timestamptz
)
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

    IF v_actor_profile.id IS NULL THEN
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
    ELSIF v_actor_profile.account_type NOT IN ('coordinator', 'admin') THEN
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

REVOKE ALL ON FUNCTION public.get_attendance_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_audit(uuid) TO authenticated;

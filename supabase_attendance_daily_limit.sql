-- ==============================================================================
-- Daily rendered-hours limit: detection, notification and audit
-- ==============================================================================
-- Students must not accidentally render more than the allowed hours in one day.
-- This migration adds the server-side detection and the one-per-day alerting
-- that goes with it. It changes no existing clock-in/clock-out behaviour: the
-- student still clocks out themselves, and the real timestamp is still what is
-- recorded.
--
-- What it reuses rather than rebuilds:
--   * public.system_settings -> 'ojt_hours' -> 'max_daily' is ALREADY the
--     configurable daily limit (edited in Admin -> Settings). It stays the one
--     source of truth; nothing here hard-codes 8.
--   * public.user_notifications is the notification store, and the existing
--     `notification_email` webhook turns every INSERT into an email through the
--     notification-email Edge Function — including the atomic send claim, the
--     per-user email preferences, and email_error/email_attempts on failure.
--     So "send the email" here means "write one notification row".
--   * The rendered-time rule matches supabase_admin_attendance.sql exactly:
--     clock_out - clock_in, less a COMPLETED break.
--
-- Contents:
--   1. Timesheet columns for the per-record limit state
--   2. attendance_limit_alerts — the audit trail and the duplicate guard
--   3. Settings readers (limit, warning threshold, timezone)
--   4. Rendered-time helpers, timezone-aware
--   5. process_attendance_daily_limits() — the detector and notifier
--   6. check_my_attendance_limit() — the student's own foreground check
--   7. get_attendance_limit_alerts() — the audit view for staff
--   8. pg_cron schedule (background detection)
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-record limit state
--    daily_limit_status is the state of the DAY this record belongs to, carried
--    on the record so a table listing can filter and badge without recomputing.
-- ----------------------------------------------------------------------------
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS daily_limit_status TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS limit_notification_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limit_notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS over_limit_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.timesheets
  DROP CONSTRAINT IF EXISTS timesheets_daily_limit_status_check;
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_daily_limit_status_check
  CHECK (daily_limit_status IN ('NORMAL', 'LIMIT_REACHED', 'OVER_LIMIT'));

-- The detector only ever scans open records; this is the index it needs.
CREATE INDEX IF NOT EXISTS timesheets_open_idx
  ON public.timesheets (user_id, clock_in) WHERE clock_out IS NULL;

-- ----------------------------------------------------------------------------
-- 1b. Where a notification's button goes
--     The notification email previously always linked to the portal root. A
--     "please clock out" email needs to land on the clock-out control itself,
--     so notifications may now carry their own in-app path and button label.
--     Both are optional; the Edge Function keeps its old behaviour when they
--     are null. The path is app-relative and is validated on the way in, so a
--     notification can never redirect a recipient off-site.
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS action_path TEXT,
  ADD COLUMN IF NOT EXISTS action_label TEXT;

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_action_path_check;
ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_action_path_check
  CHECK (action_path IS NULL OR action_path ~ '^/[A-Za-z0-9/_\-?=&.]*$');

-- ----------------------------------------------------------------------------
-- 2. Alert log
--    This table IS the duplicate guard. A boolean on the timesheet is not
--    enough: a student can have several sessions in a day, and the rule is one
--    warning per student per day, not one per session. The unique index makes
--    that impossible to violate even if two detector runs overlap.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_limit_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timesheet_id       UUID REFERENCES public.timesheets(id) ON DELETE SET NULL,
  attendance_date    DATE NOT NULL,
  alert_type         TEXT NOT NULL CHECK (alert_type IN ('student_limit_reached', 'coordinator_limit_alert')),
  -- Who was told. For a student alert this is the student themselves.
  recipient_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email    TEXT,
  -- The notification row carries the email delivery state (email_sent,
  -- email_error, email_attempts), so it is not duplicated here.
  notification_id    UUID REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  rendered_minutes   INTEGER NOT NULL,
  limit_minutes      INTEGER NOT NULL,
  over_limit_minutes INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_limit_alerts_once_per_day
  ON public.attendance_limit_alerts (student_id, attendance_date, alert_type, recipient_id);
CREATE INDEX IF NOT EXISTS attendance_limit_alerts_date_idx
  ON public.attendance_limit_alerts (attendance_date DESC);

ALTER TABLE public.attendance_limit_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read their own limit alerts" ON public.attendance_limit_alerts;
CREATE POLICY "Students read their own limit alerts"
  ON public.attendance_limit_alerts FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff read limit alerts" ON public.attendance_limit_alerts;
CREATE POLICY "Staff read limit alerts"
  ON public.attendance_limit_alerts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = (SELECT auth.uid())
      AND p.account_type IN ('admin', 'coordinator', 'adviser')
  ));

-- ----------------------------------------------------------------------------
-- 3. Settings readers
--    max_daily is stored in hours because that is what the admin screen edits;
--    everything downstream works in minutes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_daily_limit_minutes()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT GREATEST(60, LEAST(1440, COALESCE(
    (SELECT NULLIF(round((value ->> 'max_daily')::numeric * 60), 0)::integer
       FROM public.system_settings
      WHERE key = 'ojt_hours'
        AND jsonb_typeof(value -> 'max_daily') = 'number'),
    480)));
$$;

/** Minutes before the limit at which the student is told they are close. */
CREATE OR REPLACE FUNCTION public.attendance_warning_minutes()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT GREATEST(0, public.attendance_daily_limit_minutes() - COALESCE(
    (SELECT (value ->> 'warning_lead_minutes')::integer
       FROM public.system_settings
      WHERE key = 'ojt_hours'
        AND jsonb_typeof(value -> 'warning_lead_minutes') = 'number'),
    15));
$$;

/**
 * After this many hours, an open record is abandoned rather than active.
 *
 * A student who forgets to clock out leaves a record open indefinitely — this
 * project has one open since May. Such a record is a missing-clock-out anomaly
 * (already flagged by the attendance monitor), not a student working a 127-day
 * shift, and warning them to "clock out, you have reached today's limit" would
 * be false on both counts. The bound is generous enough for a genuine overnight
 * shift that crosses midnight.
 */
CREATE OR REPLACE FUNCTION public.attendance_stale_open_hours()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT GREATEST(1, COALESCE(
    (SELECT (value ->> 'stale_open_hours')::integer
       FROM public.system_settings
      WHERE key = 'ojt_hours'
        AND jsonb_typeof(value -> 'stale_open_hours') = 'number'),
    24));
$$;

/** Never the server's timezone: attendance days are Philippine days. */
CREATE OR REPLACE FUNCTION public.attendance_time_zone()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT COALESCE(
    (SELECT NULLIF(trim(value ->> 'time_zone'), '')
       FROM public.system_settings WHERE key = 'ojt_hours'),
    'Asia/Manila');
$$;

-- SECURITY: this project has
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--     TO anon, authenticated, service_role;
-- so every new function is granted to anon as a DIRECT role grant, and PUBLIC
-- holds EXECUTE by default on top of that. Both must be named: revoking from
-- anon alone leaves the PUBLIC grant, and revoking from PUBLIC alone leaves the
-- direct one. Without this, attendance_daily_minutes(uuid, date) is a
-- SECURITY DEFINER read of ANY student's rendered time for ANY day, callable
-- from the browser with nothing but the publishable key.
REVOKE ALL ON FUNCTION public.attendance_daily_limit_minutes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attendance_warning_minutes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attendance_time_zone() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attendance_stale_open_hours() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.attendance_daily_limit_minutes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attendance_warning_minutes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attendance_time_zone() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attendance_stale_open_hours() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Rendered time
--    Same rule the admin attendance report already uses — elapsed time less a
--    COMPLETED break — extended in the only two ways an open record needs:
--    an open record runs to now(), and a break that is still running is
--    subtracted from now() so time does not accrue while the student is away.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timesheet_worked_minutes(
  p_clock_in    TIMESTAMPTZ,
  p_clock_out   TIMESTAMPTZ,
  p_break_start TIMESTAMPTZ,
  p_break_end   TIMESTAMPTZ,
  p_now         TIMESTAMPTZ DEFAULT now()
)
RETURNS INTEGER LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT GREATEST(0, floor(
    EXTRACT(EPOCH FROM (COALESCE(p_clock_out, p_now) - p_clock_in)) / 60.0
    - CASE
        WHEN p_break_start IS NOT NULL AND p_break_end IS NOT NULL AND p_break_end > p_break_start
          THEN EXTRACT(EPOCH FROM (p_break_end - p_break_start)) / 60.0
        WHEN p_break_start IS NOT NULL AND p_break_end IS NULL AND p_clock_out IS NULL
          THEN EXTRACT(EPOCH FROM (p_now - p_break_start)) / 60.0
        ELSE 0
      END
  ))::integer;
$$;

/**
 * Everything the student has rendered on one attendance day.
 *
 * Accumulated across every session on that day, never derived from the latest
 * clock-in alone. Rejected records are excluded, and the day boundary is the
 * configured timezone's, so records never mix across dates.
 */
CREATE OR REPLACE FUNCTION public.attendance_daily_minutes(p_user_id UUID, p_day DATE)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT COALESCE(SUM(
    public.timesheet_worked_minutes(ts.clock_in, ts.clock_out, ts.break_start, ts.break_end, now())
  ), 0)::integer
  FROM public.timesheets ts
  WHERE ts.user_id = p_user_id
    AND COALESCE(ts.approval_status, 'pending') <> 'rejected'
    AND (ts.clock_in AT TIME ZONE public.attendance_time_zone())::date = p_day;
$$;

REVOKE ALL ON FUNCTION public.timesheet_worked_minutes(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attendance_daily_minutes(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_worked_minutes(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attendance_daily_minutes(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.attendance_limit_state(p_minutes INTEGER, p_limit INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog AS $$
  SELECT CASE
    WHEN p_minutes > p_limit THEN 'OVER_LIMIT'
    WHEN p_minutes >= p_limit THEN 'LIMIT_REACHED'
    ELSE 'NORMAL'
  END;
$$;

REVOKE ALL ON FUNCTION public.attendance_limit_state(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_limit_state(integer, integer) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. The detector
--
--    Runs on a schedule (section 8) so it works whether or not the student has
--    the page open, and can also be called for one student from the foreground.
--    It is idempotent: running it every minute changes nothing after the first
--    alert, because the alert row is what gates the notification.
--
--    It writes user_notifications directly rather than through notify_users(),
--    which requires an authenticated actor — this is a system notification with
--    no acting user. The webhook on that table sends the email.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_attendance_daily_limits(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit           INTEGER := public.attendance_daily_limit_minutes();
  v_tz              TEXT    := public.attendance_time_zone();
  v_stale_hours     INTEGER := public.attendance_stale_open_hours();
  v_now             TIMESTAMPTZ := now();
  v_record          RECORD;
  v_day             DATE;
  v_minutes         INTEGER;
  v_over            INTEGER;
  v_state           TEXT;
  v_alert_id        UUID;
  v_notification_id UUID;
  v_student_name    TEXT;
  v_email           TEXT;
  v_message         TEXT;
  v_coordinator     RECORD;
  v_scanned         INTEGER := 0;
  v_reached         INTEGER := 0;
  v_notified        INTEGER := 0;
  v_staff_notified  INTEGER := 0;
BEGIN
  FOR v_record IN
    SELECT ts.id, ts.user_id, ts.clock_in,
           p.first_name, p.last_name, p.email, p.company_id
      FROM public.timesheets ts
      JOIN public.profiles p ON p.auth_user_id = ts.user_id
     WHERE ts.clock_out IS NULL                                   -- still open
       AND ts.status IN ('working', 'break')                      -- not completed
       AND COALESCE(ts.approval_status, 'pending') <> 'rejected'  -- not invalidated
       AND p.account_type = 'student'
       -- An open record older than the stale bound is a forgotten clock-out,
       -- not an active session; warning about it would be a false positive.
       AND ts.clock_in > v_now - make_interval(hours => v_stale_hours)
       AND (p_user_id IS NULL OR ts.user_id = p_user_id)
     ORDER BY ts.clock_in
  LOOP
    v_scanned := v_scanned + 1;
    v_day     := (v_record.clock_in AT TIME ZONE v_tz)::date;
    v_minutes := public.attendance_daily_minutes(v_record.user_id, v_day);
    v_over    := GREATEST(0, v_minutes - v_limit);
    v_state   := public.attendance_limit_state(v_minutes, v_limit);

    -- Keep the record's own badge current, including on the way back down if an
    -- earlier session was later rejected.
    UPDATE public.timesheets
       SET daily_limit_status = v_state,
           over_limit_minutes = v_over
     WHERE id = v_record.id
       AND (daily_limit_status IS DISTINCT FROM v_state
            OR over_limit_minutes IS DISTINCT FROM v_over);

    CONTINUE WHEN v_minutes < v_limit;
    v_reached := v_reached + 1;

    v_student_name := NULLIF(trim(concat_ws(' ', v_record.first_name, v_record.last_name)), '');
    v_email        := v_record.email;

    -- ── Student warning: at most one per student per attendance day ────────
    v_alert_id := NULL;
    INSERT INTO public.attendance_limit_alerts (
      student_id, timesheet_id, attendance_date, alert_type,
      recipient_id, recipient_email, rendered_minutes, limit_minutes, over_limit_minutes
    ) VALUES (
      v_record.user_id, v_record.id, v_day, 'student_limit_reached',
      v_record.user_id, v_email, v_minutes, v_limit, v_over
    )
    ON CONFLICT (student_id, attendance_date, alert_type, recipient_id) DO NOTHING
    RETURNING id INTO v_alert_id;

    IF v_alert_id IS NOT NULL THEN
      v_message :=
        'Our SIL/OJT Monitoring System detected that you have reached the maximum allowed '
        || (v_limit / 60) || ' working hours for today.' || E'\n\n'
        || 'Date: ' || to_char(v_day, 'FMMonth FMDD, YYYY') || E'\n'
        || 'Time In: ' || to_char(v_record.clock_in AT TIME ZONE v_tz, 'FMHH12:MI AM') || E'\n'
        || 'Current Time: ' || to_char(v_now AT TIME ZONE v_tz, 'FMHH12:MI AM') || E'\n'
        || 'Rendered Time: ' || (v_minutes / 60) || ' hours ' || (v_minutes % 60) || ' minutes' || E'\n\n'
        || 'Please return to the SIL/OJT Monitoring System and clock out immediately.' || E'\n\n'
        || 'If you believe this notification was sent incorrectly, please contact your assigned coordinator.';

      INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, action_path, action_label
      ) VALUES (
        v_record.user_id,
        'Action Required: Please Clock Out - Daily Hour Limit Reached',
        v_message,
        'warning', false,
        'attendance', 'timesheet', v_record.id,
        '/student?action=clock-out', 'Clock out now'
      )
      RETURNING id INTO v_notification_id;

      UPDATE public.attendance_limit_alerts
         SET notification_id = v_notification_id
       WHERE id = v_alert_id;

      UPDATE public.timesheets
         SET limit_notification_sent = true,
             limit_notification_sent_at = v_now
       WHERE user_id = v_record.user_id
         AND (clock_in AT TIME ZONE v_tz)::date = v_day;

      v_notified := v_notified + 1;
    END IF;

    -- ── Coordinator alert: one per coordinator, per student, per day ───────
    FOR v_coordinator IN
      SELECT DISTINCT c.coordinator_id AS id, cp.email
        FROM public.coordinator_handled_companies c
        JOIN public.profiles cp
          ON cp.auth_user_id = c.coordinator_id AND cp.account_type = 'coordinator'
       WHERE v_record.company_id IS NOT NULL
         AND c.company_id = v_record.company_id
    LOOP
      v_alert_id := NULL;
      INSERT INTO public.attendance_limit_alerts (
        student_id, timesheet_id, attendance_date, alert_type,
        recipient_id, recipient_email, rendered_minutes, limit_minutes, over_limit_minutes
      ) VALUES (
        v_record.user_id, v_record.id, v_day, 'coordinator_limit_alert',
        v_coordinator.id, v_coordinator.email, v_minutes, v_limit, v_over
      )
      ON CONFLICT (student_id, attendance_date, alert_type, recipient_id) DO NOTHING
      RETURNING id INTO v_alert_id;

      CONTINUE WHEN v_alert_id IS NULL;

      INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, action_path, action_label
      ) VALUES (
        v_coordinator.id,
        'Student Daily Limit Alert',
        COALESCE(v_student_name, 'A student')
          || ' has reached the ' || (v_limit / 60) || '-hour daily SIL/OJT limit.' || E'\n\n'
          || 'Date: ' || to_char(v_day, 'FMMonth FMDD, YYYY') || E'\n'
          || 'Rendered: ' || (v_minutes / 60) || 'h ' || (v_minutes % 60) || 'm' || E'\n'
          || CASE WHEN v_over > 0 THEN 'Exceeded by: ' || v_over || 'm' || E'\n' ELSE '' END
          || E'\n' || 'Please review the attendance record.',
        'warning', false,
        'attendance', 'timesheet', v_record.id,
        '/coordinator/attendance', 'Review attendance'
      )
      RETURNING id INTO v_notification_id;

      UPDATE public.attendance_limit_alerts
         SET notification_id = v_notification_id
       WHERE id = v_alert_id;

      v_staff_notified := v_staff_notified + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'limit_reached', v_reached,
    'students_notified', v_notified,
    'coordinators_notified', v_staff_notified,
    'limit_minutes', v_limit,
    'ran_at', v_now
  );
END;
$$;

-- Only the scheduler and the service role may sweep every student.
REVOKE ALL ON FUNCTION public.process_attendance_daily_limits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_attendance_daily_limits(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. The student's own check
--    Called by the dashboard while the page is open. It can only ever act on
--    the caller's own records, and returns the numbers the dashboard renders so
--    the warning is decided server-side rather than trusted from the browser.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_my_attendance_limit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_tz      TEXT := public.attendance_time_zone();
  v_limit   INTEGER := public.attendance_daily_limit_minutes();
  v_day     DATE;
  v_minutes INTEGER;
  v_active  public.timesheets%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.process_attendance_daily_limits(v_user);

  v_day := (now() AT TIME ZONE v_tz)::date;
  v_minutes := public.attendance_daily_minutes(v_user, v_day);

  SELECT * INTO v_active
    FROM public.timesheets
   WHERE user_id = v_user
     AND clock_out IS NULL
     AND status IN ('working', 'break')
     AND COALESCE(approval_status, 'pending') <> 'rejected'
   ORDER BY clock_in DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'attendance_date', v_day,
    'rendered_minutes', v_minutes,
    'limit_minutes', v_limit,
    'warning_minutes', public.attendance_warning_minutes(),
    'over_limit_minutes', GREATEST(0, v_minutes - v_limit),
    'state', public.attendance_limit_state(v_minutes, v_limit),
    'active_timesheet_id', v_active.id,
    'active_clock_in', v_active.clock_in,
    'notification_sent', COALESCE(v_active.limit_notification_sent, false),
    'time_zone', v_tz
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_my_attendance_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_attendance_limit() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Audit view for staff
--    Every warning, who it went to, and whether the email actually left —
--    email_sent / email_error come from the notification row the Edge Function
--    maintains, so a failed send is visible rather than silently "sent".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attendance_limit_alerts(
  p_from DATE DEFAULT (now() - interval '30 days')::date,
  p_to   DATE DEFAULT now()::date
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  student_name TEXT,
  attendance_date DATE,
  alert_type TEXT,
  recipient_email TEXT,
  rendered_minutes INTEGER,
  limit_minutes INTEGER,
  over_limit_minutes INTEGER,
  email_sent BOOLEAN,
  email_error TEXT,
  email_attempts INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT a.id, a.student_id,
         NULLIF(trim(concat_ws(' ', s.first_name, s.last_name)), ''),
         a.attendance_date, a.alert_type, a.recipient_email,
         a.rendered_minutes, a.limit_minutes, a.over_limit_minutes,
         n.email_sent, n.email_error, n.email_attempts, a.created_at
    FROM public.attendance_limit_alerts a
    LEFT JOIN public.profiles s ON s.auth_user_id = a.student_id
    LEFT JOIN public.user_notifications n ON n.id = a.notification_id
   WHERE a.attendance_date BETWEEN p_from AND p_to
     AND EXISTS (
       SELECT 1 FROM public.profiles me
        WHERE me.auth_user_id = auth.uid()
          AND me.account_type IN ('admin', 'coordinator', 'adviser')
     )
   ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_limit_alerts(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_limit_alerts(date, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Background detection
--    The check must not depend on the student keeping the page open, so it runs
--    on a schedule. Every five minutes is well inside a useful warning window
--    and costs one indexed scan of the open records.
-- ----------------------------------------------------------------------------
--    Everything above works without pg_cron; this block only adds the timer.
--    It is wrapped so a project that cannot enable the extension still gets a
--    working migration, with a NOTICE saying what is missing. Without it the
--    warning still fires for any student who has the dashboard open (the
--    foreground check in section 6), but not for one who closed the tab — so
--    read the notice if it appears.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  BEGIN
    PERFORM cron.unschedule('attendance-daily-limit');
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- not scheduled yet, which is the normal first run
  END;

  PERFORM cron.schedule(
    'attendance-daily-limit',
    '*/5 * * * *',
    'SELECT public.process_attendance_daily_limits();'
  );
  RAISE NOTICE 'Scheduled attendance-daily-limit every 5 minutes.';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not schedule the daily-limit check (%). Enable pg_cron in the Supabase dashboard (Database -> Extensions) and re-run this block, or call process_attendance_daily_limits() from an external scheduler.', SQLERRM;
END;
$$;

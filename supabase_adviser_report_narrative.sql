-- ═══════════════════════════════════════════════════════════════════════════
-- ADVISER DAILY REPORT — THE ADVISER'S OWN VERSION OF THE NARRATIVE
--
-- Run this entire file once in the Supabase SQL Editor (or apply it as a
-- migration). It is idempotent: the two columns are added only when missing and
-- every function is CREATE OR REPLACE, so a second run changes nothing. The
-- 1100-line supabase_adviser_daily_report.sql does not have to be re-run.
--
-- The generated analysis is never modified: the narrative is stored beside the
-- payload, and neither generate_my_daily_report's nor
-- generate_all_adviser_daily_reports's ON CONFLICT list mentions it, so
-- regenerating the figures — by hand or at 5 PM — leaves the adviser's words
-- intact. The UI compares generated_at with narrative_edited_at to say so.
--
-- adviser_daily_report_json is replaced below with two extra keys. The copy in
-- supabase_adviser_daily_report.sql does not have them, so if that file is ever
-- re-run, run this one again after it.
--
-- Nothing else changes: no RLS policy is added (the table stays SELECT-only for
-- `authenticated`, and the SECURITY DEFINER function below is the write path),
-- and the email body stays counts-only — an edited narrative names students, so
-- it stays behind the login.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.adviser_daily_reports
  ADD COLUMN IF NOT EXISTS narrative           TEXT,
  ADD COLUMN IF NOT EXISTS narrative_edited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.adviser_daily_reports.narrative IS
  'The adviser''s own version of the report narrative, or NULL when they have not written one. The generators never write it.';
COMMENT ON COLUMN public.adviser_daily_reports.narrative_edited_at IS
  'When the adviser last saved their narrative. Compared with generated_at to flag an edit written before the figures were rebuilt.';


-- Extended so all three readers expose the two new fields at once. Every
-- existing key is unchanged.
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
    'report',                 r.payload,
    'narrative',              r.narrative,
    'narrative_edited_at',    r.narrative_edited_at
  );
$$;


-- Saves (or, given NULL or blank text, clears) the calling adviser's narrative
-- for one report date. There is no adviser-id parameter: the row is found by
-- auth.uid(), so there is nothing a caller could change to reach another
-- adviser's report.
CREATE OR REPLACE FUNCTION public.save_my_daily_report_narrative(
  p_date      date,
  p_narrative text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_date date := COALESCE(p_date, (now() AT TIME ZONE public.attendance_time_zone())::date);
  -- Empty or whitespace-only text is a revert, never an empty report. btrim's
  -- default strips spaces only, so a textarea holding just line breaks would
  -- otherwise be stored as an "edit" with nothing in it.
  v_text text := NULLIF(btrim(COALESCE(p_narrative, ''), E' \t\r\n'), '');
  v_row  public.adviser_daily_reports;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type INTO v_role
    FROM public.profiles WHERE auth_user_id = v_uid;

  -- The same gate as generate_my_daily_report: a hidden Edit button is not security.
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

COMMENT ON FUNCTION public.save_my_daily_report_narrative(date, text) IS
  'Saves the calling adviser''s own wording of one stored daily report, or clears it when given NULL or blank text. Adviser-only; the row is scoped to auth.uid(). Never touches the payload or the counts.';

REVOKE ALL ON FUNCTION public.save_my_daily_report_narrative(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_daily_report_narrative(date, text) TO authenticated;

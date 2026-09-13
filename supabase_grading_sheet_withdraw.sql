-- ═══════════════════════════════════════════════════════════════════════════
-- ADVISER "WITHDRAW SUBMISSION"  (for_review → draft)
--
-- Run this entire file once in the Supabase SQL Editor. It is idempotent and
-- adds nothing but one function and its grants, so the 57 KB
-- supabase_grading_sheet.sql module does not have to be re-run to deploy it.
-- The same function lives in that file (section 4, beside
-- submit_grading_sheet), which remains the canonical copy.
--
-- Until now the only way back from for_review was the Coordinator's Return for
-- Correction, which requires a written reason and reads as a rejection. This
-- lets the adviser take their own sheet back while the Coordinator has not yet
-- acted on it.
--
-- Nothing else changes: grades stay locked in for_review, editing still
-- happens only in draft, no new status is introduced, and no grading_sheet_items
-- row is touched.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Adviser: pull a submitted sheet back to draft.
 *
 * The counterpart to submit_grading_sheet, and the reason an adviser no longer
 * needs the Coordinator to "return" a sheet over a typo. Allowed only while the
 * Coordinator has not acted: once the sheet is verified or finalized, the
 * existing return/correction rules are the only way back.
 */
CREATE OR REPLACE FUNCTION public.withdraw_grading_sheet(
    p_sheet_id uuid,
    p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sheet   public.grading_sheets;
    v_section text;
    v_term    text;
    v_adviser text;
    v_dept    uuid;
    v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF v_sheet.adviser_id <> auth.uid() OR NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Only the adviser who owns this grading sheet may withdraw it.';
    END IF;
    IF v_sheet.status = 'draft' THEN
        RAISE EXCEPTION 'This grading sheet is already a draft.';
    END IF;
    IF v_sheet.status <> 'for_review' THEN
        RAISE EXCEPTION 'This grading sheet has already been % by the Coordinator and can no longer be withdrawn. Ask the Coordinator to return it for correction.',
            replace(v_sheet.status, '_', ' ');
    END IF;

    -- return_reason / returned_at / returned_by are deliberately left alone: a
    -- withdrawal is not a return, and submit_grading_sheet clears them anyway.
    UPDATE public.grading_sheets
       SET status = 'draft', submitted_at = NULL, updated_at = now()
     WHERE id = p_sheet_id;

    INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, old_status, new_status, reason)
    VALUES (p_sheet_id, auth.uid(), 'withdraw', 'for_review', 'draft', v_reason);

    SELECT s.name, s.department_id,
           sy.school_year || ' · ' || initcap(sy.semester) || ' Semester'
      INTO v_section, v_dept, v_term
      FROM public.grading_sheets gs
      JOIN public.sections s      ON s.id = gs.section_id
      JOIN public.school_years sy ON sy.id = gs.school_year_id
     WHERE gs.id = p_sheet_id;

    SELECT btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
      INTO v_adviser FROM public.profiles WHERE auth_user_id = auth.uid();

    -- The row leaves the coordinator's queue without explanation otherwise.
    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    )
    SELECT
        p.auth_user_id,
        'Grading Sheet Withdrawn by the Adviser',
        coalesce(nullif(v_adviser, ''), 'A Section Adviser')
            || ' withdrew the Official Grading Sheet for ' || v_section
            || ' (' || v_term || ') for correction.'
            || CASE WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason ELSE '' END,
        'info', 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/coordinator/grading-sheets', 'Open Grading Sheets'
      FROM public.profiles p
     WHERE p.account_type = 'coordinator'
       AND p.auth_user_id IS NOT NULL
       AND (p.department_id IS NULL OR v_dept IS NULL OR p.department_id = v_dept);

    RETURN jsonb_build_object('status', 'draft');
END;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC, which reaches the `anon`
-- role through PostgREST; a SECURITY DEFINER function needs a session.
REVOKE EXECUTE ON FUNCTION public.withdraw_grading_sheet(uuid, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.withdraw_grading_sheet(uuid, text) TO authenticated;

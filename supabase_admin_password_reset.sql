-- ==============================================================================
-- Admin password reset: audit + notification
-- ==============================================================================
-- The privileged write (setting another user's password) happens in the
-- `admin-set-user-password` Edge Function with the service-role key. This RPC is
-- the audited, reason-free record of that action, called by the function with
-- the admin's own token so auth.uid() attributes it correctly.
--
-- It reuses write_force_action_audit (the shared audit writer) and drops a
-- system notification into the target's inbox, exactly like the other admin
-- overrides. It grants no table privilege and adds no RLS policy.
-- Safe to re-run.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_record_password_reset(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_name  text;
    v_email text;
    v_type  text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;

    SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), ''), email, account_type
      INTO v_name, v_email, v_type
      FROM public.profiles
     WHERE auth_user_id = p_target;

    IF v_type IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    -- An administrator's password is a self-service action; never record a
    -- reset of one here.
    IF v_type = 'admin' THEN
        RAISE EXCEPTION 'Administrator passwords cannot be changed here.';
    END IF;

    PERFORM public.write_force_action_audit(
        'UPDATE', 'User Management',
        'Admin override: reset the account password.',
        'user', p_target::text, coalesce(v_name, v_email, 'Unknown'),
        NULL,
        jsonb_build_object('password_reset', true, 'override', true)
    );

    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by
    ) VALUES (
        p_target,
        'Password Changed by an Administrator',
        'An administrator set a new password for your account. If you did not request this, contact your coordinator or administrator right away.',
        'warning', false,
        'system', 'user', p_target, auth.uid()
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_record_password_reset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_password_reset(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Assign approved internship companies onto student profiles.
-- Coordinators/admins may otherwise be blocked by department-scoped profile UPDATE policies,
-- which leaves students stuck in onboarding after their request is approved.

CREATE OR REPLACE FUNCTION public.assign_profile_company(p_user_ids uuid[], p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND account_type IN ('coordinator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only coordinators and admins can assign companies';
  END IF;

  UPDATE public.profiles
  SET company_id = p_company_id
  WHERE auth_user_id = ANY (p_user_ids)
    AND account_type = 'student';
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_profile_company(uuid[], uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

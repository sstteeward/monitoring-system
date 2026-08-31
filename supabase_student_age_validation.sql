-- Enforce the SIL/OJT age requirement at the database layer.
-- Run this in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.validate_student_age_eligibility(p_birth_date date)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_birth_date IS NULL THEN
        RETURN false;
    END IF;

    RETURN p_birth_date <= CURRENT_DATE - INTERVAL '18 years';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_student_age_requirement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.account_type = 'student' AND NEW.birthday IS NOT NULL AND NOT public.validate_student_age_eligibility(NEW.birthday) THEN
        RAISE EXCEPTION '⚠️ You must be at least 18 years old to participate in the SIL/OJT program.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_student_age_requirement_check ON public.profiles;

CREATE TRIGGER profiles_student_age_requirement_check
BEFORE INSERT OR UPDATE OF birthday, account_type
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_student_age_requirement();

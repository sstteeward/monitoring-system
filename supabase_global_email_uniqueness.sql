-- ============================================================================
-- Global email uniqueness across every portal (student / adviser / coordinator
-- / company / admin).
--
-- All account types live in the single `public.profiles` table and are backed
-- by one `auth.users` row, so "one email = one account" is enforced here:
--
--   1. `profiles.email` is normalized (trim + lowercase) on every write.
--   2. A unique index on lower(email) makes duplicates impossible, even under
--      concurrent registrations or direct API calls.
--   3. `public.is_email_registered()` gives the client a server-side pre-check.
--   4. `public.assert_signup_email_available()` re-checks server-side *after*
--      OTP verification, before the app writes the profile.
--   5. A guard trigger stops an existing account from being re-pointed at a
--      different portal by changing its own `account_type`.
--
-- An account counts as "registered" once its auth user has a password, which
-- is the last step of the signup flow. Half-finished signups (an OTP was sent
-- but the flow was abandoned) therefore stay retryable instead of permanently
-- burning the address.
--
-- Safe to re-run. Does not delete or migrate existing accounts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalize stored emails (no-op when they are already normalized)
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET email = lower(btrim(email)),
    email_domain = split_part(lower(btrim(email)), '@', 2)
WHERE email IS NOT NULL
  AND email IS DISTINCT FROM lower(btrim(email));

-- ---------------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------------

-- Canonical email form. Keep in lockstep with src/utils/email.ts.
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(lower(btrim(p_email)), '');
$$;

-- An auth user is "established" once a password has been set on it, which is
-- the final step of registration.
CREATE OR REPLACE FUNCTION public.auth_user_is_established(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_user_id
      AND u.encrypted_password IS NOT NULL
      AND u.encrypted_password <> ''
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Server-side availability check used by every registration entry point
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(btrim(u.email)) = public.normalize_email(p_email)
      AND u.encrypted_password IS NOT NULL
      AND u.encrypted_password <> ''
  )
  OR EXISTS (
    -- Catches a profile whose email was set independently of its auth user.
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u2 ON u2.id = p.auth_user_id
    WHERE public.normalize_email(p.email) = public.normalize_email(p_email)
      AND u2.encrypted_password IS NOT NULL
      AND u2.encrypted_password <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Post-OTP guard
--
-- The signup flow signs the visitor in with an email OTP before it writes the
-- profile. If that OTP landed on an account that is already registered, the
-- address belongs to somebody else's portal account and registration must
-- stop here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_signup_email_available()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF public.auth_user_is_established(v_uid) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_signup_email_available() FROM public;
GRANT EXECUTE ON FUNCTION public.assert_signup_email_available() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row-level enforcement on public.profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_email_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_is_admin boolean;
BEGIN
  -- (a) Always store the canonical form.
  NEW.email := public.normalize_email(NEW.email);
  IF NEW.email IS NOT NULL THEN
    NEW.email_domain := split_part(NEW.email, '@', 2);
  END IF;

  -- (b) One email, one account — across every portal.
  IF NEW.email IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM public.normalize_email(OLD.email))
     AND EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE public.normalize_email(p.email) = NEW.email
         AND p.auth_user_id <> NEW.auth_user_id
     )
  THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  -- (c) A finished account cannot re-register itself into another portal by
  --     rewriting its own account_type. Administrators and server-side jobs
  --     (service role, SQL, no auth.uid()) keep working normally.
  IF TG_OP = 'UPDATE'
     AND NEW.account_type IS DISTINCT FROM OLD.account_type
     AND v_caller IS NOT NULL
     AND v_caller = OLD.auth_user_id
     AND public.auth_user_is_established(OLD.auth_user_id)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = v_caller AND p.account_type = 'admin'
    ) INTO v_caller_is_admin;

    IF NOT v_caller_is_admin THEN
      RAISE EXCEPTION 'ACCOUNT_TYPE_CHANGE_NOT_ALLOWED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_email_rules ON public.profiles;
CREATE TRIGGER profiles_email_rules
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_email_rules();

-- The hard backstop: even a direct API call or two simultaneous registrations
-- cannot land two rows on the same address.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique_idx
  ON public.profiles (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

-- ---------------------------------------------------------------------------
-- 6. Make the auth.users -> profiles trigger normalize and stay idempotent.
--
--    Two AFTER INSERT triggers run on auth.users (`auth_user_created` inserts
--    the bare row, `on_auth_user_created` fills in the signup metadata), so
--    this one has to upsert rather than plain-insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := public.normalize_email(new.email);
BEGIN
  INSERT INTO public.profiles (
    auth_user_id, email, email_domain, first_name, middle_name, last_name,
    suffix, account_type, required_ojt_hours, grade, absences
  )
  VALUES (
    new.id,
    v_email,
    split_part(coalesce(v_email, ''), '@', 2),
    (new.raw_user_meta_data->>'first_name'),
    (new.raw_user_meta_data->>'middle_name'),
    (new.raw_user_meta_data->>'last_name'),
    (new.raw_user_meta_data->>'suffix'),
    coalesce(new.raw_user_meta_data->>'account_type', 'student'),
    500,
    null,
    0
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email        = excluded.email,
    email_domain = excluded.email_domain,
    first_name   = coalesce(excluded.first_name, public.profiles.first_name),
    middle_name  = coalesce(excluded.middle_name, public.profiles.middle_name),
    last_name    = coalesce(excluded.last_name, public.profiles.last_name),
    suffix       = coalesce(excluded.suffix, public.profiles.suffix),
    account_type = coalesce(new.raw_user_meta_data->>'account_type', public.profiles.account_type);

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Only the two intentional entry points are reachable from the client.
--    Trigger functions are authorized at CREATE TRIGGER time rather than per
--    row, so revoking these does not affect the triggers above.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.auth_user_is_established(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_email_rules() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_signup_email_available() TO authenticated;

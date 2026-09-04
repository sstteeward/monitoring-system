-- ============================================================================
-- Global email uniqueness across every portal (student / adviser / coordinator
-- / company / admin), plus a correct notion of "registration finished".
--
-- All account types live in the single `public.profiles` table and are backed
-- by one `auth.users` row, so "one email = one account" is enforced here.
--
-- ---------------------------------------------------------------------------
-- WHY registration_status EXISTS (do not replace it with a password check)
-- ---------------------------------------------------------------------------
-- The signup flow uses `signInWithOtp({ shouldCreateUser: true })`, so the
-- auth user and its profile row are created when the code is SENT, long before
-- the person has proved anything.
--
-- An earlier version of this file inferred "registration finished" from
-- `auth.users.encrypted_password` being non-empty. That is wrong: GoTrue
-- stores a bcrypt hash of a random password on every user it creates,
-- including the throwaway one behind signInWithOtp. Every row in this project
-- carries a `$2a$` hash, so a half-finished signup was indistinguishable from
-- a real account. The consequences were:
--   * "Create Account" aborted right after a SUCCESSFUL code verification,
--     which consumed the code and forced a sign-out;
--   * pressing it again hit an already-consumed code, and GoTrue reports both
--     "expired" and "already used" as `otp_expired`, so the UI said the code
--     had expired minutes early;
--   * "Resend code" then said "Email already registered", because the pending
--     row looked like a finished account.
--
-- Completion is therefore an explicit, app-owned fact:
--   pending_verification -> the code was sent; the address is still FREE
--   complete             -> registration finished; the address is TAKEN
--
-- Safe to re-run. Does not delete or migrate existing accounts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Registration lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'pending_verification',
  ADD COLUMN IF NOT EXISTS registration_completed_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_registration_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_registration_status_check
  CHECK (registration_status IN ('pending_verification', 'complete'));

CREATE INDEX IF NOT EXISTS profiles_registration_status_idx
  ON public.profiles (registration_status);

-- Backfill: every account created before 2026-09-04 registered under the older
-- flow, which had no completion gate and always ran to the end. The only later
-- row is a signup that the broken guard interrupted mid-flight, which stays
-- pending so its owner can simply register again.
UPDATE public.profiles
SET registration_status = 'complete',
    registration_completed_at = coalesce(registration_completed_at, updated_at, created_at)
WHERE created_at < timestamptz '2026-09-04 00:00:00+00'
  AND registration_status <> 'complete';

-- ---------------------------------------------------------------------------
-- 2. Email normalization
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET email = lower(btrim(email)),
    email_domain = split_part(lower(btrim(email)), '@', 2)
WHERE email IS NOT NULL
  AND email IS DISTINCT FROM lower(btrim(email));

-- Canonical email form. Keep in lockstep with src/utils/email.ts.
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT nullif(lower(btrim(p_email)), '');
$$;

-- ---------------------------------------------------------------------------
-- 3. "Is this registration finished?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_is_complete(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = p_user_id
      AND p.registration_status = 'complete'
  );
$$;

-- Thin alias kept so older references keep working. It no longer looks at
-- encrypted_password — see the header for why that signal is useless.
CREATE OR REPLACE FUNCTION public.auth_user_is_established(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.registration_is_complete(p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- 4. Server-side availability check used by every registration entry point.
--    A pending verification NEVER makes an address look taken.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_email_registered(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE public.normalize_email(p.email) = public.normalize_email(p_email)
      AND p.registration_status = 'complete'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Post-OTP guard.
--    Verifying a code signs the visitor into whatever account owns the address,
--    so confirm it is a pending signup and not somebody's finished account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_signup_email_available()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF public.registration_is_complete(v_uid) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Server clock, as epoch milliseconds (UTC).
--    The client times the verification window from two readings of THIS, so no
--    browser clock, locale, or timezone conversion is ever involved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.server_now_ms()
RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- 7. The single atomic "registration finished" step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_signup_registration(
  p_account_type text,
  p_first_name   text,
  p_middle_name  text,
  p_last_name    text
)
RETURNS TABLE (account_type text, registration_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_is_active boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_account_type IS NULL OR p_account_type NOT IN
     ('student', 'coordinator', 'admin', 'company', 'adviser') THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_TYPE';
  END IF;

  SELECT public.normalize_email(u.email) INTO v_email
  FROM auth.users u WHERE u.id = v_uid;

  -- Re-check under the row lock: a completed account can never be re-claimed,
  -- and two concurrent submissions cannot both win.
  PERFORM 1 FROM public.profiles
   WHERE auth_user_id = v_uid AND registration_status = 'complete'
     FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  -- Coordinators wait for an administrator before their account goes live.
  v_is_active := (p_account_type <> 'coordinator');

  RETURN QUERY
  UPDATE public.profiles p SET
    email                     = coalesce(v_email, p.email),
    first_name                = nullif(btrim(coalesce(p_first_name, '')), ''),
    middle_name               = nullif(btrim(coalesce(p_middle_name, '')), ''),
    last_name                 = nullif(btrim(coalesce(p_last_name, '')), ''),
    account_type              = p_account_type,
    is_active                 = v_is_active,
    registration_status       = 'complete',
    registration_completed_at = now()
  WHERE p.auth_user_id = v_uid
  RETURNING p.account_type, p.registration_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Row-level enforcement on public.profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_email_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
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
       SELECT 1 FROM public.profiles p
       WHERE public.normalize_email(p.email) = NEW.email
         AND p.auth_user_id <> NEW.auth_user_id
     )
  THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  -- (c) A FINISHED account cannot re-register itself into another portal by
  --     rewriting its own account_type. A pending signup claiming its portal
  --     is exactly what registration does, so that stays allowed.
  --     Administrators and server-side jobs keep working normally.
  IF TG_OP = 'UPDATE'
     AND NEW.account_type IS DISTINCT FROM OLD.account_type
     AND v_caller IS NOT NULL
     AND v_caller = OLD.auth_user_id
     AND OLD.registration_status = 'complete'
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = v_caller AND p.account_type = 'admin'
    ) INTO v_caller_is_admin;

    IF NOT v_caller_is_admin THEN
      RAISE EXCEPTION 'ACCOUNT_TYPE_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
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
-- 9. The auth.users -> profiles trigger normalizes and stays idempotent.
--    Two AFTER INSERT triggers run on auth.users (`auth_user_created` inserts
--    the bare row, `on_auth_user_created` fills in the signup metadata), so
--    this one has to upsert rather than plain-insert. It never touches
--    registration_status, so a new row keeps the pending default.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
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
    500, null, 0
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
-- 10. Only the intentional entry points are reachable from the client.
--     Trigger functions are authorized at CREATE TRIGGER time rather than per
--     row, so revoking these does not affect the triggers above.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.registration_is_complete(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_user_is_established(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_email_rules() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_signup_registration(text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.server_now_ms() FROM public;

GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_signup_email_available() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_registration(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_now_ms() TO anon, authenticated;

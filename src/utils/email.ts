/**
 * One canonical email form for the whole app — registration, login, password
 * reset, email verification and account recovery all run through this, so
 * `User@Example.com`, `user@example.com` and `  user@example.com  ` are the
 * same address everywhere.
 *
 * Keep in lockstep with public.normalize_email() in
 * supabase_global_email_uniqueness.sql.
 */
export const normalizeEmail = (email: string | null | undefined): string =>
  (email ?? '').trim().toLowerCase();

/** The single message every portal shows when an address is already taken. */
export const EMAIL_ALREADY_REGISTERED_MESSAGE =
  'This email is already associated with an existing account. Please use a different email or log in to your existing account.';

/** Heading that goes with EMAIL_ALREADY_REGISTERED_MESSAGE. */
export const EMAIL_ALREADY_REGISTERED_TITLE = 'Email already registered';

/**
 * True for every shape the "address is taken" failure can arrive in: our own
 * server-side guards, Supabase Auth's own duplicate response, and the raw
 * Postgres unique-violation that the database backstop raises when two
 * registrations race each other.
 */
export function isDuplicateEmailError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { message?: string; code?: string; error_description?: string };
  const code = String(err.code ?? '');
  if (code === '23505' || code === 'user_already_exists' || code === 'email_exists') return true;

  const message = `${err.message ?? ''} ${err.error_description ?? ''}`.toLowerCase();
  if (!message.trim()) return false;
  return (
    message.includes('email_already_registered') ||
    // The database guard against re-pointing an existing account at another
    // portal — from the user's side it is the same "you already have an
    // account" situation.
    message.includes('account_type_change_not_allowed') ||
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists') ||
    message.includes('duplicate key') ||
    message.includes('profiles_email_lower_unique_idx')
  );
}

/** Rewrites any duplicate-email failure into the one user-facing message. */
export function toRegistrationErrorMessage(error: unknown, fallback: string): string {
  if (isDuplicateEmailError(error)) return EMAIL_ALREADY_REGISTERED_MESSAGE;
  const message = (error as { message?: string } | null)?.message;
  return message?.trim() ? message : fallback;
}

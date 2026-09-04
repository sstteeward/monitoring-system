/**
 * Signup email-verification code rules.
 *
 * Supabase Auth (GoTrue) owns the code itself: it generates it, stores its hash
 * in `auth.one_time_tokens`, and enforces `UNIQUE (user_id, token_type)` so a
 * user can only ever hold one live code — resending physically replaces the
 * previous one, which is what invalidates it.
 *
 * GoTrue answers a rejected code with a single error, `otp_expired` / "token
 * has expired or is invalid", for BOTH a genuinely expired code and one that is
 * wrong or already consumed. Reporting that verbatim is what made a consumed
 * code look like an expired one. We tell the two apart by comparing two
 * *server* timestamps — the moment the code was issued and the moment it was
 * rejected — so no browser clock, locale, or timezone is involved.
 */

/**
 * How long a code stays valid. Must match the Supabase project's
 * Authentication -> Email OTP expiration setting (600 seconds).
 */
export const OTP_TTL_MINUTES = 10;
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;

export const OTP_SENT_MESSAGE =
  `A 6-digit code was sent to your email. It is valid for ${OTP_TTL_MINUTES} minutes.`;
export const OTP_VERIFIED_MESSAGE = 'Email verified successfully.';
export const OTP_EXPIRED_MESSAGE =
  'Verification code expired. Please request a new code.';
export const OTP_INVALID_MESSAGE =
  'Invalid verification code. Please check the code and try again.';
export const OTP_INCOMPLETE_MESSAGE =
  'Please enter the 6-digit verification code.';

/**
 * Which message a rejected code deserves.
 *
 * Both timestamps are epoch milliseconds read from the database via
 * `server_now_ms()`, so this is pure server-side arithmetic on UTC integers —
 * there is nothing to parse and nothing to convert.
 *
 * With no issue time on record we cannot prove the window elapsed, so the
 * answer is "invalid" — telling someone their code expired when it did not is
 * the failure this whole fix exists to remove.
 */
export function classifyRejectedCode(
  issuedAtMs: number | null | undefined,
  rejectedAtMs: number | null | undefined,
): 'expired' | 'invalid' {
  if (typeof issuedAtMs !== 'number' || typeof rejectedAtMs !== 'number') return 'invalid';
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(rejectedAtMs)) return 'invalid';
  return rejectedAtMs - issuedAtMs > OTP_TTL_MS ? 'expired' : 'invalid';
}

/** The message to show for a rejected code. */
export function rejectedCodeMessage(
  issuedAtMs: number | null | undefined,
  rejectedAtMs: number | null | undefined,
): string {
  return classifyRejectedCode(issuedAtMs, rejectedAtMs) === 'expired'
    ? OTP_EXPIRED_MESSAGE
    : OTP_INVALID_MESSAGE;
}

import React, { useEffect, useRef, useState } from "react";
import { usePasteBlocker } from "../hooks/usePasteBlocker";
import { supabase } from "../lib/supabaseClient";
import { getLoginRouteForAccountType, normalizeAccountType, type AccountType } from "../utils/authRedirect";
import "./AuthSignup.css"; // Reuse auth styles

/** How long the success message stays on screen before the redirect fires. */
const REDIRECT_DELAY_MS = 2500;

/**
 * Reads the account type off the account the recovery token authenticated us as.
 *
 * The reset link opens a short-lived Supabase recovery session, so `auth.getUser()`
 * is the token's own identity — validated server-side — and the `profiles` row is
 * read under RLS for that same user. Nothing here comes from the URL, so appending
 * `?role=admin` to /change-password cannot change where the user is sent.
 */
async function resolveRecoveryAccountType(): Promise<AccountType | null> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('auth_user_id', user.id)
        .single();

    if (error || !data) return null;
    return normalizeAccountType(data.account_type);
}

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="eye-icon">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="eye-icon closed">
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
);

export default function UpdatePasswordView({ onComplete }: { onComplete: (destination: string) => void }) {
    const blockPaste = usePasteBlocker();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDone, setIsDone] = useState(false);

    // Resolved once up front so the destination is known before the password is even
    // submitted; re-resolved at submit time in case the first attempt raced the session.
    const accountTypeRef = useRef<AccountType | null>(null);
    const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        void resolveRecoveryAccountType().then((role) => {
            if (!cancelled) accountTypeRef.current = role;
        });
        return () => {
            cancelled = true;
            if (redirectTimer.current) clearTimeout(redirectTimer.current);
        };
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || isDone) return; // guard against duplicate submissions
        setError(null);
        setMessage(null);

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        try {
            // Resolve the destination while the recovery session is still alive —
            // after sign-out the profile is no longer readable.
            const accountType = accountTypeRef.current ?? await resolveRecoveryAccountType();
            accountTypeRef.current = accountType;

            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            try {
                const { createAuditLog } = await import('../services/auditService');
                await createAuditLog({
                    action: 'PASSWORD_CHANGE',
                    module: 'Authentication',
                    description: 'User successfully updated their password',
                });
            } catch (auditErr) {
                console.warn('Failed to log password change:', auditErr);
            }

            // An unknown role goes to the portal-selection page, never to a guessed portal.
            const destination = getLoginRouteForAccountType(accountType);
            setIsDone(true);
            setMessage("Password updated successfully!");
            redirectTimer.current = setTimeout(async () => {
                // Consume the reset session: the recovery link is single-use on Supabase's
                // side, and signing out drops the session it opened plus the local
                // `is_recovery` flag (cleared by onComplete), so the link cannot be replayed.
                try {
                    await supabase.auth.signOut({ scope: 'global' });
                } catch {
                    try { await supabase.auth.signOut(); } catch { /* already gone */ }
                }
                onComplete(destination);
            }, REDIRECT_DELAY_MS);
        } catch (err: any) {
            // Failed update: stay on the page, no redirect.
            const raw = err?.message || String(err);
            setError(
                /expired|invalid|not authenticated|session/i.test(raw)
                    ? "This password reset link is invalid or has expired. Please request a new one from your portal's login page."
                    : raw
            );
            try {
                const { createAuditLog } = await import('../services/auditService');
                await createAuditLog({
                    action: 'PASSWORD_CHANGE',
                    module: 'Authentication',
                    description: `Failed password update attempt: ${err.message || String(err)}`,
                    status: 'failed'
                });
            } catch {}
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card" style={{ maxWidth: '400px', flexDirection: 'column' }}>
                <div className="auth-form-wrapper" style={{ padding: '2.5rem 2rem', width: '100%', maxWidth: '100%' }}>
                    <div className="card-header" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                        <h2>Update Password</h2>
                        <p className="subtitle" style={{ marginTop: '0.5rem' }}>Enter your new password below.</p>
                    </div>

                    <form className="auth-form" onSubmit={handleUpdate} noValidate>
                        <div className="form-scrollable" style={{ gap: '1.25rem' }}>
                            <label className="full-width">
                                New Password *
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={e => {
                                            setPassword(e.target.value);
                                            setError(null);
                                        }}
                                        onPaste={blockPaste}
                                        placeholder="Min 8 characters"
                                    />
                                    <button 
                                        type="button" 
                                        className="password-toggle-btn" 
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                                    </button>
                                </div>
                            </label>

                            <label className="full-width">
                                Confirm Password *
                                <div className="password-input-wrapper">
                                    <input
                                        type={showConfirm ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={e => {
                                            setConfirmPassword(e.target.value);
                                            setError(null);
                                        }}
                                        onPaste={blockPaste}
                                        placeholder="Min 8 characters"
                                    />
                                    <button 
                                        type="button" 
                                        className="password-toggle-btn" 
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        tabIndex={-1}
                                    >
                                        {showConfirm ? <EyeIcon /> : <EyeOffIcon />}
                                    </button>
                                </div>
                            </label>

                            {error && <div className="error" style={{ textAlign: 'center' }}>{error}</div>}
                            {message && (
                                <div className="info-msg" role="status" aria-live="polite">
                                    <strong>✓ {message}</strong>
                                    {isDone && (
                                        <div style={{ marginTop: '0.35rem', opacity: 0.85 }}>
                                            Redirecting you to your login page...
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="cta-row" style={{ marginTop: '0.5rem' }}>
                                <button className="primary" type="submit" disabled={isSubmitting || isDone}>
                                    {isDone ? "Redirecting..." : isSubmitting ? "Updating password..." : "Update Password"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

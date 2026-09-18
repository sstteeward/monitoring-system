import React, { useMemo, useState } from 'react';
import PasswordField from './PasswordField';
import { validatePassword, passwordRequirementLabels, type PasswordRequirementKey } from '../utils/passwordRules';
import { adminService } from '../services/adminService';

/**
 * Admin-only "set a new password" for another user's account.
 *
 * The actual write is done server-side by the `admin-set-user-password` Edge
 * Function (service role), which re-checks the caller is an admin, refuses
 * admin targets, audits the action and notifies the user. This modal only
 * collects and validates the new password with the shared password rules.
 */

interface Props {
    /** The user whose password is being set; null hides the modal. */
    target: { id: string; name: string } | null;
    onClose: () => void;
    onSuccess?: (name: string) => void;
}

const REQUIREMENT_ORDER: PasswordRequirementKey[] = ['length', 'uppercase', 'lowercase', 'number', 'special', 'match'];

const AdminResetPasswordModal: React.FC<Props> = ({ target, onClose, onSuccess }) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const check = useMemo(() => validatePassword(password, confirm), [password, confirm]);

    if (!target) return null;

    const close = () => {
        if (submitting) return;
        setPassword(''); setConfirm(''); setShowPw(false); setShowConfirm(false);
        setError(null); setDone(false); setSubmitting(false);
        onClose();
    };

    const submit = async () => {
        if (!check.isValid || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            await adminService.setUserPassword(target.id, password);
            setSubmitting(false);
            setDone(true);
            onSuccess?.(target.name);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The password could not be changed.');
            setSubmitting(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1100,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }}
            onMouseDown={e => { if (e.target === e.currentTarget) close(); }}
        >
            <div className="glass-card" style={{
                border: '1px solid var(--border)', borderRadius: 20, padding: '1.75rem',
                width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
                animation: 'fadeIn 0.2s ease',
            }}>
                {done ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 600 }}>Password Updated</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
                            <strong style={{ color: 'var(--text-bright)' }}>{target.name}</strong> can now sign in with the new password. They’ve been signed out of any active sessions and notified.
                        </p>
                        <button
                            onClick={close}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit' }}
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 600 }}>Change Password</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
                            Set a new password for <strong style={{ color: 'var(--text-bright)' }}>{target.name}</strong>. They’ll be signed out everywhere and notified. Share the new password with them securely.
                        </p>

                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>New password</label>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <PasswordField
                                value={password}
                                onChange={setPassword}
                                placeholder="New password"
                                visible={showPw}
                                onVisibilityChange={() => setShowPw(v => !v)}
                            />
                        </div>

                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Confirm password</label>
                        <div style={{ marginBottom: '0.9rem' }}>
                            <PasswordField
                                value={confirm}
                                onChange={setConfirm}
                                placeholder="Confirm password"
                                visible={showConfirm}
                                onVisibilityChange={() => setShowConfirm(v => !v)}
                            />
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.1rem', display: 'grid', gap: '0.25rem' }}>
                            {REQUIREMENT_ORDER.map(key => {
                                const met = check.requirements[key];
                                return (
                                    <li key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: met ? '#22c55e' : 'var(--text-muted)' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: met ? 1 : 0.4 }}>
                                            {met ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="9" />}
                                        </svg>
                                        {passwordRequirementLabels[key]}
                                    </li>
                                );
                            })}
                        </ul>

                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '0.6rem 0.8rem', color: '#ef4444', fontSize: '0.82rem', marginBottom: '1rem' }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={close}
                                disabled={submitting}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={!check.isValid || submitting}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', cursor: (!check.isValid || submitting) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', opacity: (!check.isValid || submitting) ? 0.6 : 1 }}
                            >
                                {submitting ? 'Saving…' : 'Change Password'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminResetPasswordModal;

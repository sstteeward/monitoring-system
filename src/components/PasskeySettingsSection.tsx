import React, { useEffect, useState } from 'react';
import {
    deleteCurrentUserPasskey,
    formatPasskeyError,
    isPasskeySupported,
    listCurrentUserPasskeys,
    registerCurrentUserPasskey,
    type PasskeyRecord,
} from '../services/passkeyAuth';

interface PasskeySettingsSectionProps {
    portalName?: string;
    variant?: 'default' | 'admin';
}

const PasskeyIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="15" r="4" />
        <path d="M10.85 12.15 19 4" />
        <path d="m18 5 2 2" />
        <path d="m15 8 2 2" />
    </svg>
);

export const PasskeySettingsSection: React.FC<PasskeySettingsSectionProps> = ({
    portalName = 'your account',
    variant = 'default',
}) => {
    const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [registering, setRegistering] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const supported = isPasskeySupported();

    const fetchPasskeys = async () => {
        if (!supported) return;
        setLoading(true);
        try {
            const data = await listCurrentUserPasskeys();
            setPasskeys(data || []);
            setError(null);
        } catch (err: unknown) {
            setError(formatPasskeyError(err, 'Unable to load registered passkeys.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchPasskeys();
    }, []);

    const handleRegister = async () => {
        setRegistering(true);
        setError(null);
        setMessage(null);
        try {
            await registerCurrentUserPasskey();
            await fetchPasskeys();
            setMessage('Passkey successfully registered! You can now use it to sign in quickly from any portal.');
        } catch (err: unknown) {
            const formatted = formatPasskeyError(err, 'Passkey registration could not be completed.');
            if (formatted) setError(formatted);
        } finally {
            setRegistering(false);
        }
    };

    const handleDelete = async (passkeyId: string) => {
        if (!window.confirm('Are you sure you want to remove this passkey from your account?')) return;
        setBusyId(passkeyId);
        setError(null);
        setMessage(null);
        try {
            await deleteCurrentUserPasskey(passkeyId);
            await fetchPasskeys();
            setMessage('Passkey has been revoked.');
        } catch (err: unknown) {
            const formatted = formatPasskeyError(err, 'Unable to remove passkey.');
            if (formatted) setError(formatted);
        } finally {
            setBusyId(null);
        }
    };

    const isAdmin = variant === 'admin';
    const primaryBtnClass = isAdmin ? 'role-select' : 'btn btn-primary';
    const secondaryBtnClass = isAdmin ? 'role-select' : 'btn btn-secondary';
    const primaryBtnStyle: React.CSSProperties = isAdmin
        ? { background: 'var(--admin-primary, #6366f1)', color: '#fff', border: 'none', padding: '0.65rem 1.2rem', borderRadius: 10, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }
        : { display: 'inline-flex', alignItems: 'center', gap: '0.5rem' };

    return (
        <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <PasskeyIcon />
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-bright, var(--admin-text-primary, #fff))' }}>
                    Passkeys (WebAuthn)
                </h4>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted, var(--admin-text-secondary, #94a3b8))', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Passkeys use your device’s native authentication (Windows Hello, Touch ID, Face ID, Android Biometrics, device PIN, or security key) to sign in securely to {portalName} without typing your password.
            </p>

            {!supported && (
                <div style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem 1rem', borderRadius: 10, fontSize: '0.84rem', marginBottom: '1rem' }}>
                    Passkeys are not supported on this browser or connection. Make sure you are using a secure connection (HTTPS or localhost) and a modern browser.
                </div>
            )}

            {message && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', padding: '0.65rem 1rem', borderRadius: 10, fontSize: '0.84rem', marginBottom: '1rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>{message}</span>
                </div>
            )}

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '0.65rem 1rem', borderRadius: 10, fontSize: '0.84rem', marginBottom: '1rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    <span>{error}</span>
                </div>
            )}

            {supported && (
                <>
                    {loading && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '0.75rem' }}>
                            Loading registered passkeys…
                        </div>
                    )}

                    {passkeys.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
                            {passkeys.map(pk => {
                                const isBusy = busyId === pk.id;
                                const createdStr = pk.created_at ? new Date(pk.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;
                                const usedStr = pk.last_used_at ? new Date(pk.last_used_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

                                return (
                                    <div
                                        key={pk.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            border: '1px solid var(--border, rgba(255,255,255,0.08))',
                                            borderRadius: 10,
                                            background: 'var(--bg-elevated, var(--admin-card-bg, rgba(255,255,255,0.03)))',
                                        }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-bright, var(--admin-text-primary, #fff))', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <PasskeyIcon />
                                                <span>{pk.friendly_name || 'Passkey Device'}</span>
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, var(--admin-text-secondary, #94a3b8))', marginTop: '0.2rem', display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                                                {createdStr && <span>Added on {createdStr}</span>}
                                                <span>•</span>
                                                <span>{usedStr ? `Last used on ${usedStr}` : 'Never used yet'}</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={secondaryBtnClass}
                                            disabled={isBusy || registering}
                                            onClick={() => void handleDelete(pk.id)}
                                            style={isAdmin ? { padding: '0.4rem 0.8rem', fontSize: '0.8rem' } : undefined}
                                        >
                                            {isBusy ? 'Revoking…' : 'Revoke'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        !loading && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted, var(--admin-text-secondary, #94a3b8))', marginBottom: '1rem', fontStyle: 'italic' }}>
                                No passkeys registered yet for this account.
                            </div>
                        )
                    )}

                    <div>
                        <button
                            type="button"
                            className={primaryBtnClass}
                            style={primaryBtnStyle}
                            disabled={!supported || registering || !!busyId}
                            onClick={() => void handleRegister()}
                        >
                            <PasskeyIcon />
                            <span>{registering ? 'Waiting for device…' : 'Add Passkey'}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default PasskeySettingsSection;

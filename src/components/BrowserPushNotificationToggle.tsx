import { useEffect, useState, type CSSProperties } from 'react';
import { pushNotificationService, type PushNotificationStatus } from '../services/pushNotificationService';

interface BrowserPushNotificationToggleProps {
    rowStyle: CSSProperties;
    description: string;
}

const buttonStyle = (enabled: boolean, disabled: boolean): CSSProperties => ({
    width: 44,
    height: 24,
    border: 0,
    borderRadius: 12,
    background: enabled ? '#10b981' : 'var(--border-strong)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    position: 'relative',
    transition: 'background .2s',
    flexShrink: 0,
});

export default function BrowserPushNotificationToggle({ rowStyle, description }: BrowserPushNotificationToggleProps) {
    const [status, setStatus] = useState<PushNotificationStatus | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshStatus = async () => {
        try {
            setStatus(await pushNotificationService.getStatus());
        } catch (err) {
            console.error('Unable to read browser notification status:', err);
            setError('Unable to read your browser notification setting.');
        }
    };

    useEffect(() => {
        void refreshStatus();
    }, []);

    const handleToggle = async () => {
        if (!status || isSaving || !status.supported || !status.configured || status.permission === 'denied') return;

        setIsSaving(true);
        setError(null);
        try {
            if (status.enabled) {
                await pushNotificationService.disable();
            } else {
                await pushNotificationService.enable();
            }
            await refreshStatus();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unable to update browser alerts.');
        } finally {
            setIsSaving(false);
        }
    };

    const disabled = !status || isSaving || !status.supported || !status.configured || status.permission === 'denied';
    const detail = !status?.supported
        ? 'This browser does not support push notifications.'
        : !status.configured
            ? 'Browser alerts are not configured yet.'
            : status.permission === 'denied'
                ? 'Notifications are blocked in your browser settings.'
                : description;

    return (
        <div style={rowStyle}>
            <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-bright)', marginBottom: '0.2rem' }}>Browser Alerts</div>
                <div style={{ fontSize: '0.78rem', color: error ? '#f87171' : 'var(--text-muted)' }}>{error ?? detail}</div>
            </div>
            <button
                type="button"
                aria-label={status?.enabled ? 'Disable browser alerts' : 'Enable browser alerts'}
                aria-pressed={Boolean(status?.enabled)}
                disabled={disabled}
                onClick={() => void handleToggle()}
                style={buttonStyle(Boolean(status?.enabled), disabled)}
            >
                <span style={{ position: 'absolute', top: 3, left: status?.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </button>
        </div>
    );
}

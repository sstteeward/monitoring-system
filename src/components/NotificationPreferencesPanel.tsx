import React, { useState } from 'react';
import { useNotifications } from '../contexts/NotificationsContext';
import type { NotificationPreferences } from '../services/notificationService';
import BrowserPushNotificationToggle from './BrowserPushNotificationToggle';
import './Notifications.css';

/**
 * Notification preferences, shared by every portal's Settings → Notifications
 * tab. Saved per user in `notification_preferences`, which the email Edge
 * Function consults before it sends anything.
 */

interface NotificationPreferencesPanelProps {
    /** Row layout supplied by the host settings page, so spacing stays consistent. */
    rowStyle?: React.CSSProperties;
    /** Copy tailored to the portal, e.g. what "assignments" means for this role. */
    assignmentsDescription?: string;
}

const CATEGORIES: {
    key: keyof Omit<NotificationPreferences, 'user_id' | 'in_app_enabled' | 'email_enabled'>;
    label: string;
    description: string;
}[] = [
    { key: 'email_announcements', label: 'Announcements', description: 'School and company announcements addressed to you.' },
    { key: 'email_journal', label: 'Journal updates', description: 'Approvals, rejections and revision requests.' },
    { key: 'email_attendance', label: 'Attendance updates', description: 'Attendance records, corrections and alerts.' },
    { key: 'email_assignments', label: 'Assignments', description: 'Section, adviser and company assignments.' },
    { key: 'email_system', label: 'Other updates', description: 'Reminders and general account activity.' },
];

const Switch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; label: string }> = ({
    checked, onChange, disabled, label,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`ntf-switch${checked ? ' on' : ''}`}
    >
        <span className="ntf-switch-knob" />
    </button>
);

const NotificationPreferencesPanel: React.FC<NotificationPreferencesPanelProps> = ({
    rowStyle,
    assignmentsDescription,
}) => {
    const notifications = useNotifications();
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!notifications) return null;

    const { preferences, savePreferences } = notifications;

    if (!preferences) {
        return <div className="ntf-prefs-loading">Loading your notification preferences…</div>;
    }

    const update = async (patch: Partial<Omit<NotificationPreferences, 'user_id'>>, key: string) => {
        setSaving(key);
        setError(null);
        try {
            await savePreferences(patch);
        } catch {
            setError('We could not save that preference. Please try again.');
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="ntf-prefs">
            <div className="ntf-prefs-row" style={rowStyle}>
                <div className="ntf-prefs-text">
                    <div className="ntf-prefs-label">In-app notifications</div>
                    <div className="ntf-prefs-desc">
                        Show the bell badge and pop-ups while you are signed in.
                    </div>
                </div>
                <Switch
                    label="In-app notifications"
                    checked={preferences.in_app_enabled}
                    disabled={saving === 'in_app'}
                    onChange={() => void update({ in_app_enabled: !preferences.in_app_enabled }, 'in_app')}
                />
            </div>

            <div className="ntf-prefs-row" style={rowStyle}>
                <div className="ntf-prefs-text">
                    <div className="ntf-prefs-label">Email notifications</div>
                    <div className="ntf-prefs-desc">
                        Send important updates to your registered email address.
                    </div>
                </div>
                <Switch
                    label="Email notifications"
                    checked={preferences.email_enabled}
                    disabled={saving === 'email'}
                    onChange={() => void update({ email_enabled: !preferences.email_enabled }, 'email')}
                />
            </div>

            <fieldset className="ntf-prefs-group" disabled={!preferences.email_enabled}>
                <legend className="ntf-prefs-legend">Email categories</legend>
                {CATEGORIES.map(category => (
                    <label key={category.key} className="ntf-prefs-check">
                        <input
                            type="checkbox"
                            checked={preferences[category.key]}
                            disabled={!preferences.email_enabled || saving === category.key}
                            onChange={() => void update({ [category.key]: !preferences[category.key] }, category.key)}
                        />
                        <span>
                            <span className="ntf-prefs-label">{category.label}</span>
                            <span className="ntf-prefs-desc">
                                {category.key === 'email_assignments' && assignmentsDescription
                                    ? assignmentsDescription
                                    : category.description}
                            </span>
                        </span>
                    </label>
                ))}
                <p className="ntf-prefs-note">
                    Security and account notices are always emailed, even when other categories are off.
                </p>
            </fieldset>

            <BrowserPushNotificationToggle
                rowStyle={rowStyle ?? {}}
                description="Receive alerts even when the SIL website is closed."
            />

            {error && <div className="ntf-prefs-error">{error}</div>}
        </div>
    );
};

export default NotificationPreferencesPanel;

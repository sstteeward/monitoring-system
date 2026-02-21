import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../contexts/ThemeContext';
import './SettingsView.css';

const SettingsView: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const [emailNotifs, setEmailNotifs] = useState(true);
    const [browserAlerts, setBrowserAlerts] = useState(false);

    const handleThemeChange = (newTheme: 'system' | 'dark' | 'light') => {
        setTheme(newTheme);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="settings-view">
            <div className="settings-header">
                <h2>Application Settings</h2>
                <p className="settings-subtitle">Manage your local application preferences and account status.</p>
            </div>

            <div className="settings-content">
                {/* Appearance Section */}
                <div className="settings-card">
                    <div className="card-header">
                        <div className="card-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                        </div>
                        <h3>Appearance</h3>
                    </div>

                    <div className="settings-group">
                        <div className="setting-item">
                            <div className="setting-info">
                                <h4>Theme Preference</h4>
                                <p>Select how the application looks. (Currently optimized for Dark Mode)</p>
                            </div>
                            <div className="theme-toggle-group">
                                <button
                                    className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                                    onClick={() => handleThemeChange('light')}
                                >
                                    Light
                                </button>
                                <button
                                    className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                                    onClick={() => handleThemeChange('dark')}
                                >
                                    Dark
                                </button>
                                <button
                                    className={`theme-btn ${theme === 'system' ? 'active' : ''}`}
                                    onClick={() => handleThemeChange('system')}
                                >
                                    System
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notifications Section */}
                <div className="settings-card">
                    <div className="card-header">
                        <div className="card-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        </div>
                        <h3>Notifications</h3>
                    </div>

                    <div className="settings-group">
                        <div className="setting-item">
                            <div className="setting-info">
                                <h4>Email Notifications</h4>
                                <p>Receive weekly summary reports of your SIL hours directly to your inbox.</p>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={emailNotifs}
                                    onChange={(e) => setEmailNotifs(e.target.checked)}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>

                        <div className="setting-item">
                            <div className="setting-info">
                                <h4>Browser Alerts</h4>
                                <p>Get desktop notifications when you forget to clock out after 8 hours.</p>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={browserAlerts}
                                    onChange={(e) => setBrowserAlerts(e.target.checked)}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="settings-card danger-zone">
                    <div className="card-header danger-text">
                        <div className="card-icon danger-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        </div>
                        <h3>Danger Zone</h3>
                    </div>

                    <div className="settings-group">
                        <div className="setting-item">
                            <div className="setting-info">
                                <h4>Sign Out</h4>
                                <p>End your current session on this device.</p>
                            </div>
                            <button className="btn btn-secondary action-btn" onClick={handleSignOut}>
                                Sign Out
                            </button>
                        </div>

                        <div className="setting-item">
                            <div className="setting-info">
                                <h4>Delete Account</h4>
                                <p>Permanently remove your account and all associated timesheet data. This action cannot be undone.</p>
                            </div>
                            <button className="btn btn-danger action-btn">
                                Delete Account
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SettingsView;

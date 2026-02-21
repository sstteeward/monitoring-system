import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import './ProfileView.css';

const ProfileView: React.FC = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        required_ojt_hours: 500,
        grade: '',
        absences: 0
    });

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const data = await profileService.getCurrentProfile();
            if (data) {
                setProfile(data);
                setFormData({
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    required_ojt_hours: data.required_ojt_hours || 500,
                    grade: data.grade || '',
                    absences: data.absences || 0
                });
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
            setMessage({ type: 'error', text: 'Failed to load profile data.' });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
        // Clear success message when editing starts again
        if (message?.type === 'success') setMessage(null);
    };

    const handleInputBlur = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Enforce basic constraints on blur for number fields to prevent weird UI artifacts
        if (e.target.name === 'required_ojt_hours' && Number(e.target.value) < 0) {
            setFormData(prev => ({ ...prev, required_ojt_hours: 0 }));
        }
        if (e.target.name === 'absences' && Number(e.target.value) < 0) {
            setFormData(prev => ({ ...prev, absences: 0 }));
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setSaving(true);
        try {
            await profileService.updateProfile({
                first_name: formData.first_name,
                last_name: formData.last_name,
                required_ojt_hours: formData.required_ojt_hours,
                grade: formData.grade,
                absences: formData.absences
            });
            setMessage({ type: 'success', text: 'Profile updated successfully.' });
            // Re-fetch to ensure sync
            await loadProfile();
        } catch (error: any) {
            console.error('Error saving profile:', error);
            setMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
        } finally {
            setSaving(false);

            // Auto hide success message
            setTimeout(() => {
                setMessage(null);
            }, 3000);
        }
    };

    if (loading) {
        return <div className="profile-view-loading">Loading configuration...</div>;
    }

    if (!profile) {
        return <div className="profile-view-error">Profile not found. Please contact an administrator.</div>;
    }

    return (
        <div className="profile-view">
            <div className="profile-header">
                <h2>Account Profile</h2>
                <p className="profile-subtitle">Manage your personal information and academic tracking metrics.</p>
            </div>

            <div className="profile-content">
                <div className="profile-card readonly-section">
                    <h3>Account Info</h3>
                    <p className="section-desc">These values are bound to your user credential and cannot be edited directly here.</p>

                    <div className="readonly-grid">
                        <div className="readonly-field">
                            <span className="readonly-label">Email Address</span>
                            <span className="readonly-value">{profile.email}</span>
                        </div>
                        <div className="readonly-field">
                            <span className="readonly-label">Account Type</span>
                            <span className="readonly-value capitalize">{profile.account_type}</span>
                        </div>
                    </div>
                </div>

                <div className="profile-card editable-section">
                    <form onSubmit={handleSubmit}>
                        <h3>Personal Details</h3>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="first_name">First Name</label>
                                <input
                                    type="text"
                                    id="first_name"
                                    name="first_name"
                                    className="form-input"
                                    value={formData.first_name}
                                    onChange={handleInputChange}
                                    placeholder="Enter your first name"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="last_name">Last Name</label>
                                <input
                                    type="text"
                                    id="last_name"
                                    name="last_name"
                                    className="form-input"
                                    value={formData.last_name}
                                    onChange={handleInputChange}
                                    placeholder="Enter your last name"
                                />
                            </div>
                        </div>

                        <h3 className="mt-4">Academic Tracking Metrics</h3>
                        <p className="section-desc">These metrics are used to calculate your progress on the Reports dashboard.</p>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="required_ojt_hours">Required OJT Hours</label>
                                <input
                                    type="number"
                                    id="required_ojt_hours"
                                    name="required_ojt_hours"
                                    className="form-input"
                                    value={formData.required_ojt_hours}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    min="0"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="grade">Current Grade (Optional)</label>
                                <input
                                    type="text"
                                    id="grade"
                                    name="grade"
                                    className="form-input"
                                    value={formData.grade}
                                    onChange={handleInputChange}
                                    placeholder="e.g. 1.25, A"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="absences">Total Absences</label>
                                <input
                                    type="number"
                                    id="absences"
                                    name="absences"
                                    className="form-input"
                                    value={formData.absences}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    min="0"
                                />
                            </div>
                        </div>

                        <div className="form-actions">
                            {message && (
                                <div className={`form-message message-${message.type}`}>
                                    {message.type === 'success' ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    )}
                                    {message.text}
                                </div>
                            )}

                            <button type="submit" className="btn btn-primary submit-btn" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Profile Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ProfileView;

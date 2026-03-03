import React, { useState, useEffect } from 'react';
import { journalService } from '../services/journalService';
import { FormSkeleton } from './Skeletons';
import './JournalView.css';

const JournalView: React.FC = () => {
    const [tasks, setTasks] = useState('');
    const [learnings, setLearnings] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [photos, setPhotos] = useState<File[]>([]);
    const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    useEffect(() => {
        loadJournal();
    }, [date]);

    const loadJournal = async () => {
        try {
            setLoading(true);
            const journal = await journalService.getJournalForDate(date);
            setTasks(journal?.tasks || '');
            setLearnings(journal?.learnings || '');
            setExistingPhotoUrls(journal?.photo_urls || []);
            setPhotos([]);
            setMessage(null);
        } catch (err) {
            console.error('Error loading journal:', err);
            setMessage({ type: 'error', text: 'Failed to load journal entry.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!tasks.trim() && !learnings.trim()) {
            setMessage({ type: 'error', text: 'Please enter either tasks or learnings before saving.' });
            return;
        }

        try {
            setSaving(true);
            let finalPhotoUrls = [...existingPhotoUrls];

            if (photos.length > 0) {
                setUploading(true);
                const uploadedUrls = await journalService.uploadJournalPhotos(photos);
                finalPhotoUrls = [...finalPhotoUrls, ...uploadedUrls];
            }

            await journalService.upsertJournal(tasks, learnings, date, finalPhotoUrls.length > 0 ? finalPhotoUrls : undefined);
            setMessage({ type: 'success', text: 'Journal entry saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            console.error('Error saving journal:', err);
            setMessage({ type: 'error', text: err.message || 'Failed to save journal entry.' });
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            const validFiles = newFiles.filter(file => {
                if (!file.type.startsWith('image/')) {
                    setMessage({ type: 'error', text: 'Please select valid image files.' });
                    return false;
                }
                if (file.size > 5 * 1024 * 1024) { // 5MB limit
                    setMessage({ type: 'error', text: 'Each image must be less than 5MB.' });
                    return false;
                }
                return true;
            });

            if (validFiles.length > 0) {
                setPhotos(prev => [...prev, ...validFiles]);
            }
        }
        // clear input value so same files can be selected again
        e.target.value = '';
    };

    const removeExistingPhoto = (index: number) => {
        setExistingPhotoUrls(prev => prev.filter((_, i) => i !== index));
    };

    const removeNewPhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const isToday = date === new Date().toISOString().split('T')[0];

    return (
        <div className="journal-container">
            <div className="journal-header">
                <div>
                    <h2 className="journal-title">Daily Journal</h2>
                    <p className="journal-subtitle">Document your daily activities and progress</p>
                </div>
                <div className="journal-date-selector">
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="journal-date-input"
                        max={new Date().toISOString().split('T')[0]}
                    />
                    {isToday && <span className="today-badge">Today</span>}
                </div>
            </div>

            <div className="journal-content-card">
                <div className="journal-editor-header">
                    <span className="editor-label">Activity Log for {new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    {message && <span className={`journal-message ${message.type}`}>{message.text}</span>}
                </div>

                {loading ? (
                    <div style={{ padding: '2rem' }}>
                        <FormSkeleton />
                    </div>
                ) : (
                    <div className="journal-sections">
                        <div className="journal-section">
                            <label className="section-title">Tasks (what you work)</label>
                            <div className="journal-textarea-wrapper">
                                <textarea
                                    className="journal-textarea"
                                    placeholder="What specific tasks did you accomplish today?"
                                    value={tasks}
                                    onChange={(e) => setTasks(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="journal-section">
                            <label className="section-title">Learnings (what have you learn today?)</label>
                            <div className="journal-textarea-wrapper">
                                <textarea
                                    className="journal-textarea"
                                    placeholder="What new things did you learn today? Any challenges or insights?"
                                    value={learnings}
                                    onChange={(e) => setLearnings(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="journal-section">
                            <label className="section-title">Snap of the Day</label>
                            <div className="journal-photo-upload">
                                {existingPhotoUrls.length === 0 && photos.length === 0 ? (
                                    <label className="photo-upload-label">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handlePhotoChange}
                                            disabled={loading || saving}
                                            style={{ display: 'none' }}
                                        />
                                        <div className="upload-placeholder">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                            <span>Click to upload photos (Max 5MB each)</span>
                                        </div>
                                    </label>
                                ) : (
                                    <div className="photo-preview-grid">
                                        {existingPhotoUrls.map((url, index) => (
                                            <div key={`existing-${index}`} className="photo-preview-container">
                                                <img src={url} alt={`Journal attachment ${index + 1}`} className="photo-preview" onClick={() => setLightboxUrl(url)} />
                                                <button className="remove-photo-btn" onClick={() => removeExistingPhoto(index)} disabled={loading || saving}>×</button>
                                            </div>
                                        ))}
                                        {photos.map((file, index) => (
                                            <div key={`new-${index}`} className="photo-preview-container">
                                                <img src={URL.createObjectURL(file)} alt={`New attachment ${index + 1}`} className="photo-preview" onClick={() => setLightboxUrl(URL.createObjectURL(file))} />
                                                <button className="remove-photo-btn" onClick={() => removeNewPhoto(index)} disabled={loading || saving}>×</button>
                                            </div>
                                        ))}
                                        <label className="compact-upload-label" title="Add more photos">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                onChange={handlePhotoChange}
                                                disabled={loading || saving}
                                                style={{ display: 'none' }}
                                            />
                                            <div className="compact-upload-box">
                                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                            </div>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="journal-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading || saving || uploading}
                    >
                        {saving || uploading ? 'Saving...' : 'Save Journal'}
                    </button>
                    {!isToday && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => setDate(new Date().toISOString().split('T')[0])}
                        >
                            Return to Today
                        </button>
                    )}
                </div>
            </div>

            <div className="journal-tips">
                <div className="tip-card">
                    <span className="tip-icon">💡</span>
                    <div className="tip-content">
                        <strong>Pro-tip:</strong> Be as detailed as possible. Mention specific tasks completed, meetings attended, and any issues you've resolved. This helps track your growth!
                    </div>
                </div>
            </div>

            {lightboxUrl && (
                <div className="preview-modal-overlay" onClick={() => setLightboxUrl(null)}>
                    <div className="preview-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="preview-modal-header">
                            <h3 className="preview-modal-title">Photo Preview</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" style={{ padding: '0.4rem', color: '#ef4444' }} onClick={() => setLightboxUrl(null)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>
                        </div>
                        <div className="preview-modal-body">
                            <img src={lightboxUrl} alt="Photo Preview" className="preview-image" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JournalView;

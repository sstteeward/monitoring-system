import React, { useState, useEffect } from 'react';
import { journalService, type DailyJournal } from '../services/journalService';
import './JournalView.css';

const DEFAULT_FEEDBACK = [
    "Great detail on the tasks. For the next entries, please focus more on the 'why' behind the technical decisions.",
    "Good progress today! Make sure to take breaks and document any blockers you encounter.",
    "Excellent reflection! Your learnings show a deep understanding of the concepts.",
    "Solid update. Keep up the good work and don't hesitate to ask for help if needed.",
    "Your progress is consistent and well-documented. Consider adding code snippets next time for clarity."
];

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
    const [isEditing, setIsEditing] = useState(false);
    const [allJournals, setAllJournals] = useState<DailyJournal[]>([]);
    const [loadingJournals, setLoadingJournals] = useState(true);
    const [feedback, setFeedback] = useState("Submit a new journal entry today to receive automatic feedback from your supervisor.");
    const [calendarDate, setCalendarDate] = useState(new Date());

    useEffect(() => {
        loadAllJournals();
    }, []);

    const loadAllJournals = async () => {
        try {
            setLoadingJournals(true);
            const data = await journalService.getJournals();
            setAllJournals(data);
            if (data.length > 0) {
                setFeedback(DEFAULT_FEEDBACK[0]); // Initially set the first generic feedback if there are journals
            }
        } catch (err) {
            console.error('Error loading all journals:', err);
        } finally {
            setLoadingJournals(false);
        }
    };

    const loadJournalForDate = async (targetDate: string) => {
        try {
            setLoading(true);
            const journal = await journalService.getJournalForDate(targetDate);
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

    const handleNewEntry = () => {
        const today = new Date().toISOString().split('T')[0];
        setDate(today);
        setTasks('');
        setLearnings('');
        setExistingPhotoUrls([]);
        setPhotos([]);
        setMessage(null);
        setIsEditing(true);
        loadJournalForDate(today);
    };

    const handleEditEntry = (j: DailyJournal) => {
        setDate(j.entry_date);
        setTasks(j.tasks || '');
        setLearnings(j.learnings || '');
        setExistingPhotoUrls(j.photo_urls || []);
        setPhotos([]);
        setMessage(null);
        setIsEditing(true);
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
            loadAllJournals();

            // Generate automatic feedback after saving
            setTimeout(() => {
                const randomIdx = Math.floor(Math.random() * (DEFAULT_FEEDBACK.length - 1)) + 1;
                setFeedback(DEFAULT_FEEDBACK[randomIdx]);
            }, 1000);

            setTimeout(() => {
                setMessage(null);
                setIsEditing(false);
            }, 1500);
        } catch (err: any) {
            console.error('Error saving journal:', err);
            setMessage({ type: 'error', text: err.message || 'Failed to save journal entry.' });
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };



    // Helper to derive a title if tasks exist
    const getCardTitle = (j: DailyJournal) => {
        if (j.tasks) {
            const lines = j.tasks.split('\n').filter(l => l.trim().length > 0);
            if (lines.length > 0) {
                const text = lines[0].trim();
                return text.length > 40 ? text.substring(0, 40) + '...' : text;
            }
        }
        return "Daily Entry";
    };

    // Helper to extract a snippet 
    const getCardSnippet = (j: DailyJournal) => {
        const text = j.tasks || j.learnings || '';
        if (!text) return 'No content provided.';
        const noNewlines = text.replace(/\n/g, ' ');
        return noNewlines.length > 100 ? noNewlines.substring(0, 100) + '...' : noNewlines;
    };

    const handlePrevMonth = () => {
        setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            const validFiles = newFiles.filter(file => {
                if (!file.type.startsWith('image/')) {
                    setMessage({ type: 'error', text: 'Please select valid image files.' });
                    return false;
                }
                if (file.size > 5 * 1024 * 1024) {
                    setMessage({ type: 'error', text: 'Each image must be less than 5MB.' });
                    return false;
                }
                return true;
            });

            if (validFiles.length > 0) {
                setPhotos(prev => [...prev, ...validFiles]);
            }
        }
        e.target.value = '';
    };

    const removeExistingPhoto = (index: number) => {
        setExistingPhotoUrls(prev => prev.filter((_, i) => i !== index));
    };

    const removeNewPhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const renderCalendar = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const dates = [];

        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            dates.push({ d: daysInPrevMonth - i, m: true });
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const hasEntry = allJournals.some(j => j.entry_date === dateStr);
            const isActive = date === dateStr;
            dates.push({ d: i, m: false, a: isActive, hasEntry, dateStr });
        }
        
        const totalCells = dates.length;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
            for (let i = 1; i <= 7 - remainder; i++) {
                dates.push({ d: i, m: true });
            }
        }

        const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

        return (
            <div className="calendar-grid">
                {days.map(d => <div key={d} className="cal-day-name">{d}</div>)}
                {dates.map((item, idx) => (
                    <div 
                        key={idx} 
                        className={`cal-date ${item.m ? 'muted' : ''} ${item.a ? 'active' : ''}`}
                        title={item.dateStr}
                        onClick={() => {
                            if (!item.m && item.dateStr) {
                                setDate(item.dateStr);
                                const entry = allJournals.find(j => j.entry_date === item.dateStr);
                                if (entry) {
                                    // Ensure photo_urls array is properly parsed if it's stored as JSON
                                    if (entry.photo_urls) {
                                        try {
                                            const parsedPhotos = typeof entry.photo_urls === 'string' ? JSON.parse(entry.photo_urls as string) : entry.photo_urls;
                                            setExistingPhotoUrls(Array.isArray(parsedPhotos) ? parsedPhotos : []);
                                        } catch (e) {
                                            setExistingPhotoUrls([]);
                                        }
                                    } else {
                                        setExistingPhotoUrls([]);
                                    }
                                    handleEditEntry(entry);
                                }
                            }
                        }}
                    >
                        {item.d}
                    </div>
                ))}
            </div>
        );
    };


    return (
        <div className="journal-container">
            {/* Header */}
            <div className="journal-header">
                <div>
                    <h2 className="journal-title">Daily Journal</h2>
                    <p className="journal-subtitle">Document your daily progress and professional growth.</p>
                </div>
                <div className="journal-header-actions">
                    <button className="btn-filter">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                        Filter
                    </button>
                    <button className="btn-new-entry" onClick={handleNewEntry}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        New Entry
                    </button>
                </div>
            </div>

            <div className="journal-main-grid">
                {/* Left Column - History */}
                <div className="journal-history-section">
                    <div className="journal-history-header">
                        <div className="history-title-group">
                            <h3>Journal History</h3>
                            <span className="badge-count">{allJournals.length} ENTRIES</span>
                        </div>
                    </div>

                    <div className="journal-card-list">
                        {loadingJournals ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading history...</div>
                        ) : allJournals.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No entries found.</div>
                        ) : (
                            allJournals.map((j, index) => {
                                const d = new Date(j.entry_date);
                                const month = d.toLocaleDateString('en-US', { month: 'short' });
                                const day = d.getDate();

                                return (
                                    <div key={j.id} className="journal-card" onClick={() => handleEditEntry(j)}>
                                        <div className="card-date-box">
                                            <span className="date-month">{month}</span>
                                            <span className="date-day">{day}</span>
                                        </div>
                                        <div className="card-content">
                                            <div className="card-header">
                                                <div className="card-title-area">
                                                    <h4 className="card-title">{getCardTitle(j)}</h4>
                                                    <span className="card-time">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                        09:00 AM - 05:30 PM
                                                    </span>
                                                </div>
                                                <div className="card-actions">
                                                    <div className="card-icons">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                        {j.photo_urls && j.photo_urls.length > 0 && (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="card-snippet">
                                                {getCardSnippet(j)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}


                    </div>
                </div>

                {/* Right Column - Widgets */}
                <div className="journal-widgets">
                    {/* Calendar Card */}
                    <div className="widget-card">
                        <div className="widget-title-area">
                            <h4 className="widget-title">
                                Journal Calendar 
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                                    {calendarDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                </span>
                            </h4>
                            <div className="cal-nav">
                                <svg onClick={handlePrevMonth} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                                <svg onClick={handleNextMonth} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                            </div>
                        </div>
                        {renderCalendar()}
                        <div className="completion-rate">
                            <div className="completion-header">
                                <span className="rate-label">COMPLETION RATE</span>
                                <span className="rate-value">{Math.min(100, Math.round((allJournals.length / 30) * 100))}%</span>
                            </div>
                            <div className="progress-bar-bg">
                                <div className="progress-bar-fill" style={{ width: `${Math.min(100, Math.round((allJournals.length / 30) * 100))}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Insights Card */}
                    <div className="widget-card">
                        <h4 className="widget-title" style={{ marginBottom: '1.5rem' }}>
                            <svg fill="none" stroke="#22c55e" strokeWidth="2" width="20" height="20" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M19 9l-5 5-4-4-3 3" /></svg>
                            Journal Insights
                        </h4>
                        <div className="insight-stat">
                            <div className="stat-icon time">
                                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Total Hours</span>
                                <span className="stat-value">184.5 <span className="stat-sub">/ 480</span></span>
                            </div>
                        </div>
                        <div className="insight-stat">
                            <div className="stat-icon verify">
                                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                            </div>
                            <div className="stat-content">
                                <span className="stat-label">Accepted Entries</span>
                                <span className="stat-value">21 <span className="stat-sub">verified</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Feedback Card */}
                    <div className="widget-card feedback-card">
                        <div className="feedback-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            Latest Feedback
                        </div>
                        <p className="feedback-quote">"{feedback}"</p>
                        <div className="feedback-author">
                            <div className="author-avatar" style={{ background: '#3b82f6' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16.01" /><line x1="16" y1="16" x2="16" y2="16.01" /></svg>
                            </div>
                            <span className="author-name">Automated Feedback</span>
                        </div>
                    </div>

                </div>
            </div>

            {/* Floating Action Button */}
            <button className="fab-new-entry" onClick={handleNewEntry}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>


            {/* Editor Modal Overlay */}
            {isEditing && (
                <div className="journal-modal-overlay" onClick={() => setIsEditing(false)}>
                    <div className="journal-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="journal-modal-header">
                            <h3>{new Date(date).toISOString().split('T')[0] === new Date().toISOString().split('T')[0] ? 'New Entry for Today' : `Editing Entry: ${date}`}</h3>
                            <button className="journal-modal-close" onClick={() => setIsEditing(false)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <div className="journal-sections">
                            {message && <div style={{ color: message.type === 'success' ? '#34d399' : '#ef4444', fontWeight: 'bold' }}>{message.text}</div>}
                            <div className="journal-section">
                                <label className="section-title">Tasks completed</label>
                                <div className="journal-textarea-wrapper">
                                    <textarea
                                        className="journal-textarea"
                                        placeholder="What specific tasks did you accomplish today?"
                                        value={tasks}
                                        onChange={(e) => setTasks(e.target.value)}
                                        disabled={loading || saving}
                                    />
                                </div>
                            </div>
                            <div className="journal-section">
                                <label className="section-title">Learnings & Insights</label>
                                <div className="journal-textarea-wrapper">
                                    <textarea
                                        className="journal-textarea"
                                        value={learnings}
                                        onChange={(e) => setLearnings(e.target.value)}
                                        placeholder="What did you learn today?"
                                        disabled={loading || saving}
                                    />
                                </div>
                            </div>

                            <div className="journal-section">
                                <label className="section-title">Photos</label>
                                <div className="photo-upload-container">
                                    <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                        Upload Photos
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            multiple 
                                            onChange={handlePhotoChange} 
                                            style={{ display: 'none' }} 
                                        />
                                    </label>
                                    
                                    {(existingPhotoUrls.length > 0 || photos.length > 0) && (
                                        <div className="photos-preview" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                            {existingPhotoUrls.map((url, index) => (
                                                <div key={`existing-${index}`} style={{ position: 'relative' }}>
                                                    <img 
                                                        src={url} 
                                                        alt={`Existing ${index + 1}`} 
                                                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155', cursor: 'pointer' }} 
                                                        onClick={() => setLightboxUrl(url)}
                                                    />
                                                    <button 
                                                        onClick={() => removeExistingPhoto(index)}
                                                        style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                                    >×</button>
                                                </div>
                                            ))}
                                            {photos.map((file, index) => (
                                                <div key={`new-${index}`} style={{ position: 'relative' }}>
                                                    <img 
                                                        src={URL.createObjectURL(file)} 
                                                        alt={`New ${index + 1}`} 
                                                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155', cursor: 'pointer' }} 
                                                        onClick={() => setLightboxUrl(URL.createObjectURL(file))}
                                                    />
                                                    <button 
                                                        onClick={() => removeNewPhoto(index)}
                                                        style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                                    >×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="journal-actions">
                            <button className="btn-secondary" onClick={() => setIsEditing(false)} disabled={saving || uploading}>Cancel</button>
                            <button className="btn-primary" onClick={handleSave} disabled={saving || uploading}>
                                {saving || uploading ? 'Saving...' : 'Save Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox for old photo logic if ever needed */}
            {lightboxUrl && (
                <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
                    <img src={lightboxUrl} alt="Preview" className="lightbox-image" />
                    <button className="lightbox-close">×</button>
                </div>
            )}
        </div>
    );
};

export default JournalView;

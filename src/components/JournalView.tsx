import React, { useState, useEffect } from 'react';
import { journalService } from '../services/journalService';
import './JournalView.css';

const JournalView: React.FC = () => {
    const [tasks, setTasks] = useState('');
    const [learnings, setLearnings] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadJournal();
    }, [date]);

    const loadJournal = async () => {
        try {
            setLoading(true);
            const journal = await journalService.getJournalForDate(date);
            setTasks(journal?.tasks || '');
            setLearnings(journal?.learnings || '');
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
            await journalService.upsertJournal(tasks, learnings, date);
            setMessage({ type: 'success', text: 'Journal entry saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            console.error('Error saving journal:', err);
            setMessage({ type: 'error', text: 'Failed to save journal entry.' });
        } finally {
            setSaving(false);
        }
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
                </div>

                <div className="journal-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading || saving}
                    >
                        {saving ? 'Saving...' : 'Save Journal'}
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
        </div>
    );
};

export default JournalView;

import React, { useEffect, useState } from 'react';
import { companyService, type Evaluation } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import UserClickableName from './UserClickableName';

const EvaluationCriteria = [
    { key: 'attendance_score', label: 'Attendance' },
    { key: 'punctuality_score', label: 'Punctuality' },
    { key: 'communication_score', label: 'Communication' },
    { key: 'professionalism_score', label: 'Professionalism' },
    { key: 'technical_skills_score', label: 'Technical Skills' },
    { key: 'problem_solving_score', label: 'Problem Solving' },
    { key: 'teamwork_score', label: 'Teamwork' },
    { key: 'initiative_score', label: 'Initiative' },
    { key: 'adaptability_score', label: 'Adaptability' },
    { key: 'work_quality_score', label: 'Quality of Work' },
    { key: 'responsibility_score', label: 'Responsibility' }
];

const CompanyEvaluationView: React.FC = () => {
    const [students, setStudents] = useState<Profile[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingEvaluations, setLoadingEvaluations] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState<any>({});

    useEffect(() => { loadStudents(); }, []);

    const loadStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            const data = await companyService.getAssignedStudents(profile.company_id);
            setStudents(data);
        } catch (err: any) {
            console.error('Failed to load students:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSelectStudent = async (student: Profile) => {
        setSelectedStudent(student);
        setShowForm(false);
        setLoadingEvaluations(true);
        try {
            const data = await companyService.getStudentEvaluations(student.id);
            setEvaluations(data as Evaluation[]);
        } catch (err) {
            console.error('Failed to load evaluations:', err);
        } finally {
            setLoadingEvaluations(false);
        }
    };

    const handleOpenForm = () => {
        const initialData: any = {};
        EvaluationCriteria.forEach(c => initialData[c.key] = 0);
        initialData.overall_rating = 0;
        initialData.comments = '';
        initialData.strengths = '';
        initialData.weaknesses = '';
        initialData.recommendations = '';
        setFormData(initialData);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent) return;
        
        // Validate all scores are > 0
        const unrated = EvaluationCriteria.filter(c => formData[c.key] === 0);
        if (unrated.length > 0 || formData.overall_rating === 0) {
            alert('Please rate all criteria, including the overall rating.');
            return;
        }

        setSubmitting(true);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) throw new Error("No company associated");
            
            await companyService.submitEvaluation({
                ...formData,
                student_id: selectedStudent.id,
                company_id: profile.company_id,
                evaluator_id: profile.id
            });
            
            setShowForm(false);
            // Refresh evaluations
            handleSelectStudent(selectedStudent);
        } catch (err: any) {
            console.error('Failed to submit evaluation:', err);
            alert(`Failed to submit evaluation: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const renderStars = (key: string, value: number) => {
        return (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
                {[1, 2, 3, 4, 5].map(star => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => setFormData({ ...formData, [key]: star })}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: star <= value ? '#f59e0b' : 'var(--border)'
                        }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill={star <= value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    </button>
                ))}
            </div>
        );
    };

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in" style={{ display: 'flex', gap: '2rem', height: '100%' }}>
            {/* Left Sidebar - Student List */}
            <div className="glass-card" style={{ width: '300px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <h3 style={{ margin: 0 }}>Interns</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Loading interns...</div>
                    ) : students.length === 0 ? (
                        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>No interns assigned.</div>
                    ) : (
                        students.map(student => (
                            <div 
                                key={student.id}
                                onClick={() => handleSelectStudent(student)}
                                style={{ 
                                    padding: '1rem 1.5rem', 
                                    borderBottom: '1px solid var(--border)',
                                    cursor: 'pointer',
                                    background: selectedStudent?.id === student.id ? 'var(--bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                                className="hoverable-row"
                            >
                                <div style={{ fontWeight: 600 }}>{student.first_name} {student.last_name}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{student.department_info?.name || student.department || 'No department'}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Content - Evaluations */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                {!selectedStudent ? (
                    <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.5 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                        <h3>Select an intern</h3>
                        <p>Select an intern from the list to view or submit evaluations.</p>
                    </div>
                ) : (
                    <>
                        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: '0 0 0.25rem 0' }}><UserClickableName userId={selectedStudent.id} userName={`${selectedStudent.first_name} ${selectedStudent.last_name}`} /></h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{selectedStudent.email}</p>
                            </div>
                            {!showForm && (
                                <button className="btn-primary" onClick={handleOpenForm}>
                                    New Evaluation
                                </button>
                            )}
                        </div>

                        {showForm ? (
                            <form className="glass-card fade-in" style={{ padding: '2rem' }} onSubmit={handleSubmit}>
                                <h3 style={{ margin: '0 0 1.5rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>New Performance Evaluation</h3>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                    {EvaluationCriteria.map(criteria => (
                                        <div key={criteria.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{criteria.label}</label>
                                            {renderStars(criteria.key, formData[criteria.key])}
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-elevated)', borderRadius: '12px' }}>
                                    <h4 style={{ margin: '0 0 1rem 0' }}>Overall Rating</h4>
                                    <div style={{ transform: 'scale(1.2)', transformOrigin: 'left center' }}>
                                        {renderStars('overall_rating', formData.overall_rating)}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Strengths</label>
                                        <textarea className="form-input" style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} value={formData.strengths} onChange={e => setFormData({...formData, strengths: e.target.value})} placeholder="What does this intern do well?" required />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Areas for Improvement (Weaknesses)</label>
                                        <textarea className="form-input" style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} value={formData.weaknesses} onChange={e => setFormData({...formData, weaknesses: e.target.value})} placeholder="Where can this intern improve?" required />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Recommendations / Additional Comments</label>
                                        <textarea className="form-input" style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} value={formData.recommendations} onChange={e => setFormData({...formData, recommendations: e.target.value})} placeholder="Any other feedback?" />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                    <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</button>
                                    <button type="submit" className="btn-primary" disabled={submitting}>
                                        {submitting ? 'Submitting...' : 'Submit Evaluation'}
                                    </button>
                                </div>
                            </form>
                        ) : loadingEvaluations ? (
                            <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading evaluations...</div>
                        ) : evaluations.length === 0 ? (
                            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <p>No evaluations submitted for this intern yet.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {evaluations.map(evaluation => (
                                    <div key={evaluation.id} className="glass-card" style={{ padding: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                            <h3 style={{ margin: 0 }}>Evaluation Report</h3>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                Submitted on {new Date(evaluation.created_at).toLocaleDateString()}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                            {EvaluationCriteria.map(c => (
                                                <div key={c.key}>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{c.label}</div>
                                                    <div style={{ display: 'flex', gap: '0.1rem', color: '#f59e0b' }}>
                                                        {[...Array((evaluation as any)[c.key])].map((_, i) => (
                                                            <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.25rem' }}>Overall Rating</div>
                                                <div style={{ display: 'flex', gap: '0.25rem', color: '#f59e0b' }}>
                                                    {[...Array(evaluation.overall_rating)].map((_, i) => (
                                                        <svg key={i} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div>
                                                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Strengths</h4>
                                                <p style={{ margin: 0, background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>{evaluation.strengths}</p>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Areas for Improvement</h4>
                                                <p style={{ margin: 0, background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>{evaluation.weaknesses}</p>
                                            </div>
                                            {evaluation.recommendations && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Recommendations / Comments</h4>
                                                    <p style={{ margin: 0, background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>{evaluation.recommendations}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default CompanyEvaluationView;

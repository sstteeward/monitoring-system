import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { companyService, type Evaluation } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import UserClickableName from './UserClickableName';
import { ListSkeleton } from './Skeletons';

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
    const location = useLocation();
    const [students, setStudents] = useState<Profile[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingEvaluations, setLoadingEvaluations] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [evaluatorProfile, setEvaluatorProfile] = useState<Profile | null>(null);
    
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const [expandedEvalId, setExpandedEvalId] = useState<string | null>(null);

    useEffect(() => { loadStudents(); }, []);

    const loadStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            setEvaluatorProfile(profile);
            const data = await companyService.getAssignedStudents(profile.company_id);
            setStudents(data);
            
            // Check if a student ID was passed in navigation state
            const stateStudentId = location.state?.studentId;
            if (stateStudentId) {
                const targetStudent = data.find(s => s.id === stateStudentId);
                if (targetStudent) {
                    setSelectedStudent(targetStudent);
                    setLoadingEvaluations(true);
                    const studentEvals = await companyService.getStudentEvaluations(stateStudentId);
                    setEvaluations(studentEvals as Evaluation[]);
                    setLoadingEvaluations(false);
                    
                    if (location.state?.openForm) {
                        const initialData: any = {};
                        EvaluationCriteria.forEach(c => initialData[c.key] = 0);
                        initialData.overall_rating = 0;
                        initialData.comments = '';
                        initialData.strengths = '';
                        initialData.weaknesses = '';
                        initialData.recommendations = '';
                        setFormData(initialData);
                        setShowForm(true);
                    }
                    return;
                }
            }
            
            // Load all company evaluations initially if no student was selected via state
            setLoadingEvaluations(true);
            const allEvals = await companyService.getCompanyEvaluations(profile.company_id);
            setEvaluations(allEvals as Evaluation[]);
            setLoadingEvaluations(false);
            
        } catch (err: any) {
            console.error('Failed to load students:', err);
            setError(err?.message || JSON.stringify(err));
            setLoadingEvaluations(false);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectStudent = async (student: Profile | null) => {
        setSelectedStudent(student);
        setShowForm(false);
        setExpandedEvalId(null);
        setLoadingEvaluations(true);
        try {
            if (student) {
                const data = await companyService.getStudentEvaluations(student.id);
                setEvaluations(data as Evaluation[]);
            } else if (evaluatorProfile?.company_id) {
                const data = await companyService.getCompanyEvaluations(evaluatorProfile.company_id);
                setEvaluations(data as Evaluation[]);
            }
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
        setExpandedEvalId(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent) return;
        
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
            handleSelectStudent(selectedStudent);
        } catch (err: any) {
            console.error('Failed to submit evaluation:', err);
            alert(`Failed to submit evaluation: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const renderStars = (key: string, value: number) => (
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

    const renderReadonlyStars = (value: number, size: number = 16) => (
        <div style={{ display: 'flex', gap: '0.1rem', color: '#f59e0b' }}>
            {[...Array(value)].map((_, i) => (
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            ))}
        </div>
    );

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    const filteredStudents = students.filter(student => 
        `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email?.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

    const evaluatorName = evaluatorProfile ? `${evaluatorProfile.first_name} ${evaluatorProfile.last_name}` : 'Evaluator';


    return (
        <div className="view-container fade-in">
            <style dangerouslySetInnerHTML={{__html: `
                .evaluation-layout {
                    display: flex;
                    gap: 24px;
                    height: 100%;
                    flex-direction: row;
                }
                .left-panel {
                    width: 30%;
                    min-width: 250px;
                }
                .right-panel {
                    width: 70%;
                }
                @media (max-width: 1024px) {
                    .left-panel {
                        width: 35%;
                    }
                    .right-panel {
                        width: 65%;
                    }
                }
                @media (max-width: 768px) {
                    .evaluation-layout {
                        flex-direction: column;
                    }
                    .left-panel, .right-panel {
                        width: 100%;
                        height: auto;
                        min-height: 400px;
                    }
                }
                
                .panel {
                    background: var(--bg-card);
                    border-radius: 16px;
                    border: 1px solid var(--border);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    transition: border-color 0.3s ease, box-shadow 0.3s ease;
                }
                .panel:hover {
                    border-color: var(--primary-glow);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 0 16px var(--primary-glow);
                }

                .scrollable-content {
                    flex: 1;
                    overflow-y: auto;
                    padding-right: 8px;
                }
                /* Custom Scrollbar */
                .scrollable-content::-webkit-scrollbar {
                    width: 6px;
                }
                .scrollable-content::-webkit-scrollbar-track {
                    background: transparent;
                }
                .scrollable-content::-webkit-scrollbar-thumb {
                    background-color: var(--border);
                    border-radius: 10px;
                }
                .scrollable-content::-webkit-scrollbar-thumb:hover {
                    background-color: var(--border);
                }
                
                .intern-card {
                    padding: 8px 4px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 4px;
                }
                .intern-card:hover {
                    opacity: 0.8;
                }
                .intern-card.selected {
                    /* Selected styling handled inline via text weight/color */
                }
                
                .intern-number {
                    width: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    font-weight: 600;
                    color: var(--text-muted);
                    font-size: 0.95rem;
                    flex-shrink: 0;
                }

                .intern-search-wrapper {
                    position: relative;
                    margin-bottom: 1.5rem;
                }
                .intern-search-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted);
                }
                .intern-search {
                    width: 100%;
                    padding: 10px 16px 10px 38px;
                    border-radius: 8px;
                    background-color: var(--bg-elevated);
                    border: 1px solid var(--border);
                    color: var(--text-primary);
                    outline: none;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                    font-size: 0.9rem;
                }
                .intern-search:focus {
                    border-color: var(--primary);
                }
                
                .eval-card {
                    padding: 16px 20px;
                    margin-bottom: 16px;
                }
                .eval-card-header {
                    display: flex;
                    align-items: flex-start;
                    gap: 16px;
                }

                .btn-new-eval {
                    background: var(--primary) !important;
                    color: white;
                    border-radius: 12px;
                    padding: 10px 16px;
                    border: none;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-size: 0.9rem;
                }
                .btn-new-eval:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                
                .btn-outline {
                    border: 1px solid var(--border);
                    background: transparent;
                    color: var(--text-primary);
                    border-radius: 8px;
                    padding: 6px 16px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn-outline:hover {
                    background: var(--bg-elevated);
                }

                .status-icon-circle {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: rgba(16,185,129,0.15);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    color: #10b981;
                }
                
                .status-badge {
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    background: rgba(16,185,129,0.15);
                    color: #10b981;
                    border: 1px solid rgba(16,185,129,0.3);
                    display: inline-block;
                }
                
                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                    text-align: center;
                    padding: 40px;
                }
                .empty-icon {
                    width: 64px;
                    height: 64px;
                    background: var(--bg-elevated);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                    color: var(--text-muted);
                }
            `}} />

            <div className="evaluation-layout">
                {/* Left Panel - Intern List */}
                <div className="panel left-panel">
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 600 }}>Interns</h3>
                    
                    <div className="intern-search-wrapper">
                        <span className="intern-search-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </span>
                        <input 
                            type="text" 
                            className="intern-search"
                            placeholder="Search interns..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="scrollable-content">
                        {loading ? (
                            <ListSkeleton items={4} />
                        ) : filteredStudents.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>
                                {students.length === 0 ? 'No interns assigned.' : 'No interns match your search.'}
                            </div>
                        ) : (
                            filteredStudents.map((student, index) => {
                                const isSelected = selectedStudent?.id === student.id;
                                return (
                                    <div 
                                        key={student.id} 
                                        className={`intern-card ${selectedStudent?.id === student.id ? 'selected' : ''}`}
                                        onClick={() => handleSelectStudent(selectedStudent?.id === student.id ? null : student)}
                                        style={{
                                            color: selectedStudent?.id === student.id ? 'var(--primary)' : 'var(--text-primary)',
                                            fontWeight: selectedStudent?.id === student.id ? 600 : 400
                                        }}
                                    >
                                        <div className="intern-number">
                                            {index + 1}.
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.95rem', color: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {student.first_name} {student.last_name}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Panel - Evaluation Details */}
                <div className="panel right-panel">
                    {!selectedStudent ? (
                        <div className="empty-state fade-in">
                            <div className="empty-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            </div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem' }}>Select an intern</h3>
                            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Choose an intern from the list to view or submit evaluations.</p>
                        </div>
                    ) : (
                        <>
                            {/* Header Bar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                                    {selectedStudent 
                                        ? <>Evaluations for <UserClickableName userId={selectedStudent.id} userName={`${selectedStudent.first_name} ${selectedStudent.last_name}`} /></>
                                        : "All Recent Evaluations"
                                    }
                                </h3>
                                {!showForm && selectedStudent && (
                                    <button 
                                        className="btn-new-eval"
                                        onClick={handleOpenForm}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                        New Evaluation
                                    </button>
                                )}
                            </div>

                            <div className="scrollable-content">
                                {showForm ? (
                                    <form className="fade-in" style={{ padding: '0 8px 24px 8px' }} onSubmit={handleSubmit}>
                                        <h3 style={{ margin: '0 0 1.5rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>New Performance Evaluation</h3>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                            {EvaluationCriteria.map(criteria => (
                                                <div key={criteria.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{criteria.label}</label>
                                                    {renderStars(criteria.key, formData[criteria.key])}
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <h4 style={{ margin: '0 0 1rem 0' }}>Overall Rating</h4>
                                            <div style={{ transform: 'scale(1.2)', transformOrigin: 'left center' }}>
                                                {renderStars('overall_rating', formData.overall_rating)}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Strengths</label>
                                                <textarea className="form-input" style={{ width: '100%', minHeight: '80px', resize: 'vertical', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px', padding: '12px' }} value={formData.strengths} onChange={e => setFormData({...formData, strengths: e.target.value})} placeholder="What does this intern do well?" required />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Areas for Improvement (Weaknesses)</label>
                                                <textarea className="form-input" style={{ width: '100%', minHeight: '80px', resize: 'vertical', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px', padding: '12px' }} value={formData.weaknesses} onChange={e => setFormData({...formData, weaknesses: e.target.value})} placeholder="Where can this intern improve?" required />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Recommendations / Additional Comments</label>
                                                <textarea className="form-input" style={{ width: '100%', minHeight: '80px', resize: 'vertical', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px', padding: '12px' }} value={formData.recommendations} onChange={e => setFormData({...formData, recommendations: e.target.value})} placeholder="Any other feedback?" />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                            <button type="button" className="btn-outline" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</button>
                                            <button type="submit" className="btn-new-eval" disabled={submitting}>
                                                {submitting ? 'Submitting...' : 'Submit Evaluation'}
                                            </button>
                                        </div>
                                    </form>
                                ) : loadingEvaluations ? (
                                    <ListSkeleton items={4} />
                                ) : evaluations.length === 0 ? (
                                    <div className="empty-state fade-in">
                                        <div className="empty-icon">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                        </div>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem' }}>No evaluations found</h3>
                                        <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)' }}>
                                            No evaluations have been submitted yet for this intern.
                                        </p>
                                        {selectedStudent && (
                                            <button 
                                                className="btn-new-eval"
                                                onClick={handleOpenForm}
                                                style={{ marginTop: '0.5rem' }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                                Add Evaluation
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {evaluations.map(evaluation => {
                                            const isExpanded = expandedEvalId === evaluation.id;
                                            const evalDate = new Date(evaluation.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

                                            return (
                                                <div key={evaluation.id} className="eval-card glass-card">
                                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                        <div className="eval-card-header">
                                                            {/* Status Icon */}
                                                            <div className="status-icon-circle">
                                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                                            </div>
                                                            
                                                            {/* Center Info */}
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                                                                    Performance Evaluation
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                                    <span>{evalDate}</span>
                                                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border)' }}></span>
                                                                    <span>Evaluator: {evaluatorName}</span>
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Right Actions */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px', flexShrink: 0 }}>
                                                                <div className="status-badge">Completed</div>
                                                                <button 
                                                                    className="btn-outline"
                                                                    onClick={(e) => { e.stopPropagation(); setExpandedEvalId(isExpanded ? null : evaluation.id); }}
                                                                >
                                                                    {isExpanded ? 'Close' : 'View'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Expanded Content */}
                                                        {isExpanded && (
                                                            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }} className="fade-in">
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                                                    {/* Scores Grid */}
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                                                        {EvaluationCriteria.map(c => (
                                                                            <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{c.label}</span>
                                                                                {renderReadonlyStars((evaluation as any)[c.key])}
                                                                            </div>
                                                                        ))}
                                                                        <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                            <span style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 600 }}>Overall Rating</span>
                                                                            {renderReadonlyStars(evaluation.overall_rating, 18)}
                                                                        </div>
                                                                    </div>

                                                                    {/* Text Feedback */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                        {evaluation.strengths && (
                                                                            <div>
                                                                                <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Strengths</h4>
                                                                                <p style={{ margin: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{evaluation.strengths}</p>
                                                                            </div>
                                                                        )}
                                                                        {evaluation.weaknesses && (
                                                                            <div>
                                                                                <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Areas for Improvement</h4>
                                                                                <p style={{ margin: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{evaluation.weaknesses}</p>
                                                                            </div>
                                                                        )}
                                                                        {evaluation.recommendations && (
                                                                            <div>
                                                                                <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Recommendations / Comments</h4>
                                                                                <p style={{ margin: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{evaluation.recommendations}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompanyEvaluationView;

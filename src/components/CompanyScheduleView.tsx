import React, { useEffect, useState } from 'react';
import { companyService, type Schedule } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import UserClickableName from './UserClickableName';
import { CardGridSkeleton } from './Skeletons';

const SHIFT_TYPES = ['morning', 'afternoon', 'night', 'flexible'] as const;
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CompanyScheduleView: React.FC = () => {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [students, setStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [companyId, setCompanyId] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    const [formData, setFormData] = useState<Partial<Schedule>>({
        shift_type: 'morning',
        working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        start_time: '08:00',
        end_time: '17:00',
        break_start: '12:00',
        break_end: '13:00'
    });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            setCompanyId(profile.company_id);
            
            const [assignedStudents, schedulesData] = await Promise.all([
                companyService.getAssignedStudents(profile.company_id),
                companyService.getSchedules(profile.company_id)
            ]);
            
            setStudents(assignedStudents);
            setSchedules(schedulesData as Schedule[]);
        } catch (err: any) {
            console.error('Failed to load schedules:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (schedule: Schedule) => {
        setFormData(schedule);
        setShowForm(true);
    };

    const handleNew = () => {
        setFormData({
            shift_type: 'morning',
            working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            start_time: '08:00',
            end_time: '17:00',
            break_start: '12:00',
            break_end: '13:00',
            student_id: students.length > 0 ? students[0].id : undefined
        });
        setShowForm(true);
    };

    const toggleDay = (day: string) => {
        const currentDays = formData.working_days || [];
        if (currentDays.includes(day)) {
            setFormData({ ...formData, working_days: currentDays.filter(d => d !== day) });
        } else {
            // Keep days sorted based on DAYS_OF_WEEK order
            const newDays = [...currentDays, day].sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b));
            setFormData({ ...formData, working_days: newDays });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId) return;
        if (!formData.student_id) {
            alert('Please select a student.');
            return;
        }

        setSubmitting(true);
        try {
            await companyService.saveSchedule({
                ...formData,
                company_id: companyId
            });
            setShowForm(false);
            loadData();
        } catch (err: any) {
            console.error('Failed to save schedule:', err);
            alert(`Failed to save schedule: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const getStudentName = (studentId: string) => {
        const student = students.find(s => s.id === studentId);
        return student ? `${student.first_name} ${student.last_name}` : 'Unknown Student';
    };

    const formatTime = (timeStr: string | null | undefined) => {
        if (!timeStr) return '—';
        // Parse time strings like "08:00:00" or "08:00"
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedH = h % 12 || 12;
        return `${formattedH}:${minutes} ${ampm}`;
    };

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Schedule Management</h2>
                    <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                        Manage shift schedules and working hours for your interns
                    </p>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : handleNew}>
                        {showForm ? 'Cancel' : 'Add Schedule'}
                    </button>
                </div>
            </div>

            {showForm && (
                <form className="glass-card fade-in" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid var(--primary)', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.1)' }} onSubmit={handleSubmit}>
                    <h3 style={{ margin: '0 0 1.5rem 0' }}>{formData.id ? 'Edit Schedule' : 'Create Schedule'}</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Intern</label>
                            <select 
                                className="form-input" 
                                style={{ width: '100%' }} 
                                value={formData.student_id || ''} 
                                onChange={e => setFormData({...formData, student_id: e.target.value})}
                                disabled={!!formData.id} // Don't allow changing student if editing
                                required
                            >
                                <option value="" disabled>Select Intern</option>
                                {students.map(student => (
                                    <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Shift Type</label>
                            <select 
                                className="form-input" 
                                style={{ width: '100%' }} 
                                value={formData.shift_type || 'morning'} 
                                onChange={e => setFormData({...formData, shift_type: e.target.value as Schedule['shift_type']})}
                            >
                                {SHIFT_TYPES.map(type => (
                                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Working Days</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {DAYS_OF_WEEK.map(day => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleDay(day)}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '20px',
                                        border: `1px solid ${formData.working_days?.includes(day) ? 'var(--primary)' : 'var(--border)'}`,
                                        background: formData.working_days?.includes(day) ? 'var(--primary)' : 'transparent',
                                        color: formData.working_days?.includes(day) ? '#fff' : 'var(--text-secondary)',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {day.substring(0, 3)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {formData.shift_type !== 'flexible' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Start Time</label>
                                    <input 
                                        type="time" 
                                        className="form-input" 
                                        style={{ width: '100%' }} 
                                        value={formData.start_time || ''} 
                                        onChange={e => setFormData({...formData, start_time: e.target.value})} 
                                        required 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>End Time</label>
                                    <input 
                                        type="time" 
                                        className="form-input" 
                                        style={{ width: '100%' }} 
                                        value={formData.end_time || ''} 
                                        onChange={e => setFormData({...formData, end_time: e.target.value})} 
                                        required 
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Break Start Time</label>
                                    <input 
                                        type="time" 
                                        className="form-input" 
                                        style={{ width: '100%' }} 
                                        value={formData.break_start || ''} 
                                        onChange={e => setFormData({...formData, break_start: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Break End Time</label>
                                    <input 
                                        type="time" 
                                        className="form-input" 
                                        style={{ width: '100%' }} 
                                        value={formData.break_end || ''} 
                                        onChange={e => setFormData({...formData, break_end: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save Schedule'}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <CardGridSkeleton cards={6} height={180} />
            ) : schedules.length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No schedules defined. Click "Add Schedule" to create one.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {schedules.map(schedule => (
                        <div key={schedule.id} className="glass-card" style={{ padding: '1.5rem', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>
                                        <UserClickableName userId={schedule.student_id} userName={(schedule as any).profiles ? `${(schedule as any).profiles.first_name} ${(schedule as any).profiles.last_name}` : getStudentName(schedule.student_id)} />
                                    </h3>
                                    <span style={{ 
                                        padding: '0.2rem 0.6rem', 
                                        borderRadius: '6px', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 600,
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        color: '#3b82f6',
                                        textTransform: 'uppercase',
                                        display: 'inline-block'
                                    }}>
                                        {schedule.shift_type} Shift
                                    </span>
                                </div>
                                <button 
                                    onClick={() => handleEdit(schedule)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
                                    title="Edit schedule"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                            </div>
                            
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Working Days</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {schedule.working_days?.map(day => (
                                        <span key={day} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                            {day.substring(0, 3)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            {schedule.shift_type !== 'flexible' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Work Hours</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}</div>
                                    </div>
                                    {(schedule.break_start || schedule.break_end) && (
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Break Time</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatTime(schedule.break_start)} - {formatTime(schedule.break_end)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompanyScheduleView;

import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';

interface UserProfileModalProps {
    profileId: string | null;
    onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ profileId, onClose }) => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!profileId) return;
        setProfile(null);
        setLoading(true);
        profileService.getProfileById(profileId).then(data => {
            setProfile(data);
            setLoading(false);
        });
    }, [profileId]);

    if (!profileId) return null;

    const initials = profile
        ? [profile.first_name?.[0], profile.last_name?.[0]].filter(Boolean).join('').toUpperCase() || profile.email?.[0]?.toUpperCase() || '?'
        : '?';

    const displayName = profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name ?? profile?.email ?? 'User';

    const joinDate = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : '—';

    const roleColors: Record<string, string> = {
        student: '#3b82f6',
        coordinator: '#10b981',
        admin: '#f59e0b',
    };
    const roleColor = roleColors[profile?.account_type ?? 'student'] ?? '#10b981';

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const field = (label: string, value: React.ReactNode) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginRight: '1rem' }}>{label}</span>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{value ?? '—'}</span>
        </div>
    );

    return (
        <div
            onClick={handleBackdropClick}
            style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '2rem',
                animation: 'fadeIn 0.2s ease',
            }}
        >
            <div 
                className="custom-scrollbar"
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 28,
                    width: '100%',
                    maxWidth: 800,
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                    animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    position: 'relative',
                }}
            >
                {/* Close Button - Floated top right */}
                <button
                    onClick={onClose}
                    title="Close"
                    style={{
                        position: 'absolute',
                        top: '1.5rem',
                        right: '1.5rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '14px', 
                        width: 40, 
                        height: 40,
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        cursor: 'pointer', 
                        color: 'var(--text-muted)', 
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        zIndex: 10,
                    }}
                    onMouseOver={e => { 
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; 
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                        e.currentTarget.style.transform = 'rotate(90deg)';
                    }}
                    onMouseOut={e => { 
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; 
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.transform = 'rotate(0deg)';
                    }}
                >
                    <span style={{ fontSize: '1.4rem', fontWeight: 300 }}>✕</span>
                </button>

                {loading ? (
                    /* Skeleton */
                    <div style={{ padding: '3rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '3rem', gap: '1rem' }}>
                            <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
                            <div style={{ width: 200, height: 24, borderRadius: 12, background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
                            <div style={{ width: 100, height: 16, borderRadius: 8, background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {[1, 2, 3].map(j => (
                                        <div key={j} style={{ height: 40, borderRadius: 12, background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : !profile ? (
                    <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>👤</div>
                        <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Profile Not Found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>The requested user profile could not be loaded.</p>
                    </div>
                ) : (
                    <div style={{ padding: '3rem' }}>
                        {/* Hero Section */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '3.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '3rem' }}>
                            <div style={{
                                width: 120, height: 120, borderRadius: '32px',
                                background: profile.avatar_url
                                    ? `url(${profile.avatar_url}) center/cover no-repeat`
                                    : `linear-gradient(135deg, ${roleColor}, ${roleColor}bb)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2.5rem', fontWeight: 700, color: '#fff',
                                boxShadow: `0 20px 40px ${roleColor}22`,
                                flexShrink: 0,
                                transform: 'rotate(-3deg)',
                            }}>
                                {profile.avatar_url ? '' : initials}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '-0.02em' }}>
                                        {displayName}
                                    </h1>
                                    <span style={{
                                        background: `${roleColor}15`,
                                        color: roleColor,
                                        border: `1px solid ${roleColor}30`,
                                        borderRadius: '12px',
                                        padding: '0.3rem 1rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                    }}>
                                        {profile.account_type}
                                    </span>
                                </div>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem' }}>
                                    {profile.email}
                                </p>
                            </div>
                        </div>

                        {/* Content Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem' }}>
                            {/* Column 1: Identity & Academic */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <section>
                                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ width: 24, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
                                        Identity
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {field('Join Date', joinDate)}
                                        {profile.contact_number && field('Phone', profile.contact_number)}
                                        {profile.address && field('Address', profile.address)}
                                    </div>
                                </section>

                                {profile.account_type === 'student' && (
                                    <section>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 24, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
                                            Academic
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {field('Course', profile.course)}
                                            {field('Department', profile.department)}
                                            {field('Year Level', profile.year_level)}
                                            {field('Section', profile.section)}
                                        </div>
                                    </section>
                                )}
                            </div>

                            {/* Column 2: Internship & Performance */}
                            {profile.account_type === 'student' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                    <section>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 24, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
                                            Internship
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {field('Provider', (profile.company as any)?.name ?? (profile.company_id ? '...' : 'Not Assigned'))}
                                            {field('Requirements', profile.required_ojt_hours ? `${profile.required_ojt_hours} Hours` : 'Not Set')}
                                            {field('Grade', profile.grade || 'Pending')}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 24, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
                                            Attendance
                                        </h3>
                                        <div style={{ 
                                            background: 'rgba(255,158,11,0.03)', 
                                            border: '1px solid rgba(255,158,11,0.1)', 
                                            borderRadius: '20px', 
                                            padding: '1.5rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TOTAL ABSENCES</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: (profile.absences || 0) > 3 ? '#ef4444' : '#f59e0b' }}>
                                                    {profile.absences || 0}
                                                </div>
                                            </div>
                                            <div style={{ opacity: 0.4, fontSize: '2rem' }}>🕒</div>
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { 
                    from { opacity: 0; transform: translateY(40px) scale(0.95); } 
                    to { opacity: 1; transform: translateY(0) scale(1); } 
                }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    border: 2px solid transparent;
                    background-clip: content-box;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                    background-clip: content-box;
                }
                
                /* For Firefox */
                .custom-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
                }
            `}</style>
        </div>
    );
};

export default UserProfileModal;

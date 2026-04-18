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
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
    };

    const field = (label: string, value: React.ReactNode) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', gap: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: '0.15rem' }}>{label}</span>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right', overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0, flex: 1 }}>{value ?? '—'}</span>
        </div>
    );

    return (
        <div
            onClick={handleBackdropClick}
            className="upm-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                zIndex: 2000,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                animation: 'fadeIn 0.2s ease',
            }}
        >
            <div 
                className="custom-scrollbar upm-card glass-card"
                style={{
                    borderRadius: '28px',
                    width: 'min(1000px, 95vw)',
                    height: 'fit-content',
                    maxHeight: 'min(90vh, 800px)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    background: 'rgba(18, 18, 18, 0.95)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxSizing: 'border-box',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Close Button - Floated top right */}
                <button
                    type="button"
                    className="close-modal-btn upm-close-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
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
                    <div style={{ padding: '1.75rem 1.5rem' }} className="upm-inner-pad">
                        {/* Hero Section */}
                        <div className="upm-hero" style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '1.5rem', 
                            marginBottom: '1.5rem', 
                            paddingRight: '3.5rem', 
                            flexWrap: 'wrap',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: '1.5rem'
                        }}>
                            <div className="upm-hero-avatar" style={{
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
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="upm-hero-title-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                    <h1 className="upm-hero-name" style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '-0.02em', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
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
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                    {profile.email}
                                </p>
                            </div>
                        </div>

                        {/* Content Grid */}
                        <div className="upm-content-grid" style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', 
                            gap: '1.5rem' 
                        }}>
                            {/* Column 1: Identity & Academic */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <section>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 20, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
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
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 20, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <section>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 20, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
                                            Internship
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {field('Provider', (profile.company as any)?.name ?? (profile.company_id ? '...' : 'Not Assigned'))}
                                            {field('Requirements', profile.required_ojt_hours ? `${profile.required_ojt_hours} Hours` : 'Not Set')}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ width: 20, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
                                            Attendance
                                        </h3>
                                        <div style={{ 
                                            background: 'rgba(255,158,11,0.03)', 
                                            border: '1px solid rgba(255,158,11,0.1)', 
                                            borderRadius: '16px', 
                                            padding: '1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem' }}>TOTAL ABSENCES</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: (profile.absences || 0) > 3 ? '#ef4444' : '#f59e0b' }}>
                                                    {profile.absences || 0}
                                                </div>
                                            </div>
                                            <div style={{ opacity: 0.4, fontSize: '1.5rem' }}>🕒</div>
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
                
                .close-modal-btn:hover {
                    background: rgba(239, 68, 68, 0.15) !important;
                    color: #ef4444 !important;
                    border-color: rgba(239, 68, 68, 0.2) !important;
                }
                
                /* For Firefox */
                .custom-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
                }

                .upm-overlay {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }

                /* ── Desktop & Base Layout ── */
                .upm-card {
                    width: min(1000px, 95vw) !important;
                    height: auto !important;
                    max-height: min(90vh, 800px) !important;
                }

                .upm-content-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr !important;
                    gap: 1.5rem !important;
                }

                /* ── Smaller Screens (Tablet/Narrow Desktop) ── */
                @media (max-width: 1100px) {
                    .upm-overlay {
                        padding: 1rem !important;
                    }
                    .upm-inner-pad {
                        padding: 1.5rem !important;
                    }
                }

                @media (max-width: 900px) {
                    .upm-hero-name {
                        font-size: 1.6rem !important;
                    }
                    .upm-content-grid {
                        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) !important;
                        gap: 2rem !important;
                    }
                }

                /* ── Mobile View ── */
                @media (max-width: 800px) {
                    .upm-card {
                        width: 95% !important;
                        min-width: unset !important;
                    }
                    .upm-content-grid {
                        grid-template-columns: 1fr !important;
                        gap: 2rem !important;
                    }
                }

                @media (max-width: 640px) {
                    .upm-overlay {
                        padding: 0 !important;
                        align-items: flex-end !important;
                        justify-content: center !important;
                    }
                    .upm-card {
                        border-radius: 20px 20px 0 0 !important;
                        max-height: 95vh !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: unset !important;
                    }
                    .upm-inner-pad {
                        padding: 1.5rem !important;
                    }
                    .upm-hero {
                        flex-direction: column !important;
                        gap: 1.5rem !important;
                        align-items: flex-start !important;
                        margin-bottom: 2rem !important;
                        padding-bottom: 1.5rem !important;
                        padding-right: 0 !important;
                    }
                    .upm-hero-avatar {
                        width: 80px !important;
                        height: 80px !important;
                        border-radius: 20px !important;
                        font-size: 1.8rem !important;
                    }
                    .upm-hero-name {
                        font-size: 1.5rem !important;
                    }
                    .upm-hero-title-row {
                        gap: 0.75rem !important;
                    }
                    .upm-content-grid {
                        grid-template-columns: 1fr !important;
                        gap: 2rem !important;
                    }
                    .upm-close-btn {
                        top: 1rem !important;
                        right: 1rem !important;
                        width: 36px !important;
                        height: 36px !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default UserProfileModal;

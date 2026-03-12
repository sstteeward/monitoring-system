import React, { useEffect, useState } from 'react';

interface WelcomeCelebrationProps {
    displayName: string;
    onDismiss: () => void;
}

const WelcomeCelebration: React.FC<WelcomeCelebrationProps> = ({ displayName, onDismiss }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger entrance animation
        const timer = setTimeout(() => setVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            background: 'rgba(10, 10, 15, 0.85)',
            backdropFilter: 'blur(12px)',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.6s ease-out',
        }}>
            {/* Animated background elements */}
            <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                pointerEvents: 'none',
            }}>
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="floating-orb" style={{
                        position: 'absolute',
                        width: Math.random() * 300 + 100,
                        height: Math.random() * 300 + 100,
                        background: i % 2 === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(5, 150, 105, 0.1)',
                        borderRadius: '50%',
                        filter: 'blur(60px)',
                        top: `${Math.random() * 100}%`,
                        left: `${Math.random() * 100}%`,
                        animation: `float ${10 + i * 2}s infinite alternate ease-in-out`,
                    }} />
                ))}
            </div>

            <div className="welcome-modal" style={{
                maxWidth: 480,
                width: '100%',
                background: 'rgba(30, 30, 45, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                borderRadius: 32,
                padding: '3rem 2rem',
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.9)',
                transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 1,
                position: 'relative',
            }}>
                {/* Icon/Logo */}
                <div style={{
                    width: 80,
                    height: 80,
                    margin: '0 auto 2rem',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 40px rgba(16, 185, 129, 0.4)',
                    animation: 'pulse 3s infinite',
                }} className="welcome-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                </div>

                <h2 style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: '#fff',
                    marginBottom: '1rem',
                    letterSpacing: '-0.02em',
                }} className="welcome-title">
                    Welcome aboard,<br />
                    <span style={{ 
                        background: 'linear-gradient(to right, #10b981, #34d399)', 
                        WebkitBackgroundClip: 'text', 
                        WebkitTextFillColor: 'transparent' 
                    }}>
                        {displayName}!
                    </span>
                </h2>

                <p style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: '1.05rem',
                    lineHeight: 1.6,
                    marginBottom: '2.5rem',
                }} className="welcome-text">
                    Your onboarding is complete. We've set everything up for you. Ready to start tracking your progress?
                </p>

                <button
                    onClick={onDismiss}
                    style={{
                        width: '100%',
                        padding: '1.2rem',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none',
                        borderRadius: 16,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        cursor: 'pointer',
                        boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 12px 40px rgba(16, 185, 129, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 8px 32px rgba(16, 185, 129, 0.3)';
                    }}
                >
                    Start Exploring
                </button>
            </div>

            <style>{`
                @keyframes float {
                    from { transform: translate(0, 0) rotate(0deg); }
                    to { transform: translate(40px, 60px) rotate(15deg); }
                }
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 40px rgba(16, 185, 129, 0.4); }
                    50% { transform: scale(1.05); box-shadow: 0 0 60px rgba(16, 185, 129, 0.6); }
                    100% { transform: scale(1); box-shadow: 0 0 40px rgba(16, 185, 129, 0.4); }
                }

                @media (max-width: 480px) {
                    .welcome-modal {
                        padding: 2rem 1.5rem !important;
                        border-radius: 24px !important;
                        margin: 1rem;
                    }
                    .welcome-title {
                        font-size: 1.5rem !important;
                    }
                    .welcome-text {
                        font-size: 0.95rem !important;
                        margin-bottom: 1.5rem !important;
                    }
                    .welcome-icon {
                        width: 60px !important;
                        height: 60px !important;
                        margin-bottom: 1.5rem !important;
                    }
                    .welcome-icon svg {
                        width: 28px !important;
                        height: 28px !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default WelcomeCelebration;

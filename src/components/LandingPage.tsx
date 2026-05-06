import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

// Inline SVG Icons
const StudentIcon = () => (
  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    <polyline points="10 2 10 10 13 7 16 10 16 2" />
  </svg>
);

const CoordinatorIcon = () => (
  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export default function LandingPage() {
  const navigate = useNavigate();

  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    document.title = "Asian College | SIL Monitoring System";
  }, []);

  const handlePortalSelect = (role: string) => {
    // Navigating to the unified login page with search params for persistence
    navigate(`/login?portal=${role}`);
  };

  return (
    <div className="landing-container">
      <div className="landing-content">
        <div className="landing-logo-container">
          <h1 className="landing-title">
            <span className="asian">Asian</span> <span className="college">College</span>
          </h1>
          <h2 className="landing-subtitle">SIL <span>Monitoring</span> System</h2>
        </div>

        <div className="portal-cards-wrapper">
          <div className="portal-card student" onClick={() => handlePortalSelect('student')} role="button" tabIndex={0}>
            <div className="portal-card-icon-wrap">
              <StudentIcon />
            </div>
            <h3>Student Portal <span className="arrow">→</span></h3>
            <p>Access your dashboard, manage DTR, and view records.</p>
          </div>

          <div className="portal-card coordinator" onClick={() => handlePortalSelect('coordinator')} role="button" tabIndex={0}>
            <div className="portal-card-icon-wrap">
              <CoordinatorIcon />
            </div>
            <h3>Coordinator Portal <span className="arrow">→</span></h3>
            <p>Manage student applications, verify records, and approvals.</p>
          </div>

        </div>
      </div>

      <div className="landing-footer">
        <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
            <button onClick={() => setShowTerms(true)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'none', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Terms & Conditions</button>
            <button onClick={() => setShowPrivacy(true)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'none', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Privacy Policy</button>
        </div>
        © {new Date().getFullYear()} Asian College-Dumaguete. System Developed by sstteward's team.
      </div>

      {/* Legal Modals */}
      {showTerms && (
          <div className="modal-overlay fade-in" onClick={() => setShowTerms(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
              <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-panel)', padding: '2rem', borderRadius: 16, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--text-bright)' }}>Terms & Conditions</h3>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <p><strong>1. Acceptance of Terms</strong><br/>By accessing and using the SIL Monitoring System, you agree to be bound by these Terms and Conditions.</p>
                      <p><strong>2. User Accounts</strong><br/>You are responsible for maintaining the confidentiality of your account credentials. You must immediately notify the administration of any unauthorized use of your account.</p>
                      <p><strong>3. Use of Service</strong><br/>This system is strictly provided for tracking and managing Student Internship Learning (SIL) hours. Misuse, tampering, or falsification of attendance records is strictly prohibited and may result in disciplinary action.</p>
                      <p><strong>4. Modifications</strong><br/>We reserve the right to modify these terms at any time. Continued use of the application following any changes indicates your acceptance of the new terms.</p>
                  </div>
                  <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                      <button className="btn btn-primary" onClick={() => setShowTerms(false)}>Close</button>
                  </div>
              </div>
          </div>
      )}

      {showPrivacy && (
          <div className="modal-overlay fade-in" onClick={() => setShowPrivacy(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
              <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-panel)', padding: '2rem', borderRadius: 16, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--text-bright)' }}>Privacy Policy</h3>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <p><strong>1. Data Collection</strong><br/>We collect personal information (such as name and email) and location data (for geofenced clock-ins) strictly to facilitate the SIL program.</p>
                      <p><strong>2. Data Usage</strong><br/>Your data is used solely for educational monitoring, grading, and administrative purposes within Asian College Dumaguete.</p>
                      <p><strong>3. Data Protection</strong><br/>We implement robust security measures to protect your information against unauthorized access, alteration, or disclosure.</p>
                      <p><strong>4. Third Parties</strong><br/>We do not share your personal data with third parties without your explicit consent, unless required by law.</p>
                  </div>
                  <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                      <button className="btn btn-primary" onClick={() => setShowPrivacy(false)}>Close</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

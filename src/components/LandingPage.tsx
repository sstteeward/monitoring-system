import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';
import leftPhoto from '../assets/dumaguete (1).jpg'; // Optional, could be used for hero structure if needed

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

const AdminIcon = () => (
  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Asian College | SIL Monitoring System";
  }, []);

  const handlePortalSelect = (role: string) => {
    // Navigating to the unified login page
    // Optional: We can pass state to pre-select a specific view if AuthSignup is modified later
    navigate('/login', { state: { role } });
  };

  return (
    <div className="landing-container">
      <div className="landing-bg-glow"></div>

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

          <div className="portal-card admin" onClick={() => handlePortalSelect('admin')} role="button" tabIndex={0}>
            <div className="portal-card-icon-wrap">
              <AdminIcon />
            </div>
            <h3>Admin Portal <span className="arrow">→</span></h3>
            <p>System configuration, user management, and oversight.</p>
          </div>
        </div>
      </div>

      <div className="landing-footer">
        © {new Date().getFullYear()} Asian College. System Developed by sstteward.
      </div>
    </div>
  );
}

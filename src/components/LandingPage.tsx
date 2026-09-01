import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

import silLogo from '../assets/SIL.png';

// SVG Icons tailored for academic & institutional design
const GraduationCapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);

const UserCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>
);

const ShieldUsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const InstitutionLogoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" />
    <path d="M3 10h18" />
    <path d="M5 6l7-3 7 3" />
    <path d="M4 10v11" />
    <path d="M20 10v11" />
    <path d="M8 14v4" />
    <path d="M12 14v4" />
    <path d="M16 14v4" />
  </svg>
);

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
  </svg>
);

const ArrowRightIcon = () => (
  <span className="arrow" aria-hidden="true">→</span>
);

export default function LandingPage() {
  const navigate = useNavigate();

  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCompanyInfo, setShowCompanyInfo] = useState(false);

  useEffect(() => {
    document.title = "Asian College | SIL Monitoring System";
  }, []);

  const handlePortalSelect = (role: string) => {
    navigate(`/login?portal=${role}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, role: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePortalSelect(role);
    }
  };

  return (
    <div className="landing-container">
      {/* ── 1. Header / Branding Hero ── */}
      <header className="landing-hero" role="banner">
        <div className="landing-hero-inner">
          <div className="landing-brand">
            <div className="landing-brand-logo">
              <img src={silLogo} alt="Asian College SIL Logo" className="landing-brand-logo-img" />
            </div>
            <div className="landing-brand-text">
              <h1 className="landing-brand-name">
                <span className="asian">Asian</span> <span className="college">College</span>
              </h1>
              <span className="landing-brand-system">SIL Monitoring System</span>
            </div>
          </div>

          <h2 className="landing-hero-tagline">
            Supervised Industry Learning Monitoring System
          </h2>
          <p className="landing-hero-desc">
            Choose your portal to access your SIL activities, records, monitoring tools, and approvals.
          </p>
        </div>
      </header>

      {/* ── 2. Modern Portal Selection Section ── */}
      <main className="landing-portals-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Choose Your Portal</h2>
          <p className="landing-section-subtitle">
            Select the portal that matches your role in the Supervised Industry Learning process.
          </p>
        </div>

        <div className="portal-cards-wrapper" role="region" aria-label="Portal Selection">
          {/* STUDENT PORTAL */}
          <div
            className="portal-card student"
            onClick={() => handlePortalSelect('student')}
            onKeyDown={(e) => handleKeyDown(e, 'student')}
            role="button"
            tabIndex={0}
            aria-label="Enter Student Portal"
          >
            <div className="portal-card-badge">
              <SparkleIcon />
              <span>Student Access</span>
            </div>
            <div className="portal-card-icon-wrap" aria-hidden="true">
              <GraduationCapIcon />
            </div>
            <h3 className="portal-card-title">Student Portal</h3>
            <p className="portal-card-desc">
              Manage your SIL activities, daily time records, journals, requirements, and progress.
            </p>
            <div className="portal-card-action">
              <span>Enter Student Portal</span>
              <ArrowRightIcon />
            </div>
          </div>

          {/* ADVISER PORTAL */}
          <div
            className="portal-card adviser"
            onClick={() => handlePortalSelect('adviser')}
            onKeyDown={(e) => handleKeyDown(e, 'adviser')}
            role="button"
            tabIndex={0}
            aria-label="Enter Adviser Portal"
          >
            <div className="portal-card-icon-wrap" aria-hidden="true">
              <UserCheckIcon />
            </div>
            <h3 className="portal-card-title">Adviser Portal</h3>
            <p className="portal-card-desc">
              Monitor assigned sections, review student journals, track progress, and manage approvals.
            </p>
            <div className="portal-card-action">
              <span>Enter Adviser Portal</span>
              <ArrowRightIcon />
            </div>
          </div>

          {/* COORDINATOR PORTAL */}
          <div
            className="portal-card coordinator"
            onClick={() => handlePortalSelect('coordinator')}
            onKeyDown={(e) => handleKeyDown(e, 'coordinator')}
            role="button"
            tabIndex={0}
            aria-label="Enter Coordinator Portal"
          >
            <div className="portal-card-icon-wrap" aria-hidden="true">
              <ShieldUsersIcon />
            </div>
            <h3 className="portal-card-title">Coordinator Portal</h3>
            <p className="portal-card-desc">
              Manage students, advisers, sections, company assignments, records, and SIL approvals.
            </p>
            <div className="portal-card-action">
              <span>Enter Coordinator Portal</span>
              <ArrowRightIcon />
            </div>
          </div>

          {/* COMPANY PORTAL */}
          <div
            className="portal-card company"
            onClick={() => handlePortalSelect('company')}
            onKeyDown={(e) => handleKeyDown(e, 'company')}
            role="button"
            tabIndex={0}
            aria-label="Enter Company Portal"
          >
            <div className="portal-card-icon-wrap" aria-hidden="true">
              <BriefcaseIcon />
            </div>
            <h3 className="portal-card-title">Company Portal</h3>
            <p className="portal-card-desc">
              Monitor assigned interns, review journals, verify attendance, and evaluate student performance.
            </p>
            <div className="portal-card-action">
              <span>Enter Company Portal</span>
              <ArrowRightIcon />
            </div>
            <div>
              <button
                type="button"
                className="portal-card-info-link"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCompanyInfo(true);
                }}
              >
                Why is this portal optional?
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── 3. Subtle Information Section ── */}
      <section className="landing-info-section" aria-label="System Highlights">
        <div className="landing-info-inner">
          <h3 className="landing-info-title">One system. Every SIL role.</h3>
          <p className="landing-info-text">
            Asian College's SIL Monitoring System connects students, advisers, coordinators, and partner companies in one centralized platform.
          </p>
        </div>
      </section>

      {/* ── 4. Professional Minimal Footer ── */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-footer-brand-icon">
              <img src={silLogo} alt="Asian College SIL Logo" className="landing-footer-brand-img" />
            </div>
            <span className="landing-footer-brand-name">
              Asian College · SIL Monitoring System
            </span>
          </div>

          <p className="landing-footer-tagline">
            Supporting a more organized and transparent SIL experience.
          </p>

          <nav className="landing-footer-links" aria-label="Legal navigation">
            <button
              type="button"
              className="landing-footer-link"
              onClick={() => setShowTerms(true)}
            >
              Terms & Conditions
            </button>
            <button
              type="button"
              className="landing-footer-link"
              onClick={() => setShowPrivacy(true)}
            >
              Privacy Policy
            </button>
          </nav>

          <p className="landing-footer-copyright">
            © {new Date().getFullYear()} Asian College. All rights reserved.
          </p>
        </div>
      </footer>

      {/* ── Terms & Conditions Modal ── */}
      {showTerms && (
        <div
          className="lp-modal-overlay"
          onClick={() => setShowTerms(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-title"
        >
          <div className="lp-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 id="terms-title" className="lp-modal-title">Terms & Conditions</h3>
            <div className="lp-modal-body">
              <p><strong>1. Acceptance of Terms</strong><br />By accessing and using the SIL Monitoring System, you agree to be bound by these Terms and Conditions.</p>
              <p><strong>2. User Accounts</strong><br />You are responsible for maintaining the confidentiality of your account credentials. You must immediately notify the administration of any unauthorized use of your account.</p>
              <p><strong>3. Use of Service</strong><br />This system is strictly provided for tracking and managing Supervised Industry Learning (SIL) hours. Misuse, tampering, or falsification of attendance records is strictly prohibited and may result in disciplinary action.</p>
              <p><strong>4. Modifications</strong><br />We reserve the right to modify these terms at any time. Continued use of the application following any changes indicates your acceptance of the new terms.</p>
            </div>
            <div className="lp-modal-footer">
              <button
                type="button"
                className="lp-modal-close-btn"
                onClick={() => setShowTerms(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Privacy Policy Modal ── */}
      {showPrivacy && (
        <div
          className="lp-modal-overlay"
          onClick={() => setShowPrivacy(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
        >
          <div className="lp-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 id="privacy-title" className="lp-modal-title">Privacy Policy</h3>
            <div className="lp-modal-body">
              <p><strong>1. Data Collection</strong><br />We collect personal information (such as name and email) and location data (for geofenced clock-ins) strictly to facilitate the SIL program.</p>
              <p><strong>2. Data Usage</strong><br />Your data is used solely for educational monitoring, grading, and administrative purposes within Asian College.</p>
              <p><strong>3. Data Protection</strong><br />We implement robust security measures to protect your information against unauthorized access, alteration, or disclosure.</p>
              <p><strong>4. Third Parties</strong><br />We do not share your personal data with third parties without your explicit consent, unless required by law.</p>
            </div>
            <div className="lp-modal-footer">
              <button
                type="button"
                className="lp-modal-close-btn"
                onClick={() => setShowPrivacy(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Company Info Modal ── */}
      {showCompanyInfo && (
        <div
          className="lp-modal-overlay"
          onClick={() => setShowCompanyInfo(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="company-info-title"
        >
          <div className="lp-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 id="company-info-title" className="lp-modal-title">Why is the Company Portal Optional?</h3>
            <div className="lp-modal-body">
              <p>The Company Portal is designed to make it easier for supervisors to monitor interns, review daily journals, verify attendance, and submit performance evaluations online.</p>
              <p>However, we understand that not all partner companies may want or be able to adopt this digital system. If you prefer traditional methods, you can still opt to sign physical DTRs and paper evaluation forms instead of creating an account.</p>
              <p>Talk to the school coordinator to learn more about the best option for your company.</p>
            </div>
            <div className="lp-modal-footer">
              <button
                type="button"
                className="lp-modal-close-btn"
                onClick={() => setShowCompanyInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

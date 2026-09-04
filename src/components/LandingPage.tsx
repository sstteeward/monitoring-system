import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import './LandingPage.css';

import silLogo from '../assets/SIL.png';

// Line icons (lucide geometry) — no emojis anywhere on this page.
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const GraduationCapIcon = () => (
  <Icon>
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
    <path d="M22 10v6" />
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
  </Icon>
);

const UserRoundCheckIcon = () => (
  <Icon>
    <path d="M2 21a8 8 0 0 1 13.292-6" />
    <circle cx="10" cy="8" r="5" />
    <path d="m16 19 2 2 4-4" />
  </Icon>
);

const UsersRoundIcon = () => (
  <Icon>
    <path d="M18 21a8 8 0 0 0-16 0" />
    <circle cx="10" cy="8" r="5" />
    <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
  </Icon>
);

const BriefcaseBusinessIcon = () => (
  <Icon>
    <path d="M12 12h.01" />
    <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <path d="M22 13a18.15 18.15 0 0 1-20 0" />
    <rect width="20" height="14" x="2" y="6" rx="2" />
  </Icon>
);

const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </Icon>
);

const MoonIcon = () => (
  <Icon>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
);

const ArrowRightIcon = () => (
  <span className="arrow" aria-hidden="true">
    <Icon>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  </span>
);

type PortalRole = 'student' | 'adviser' | 'coordinator' | 'company';

const PORTALS: {
  role: PortalRole;
  label: string;
  title: string;
  description: string;
  Icon: () => React.ReactElement;
}[] = [
  {
    role: 'student',
    label: 'Student',
    title: 'Student Portal',
    description: 'Manage your SIL activities, attendance, journals, requirements, and OJT progress.',
    Icon: GraduationCapIcon,
  },
  {
    role: 'adviser',
    label: 'Adviser',
    title: 'Adviser Portal',
    description: 'Monitor assigned sections, review student journals, track progress, and manage approvals.',
    Icon: UserRoundCheckIcon,
  },
  {
    role: 'coordinator',
    label: 'Coordinator',
    title: 'Coordinator Portal',
    description: 'Manage students, advisers, sections, company assignments, records, and SIL approvals.',
    Icon: UsersRoundIcon,
  },
  {
    role: 'company',
    label: 'Company',
    title: 'Company Portal',
    description: 'Monitor assigned interns, review journals, verify attendance, and evaluate performance.',
    Icon: BriefcaseBusinessIcon,
  },
];

const PLATFORM_COLUMNS: { role: PortalRole; title: string; items: string[] }[] = [
  { role: 'student', title: 'Students', items: ['Activities', 'Journals', 'Attendance'] },
  { role: 'adviser', title: 'Advisers', items: ['Monitoring', 'Progress', 'Journal review'] },
  { role: 'coordinator', title: 'Coordinators', items: ['Approvals', 'Assignments', 'Records'] },
  { role: 'company', title: 'Companies', items: ['Verification', 'Evaluation', 'Supervision'] },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

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
      {/* ── 1. Compact Header ── */}
      <header className="lp-header" role="banner">
        <div className="lp-shell lp-header-inner">
          <div className="lp-brand">
            <span className="lp-brand-logo">
              <img src={silLogo} alt="Asian College SIL Logo" className="lp-brand-logo-img" />
            </span>
            <span className="lp-brand-text">
              <span className="lp-brand-name">
                <span className="asian">Asian</span> <span className="college">College</span>
              </span>
              <span className="lp-brand-system">SIL Monitoring System</span>
            </span>
          </div>

          <div className="lp-theme-toggle" data-active={theme} role="group" aria-label="Color theme">
            <span className="lp-theme-thumb" aria-hidden="true" />
            <button
              type="button"
              className="lp-theme-btn"
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              aria-label="Light mode"
              title="Light mode"
            >
              <SunIcon />
            </button>
            <button
              type="button"
              className="lp-theme-btn"
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              aria-label="Dark mode"
              title="Dark mode"
            >
              <MoonIcon />
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. Compact Hero ── */}
      <section className="lp-hero">
        <div className="lp-shell lp-hero-inner">
          <h1 className="lp-hero-title">
            <span className="asian">Asian</span> <span className="college">College</span> SIL Monitoring System
          </h1>
          <p className="lp-hero-tagline">Supervised Industry Learning Management Platform</p>
          <p className="lp-hero-desc">
            A centralized platform for managing SIL activities, attendance, journals, monitoring,
            approvals, and internship progress.
          </p>
        </div>
      </section>

      {/* ── 3. Portal Selection ── */}
      <main className="lp-portals">
        <div className="lp-shell">
          <div className="lp-section-header">
            <h2 className="lp-section-title">Choose Your Portal</h2>
            <p className="lp-section-subtitle">
              Select the portal that matches your role in the Supervised Industry Learning process.
            </p>
          </div>

          <div className="portal-cards-wrapper" role="region" aria-label="Portal Selection">
            {PORTALS.map(({ role, label, title, description, Icon: PortalIcon }) => (
              <div
                key={role}
                className={`portal-card ${role}`}
                onClick={() => handlePortalSelect(role)}
                onKeyDown={(e) => handleKeyDown(e, role)}
                role="button"
                tabIndex={0}
                aria-label={`Enter ${title}`}
              >
                <span className="portal-card-label">{label}</span>

                <span className="portal-card-icon-wrap" aria-hidden="true">
                  <PortalIcon />
                </span>

                <h3 className="portal-card-title">{title}</h3>
                <p className="portal-card-desc">{description}</p>

                <span className="portal-card-action">
                  <span>Enter {title}</span>
                  <ArrowRightIcon />
                </span>

                {role === 'company' && (
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
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── 4. Platform Information ── */}
      <section className="lp-platform" aria-label="System Highlights">
        <div className="lp-shell lp-platform-inner">
          <h2 className="lp-platform-title">One platform for the entire SIL journey</h2>
          <div className="lp-platform-grid">
            {PLATFORM_COLUMNS.map(({ role, title, items }) => (
              <div key={role} className={`lp-platform-col ${role}`}>
                <h3 className="lp-platform-col-title">{title}</h3>
                <ul className="lp-platform-list">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Compact Footer ── */}
      <footer className="lp-footer" role="contentinfo">
        <div className="lp-shell lp-footer-inner">
          <div className="lp-footer-left">
            <div className="lp-footer-brand">
              <span className="lp-footer-brand-icon">
                <img src={silLogo} alt="Asian College SIL Logo" className="lp-footer-brand-img" />
              </span>
              <span className="lp-footer-brand-name">
                <span className="asian">Asian</span> <span className="college">College</span> · SIL Monitoring System
              </span>
            </div>
            <p className="lp-footer-tagline">
              Supporting a more organized and transparent SIL experience.
            </p>
          </div>

          <div className="lp-footer-right">
            <nav className="lp-footer-links" aria-label="Legal navigation">
              <button type="button" className="lp-footer-link" onClick={() => setShowTerms(true)}>
                Terms &amp; Conditions
              </button>
              <button type="button" className="lp-footer-link" onClick={() => setShowPrivacy(true)}>
                Privacy Policy
              </button>
            </nav>
            <p className="lp-footer-copyright">
              © {new Date().getFullYear()} Asian College. All rights reserved.
            </p>
          </div>
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

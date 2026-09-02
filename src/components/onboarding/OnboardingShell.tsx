/**
 * Page chrome shared by every onboarding flow: brand header, stepper, card,
 * error banner and the Back / Continue action row.
 *
 * The Adviser onboarding is the design reference — this component holds that
 * layout so Student, Coordinator and Company render identically and only their
 * fields differ.
 */
import React from 'react';
import OnboardingStepper from './OnboardingStepper';
import './OnboardingShell.css';

interface OnboardingShellProps {
    /** Brand icon shown in the green circle. */
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    steps: string[];
    /** 1-based current step. */
    current: number;
    /** Jump back to an already-completed step. */
    onStepSelect?: (step: number) => void;
    error?: string | null;
    footnote?: React.ReactNode;
    children: React.ReactNode;
}

const OnboardingShell: React.FC<OnboardingShellProps> = ({
    icon,
    title,
    subtitle,
    steps,
    current,
    onStepSelect,
    error,
    footnote,
    children,
}) => (
    <div className="onb-page">
        <div className="onb-container">
            <div className="onb-header">
                <div className="onb-icon">{icon}</div>
                <h1 className="onb-title">{title}</h1>
                {subtitle && <p className="onb-subtitle">{subtitle}</p>}
            </div>

            <OnboardingStepper steps={steps} current={current} onStepSelect={onStepSelect} />

            <div className="onb-card">
                {error && (
                    <div className="onb-error" role="alert">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}
                {children}
            </div>

            {footnote && <p className="onb-footnote">{footnote}</p>}
        </div>
    </div>
);

interface OnboardingActionsProps {
    /** Omit on the first step so only Continue is shown. */
    onBack?: () => void;
    backLabel?: string;
    nextLabel?: string;
    /** Disables both buttons while the profile is being saved. */
    busy?: boolean;
    /** Disables only the Continue / Confirm button. */
    nextDisabled?: boolean;
}

/** Back | Continue. The next button submits the surrounding <form>. */
export const OnboardingActions: React.FC<OnboardingActionsProps> = ({
    onBack,
    backLabel = '← Back',
    nextLabel = 'Continue →',
    busy = false,
    nextDisabled = false,
}) => (
    <div className={`onb-actions${onBack ? '' : ' end'}`}>
        {onBack && (
            <button type="button" className="onb-btn-back" onClick={onBack} disabled={busy}>
                {backLabel}
            </button>
        )}
        <button type="submit" className="onb-btn-next" disabled={busy || nextDisabled}>
            {nextLabel}
        </button>
    </div>
);

export default OnboardingShell;

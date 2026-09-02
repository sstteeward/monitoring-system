/**
 * Step indicator shared by every onboarding flow.
 *
 * Desktop  ① Personal → ② Address → ③ Information → ④ Review
 * Mobile   "Step 2 of 4 — Address" with a progress bar.
 *
 * Completed steps show a check and can be clicked to jump back; the wizard
 * keeps all form state in the parent, so nothing is lost when jumping.
 */
import React from 'react';

interface OnboardingStepperProps {
    /** Short labels, in order. Length defines the number of steps. */
    steps: string[];
    /** 1-based index of the step currently being shown. */
    current: number;
    /** Called when a completed step is clicked. Omit to disable jumping. */
    onStepSelect?: (step: number) => void;
}

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const OnboardingStepper: React.FC<OnboardingStepperProps> = ({ steps, current, onStepSelect }) => {
    const total = steps.length;
    const percent = total > 1 ? ((current - 1) / (total - 1)) * 100 : 100;

    return (
        <>
            {/* Desktop / tablet */}
            <div className="onb-stepper" role="list" aria-label={`Step ${current} of ${total}`}>
                {steps.map((label, index) => {
                    const stepNumber = index + 1;
                    const isCompleted = stepNumber < current;
                    const isCurrent = stepNumber === current;
                    const canJump = isCompleted && Boolean(onStepSelect);

                    return (
                        <React.Fragment key={label}>
                            {index > 0 && <span className={`onb-step-line${isCompleted || isCurrent ? ' done' : ''}`} aria-hidden="true" />}
                            <button
                                type="button"
                                role="listitem"
                                className={`onb-step${isCompleted ? ' completed' : ''}${isCurrent ? ' current' : ''}${canJump ? ' clickable' : ''}`}
                                onClick={canJump ? () => onStepSelect?.(stepNumber) : undefined}
                                disabled={!canJump}
                                aria-current={isCurrent ? 'step' : undefined}
                                title={canJump ? `Go back to ${label}` : label}
                            >
                                <span className="onb-step-circle">
                                    {isCompleted ? <CheckIcon /> : stepNumber}
                                </span>
                                <span className="onb-step-label">{label}</span>
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Mobile */}
            <div className="onb-stepper-mobile" aria-hidden="true">
                <div className="onb-stepper-mobile-top">
                    <span className="onb-stepper-count">Step {current} of {total}</span>
                    <span className="onb-stepper-name">{steps[current - 1]}</span>
                </div>
                <div className="onb-stepper-track">
                    <div className="onb-stepper-fill" style={{ width: `${Math.max(percent, 8)}%` }} />
                </div>
            </div>
        </>
    );
};

export default OnboardingStepper;

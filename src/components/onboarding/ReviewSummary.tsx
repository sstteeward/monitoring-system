/**
 * Step 4 "Review & Confirm" summary, shared by all onboarding flows.
 *
 * Each section carries the step it came from, so its Edit button takes the user
 * straight back to that step. Form state lives in the wizard, so editing and
 * returning to the review never loses data.
 */
import React from 'react';

export interface ReviewRow {
    label: string;
    value?: React.ReactNode;
    /** Span the full width (long values such as an address). */
    full?: boolean;
}

export interface ReviewSectionData {
    title: string;
    /** 1-based step this section is edited on. */
    step: number;
    rows: ReviewRow[];
}

interface ReviewSummaryProps {
    sections: ReviewSectionData[];
    onEdit: (step: number) => void;
}

const isEmpty = (value: React.ReactNode) =>
    value === null || value === undefined || (typeof value === 'string' && !value.trim());

const ReviewSummary: React.FC<ReviewSummaryProps> = ({ sections, onEdit }) => (
    <div className="onb-review">
        {sections.map(section => (
            <section className="onb-review-section" key={`${section.title}-${section.step}`}>
                <header className="onb-review-head">
                    <h4>{section.title}</h4>
                    <button
                        type="button"
                        className="onb-review-edit"
                        onClick={() => onEdit(section.step)}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        Edit
                    </button>
                </header>
                <div className="onb-review-grid">
                    {section.rows.map(row => (
                        <div className={`onb-review-row${row.full ? ' full' : ''}`} key={row.label}>
                            <span className="onb-review-label">{row.label}</span>
                            <span className={`onb-review-value${isEmpty(row.value) ? ' empty' : ''}`}>
                                {isEmpty(row.value) ? 'Not provided' : row.value}
                            </span>
                        </div>
                    ))}
                </div>
            </section>
        ))}
    </div>
);

export default ReviewSummary;

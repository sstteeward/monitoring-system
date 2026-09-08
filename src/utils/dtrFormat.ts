// Formatting shared by the student's DTR submission panel and the adviser's
// review screen, so a submission reads the same to the person who sends it and
// the person who approves it.
//
// Kept free of React so it can also be exercised by the Node test runner.

import type { DtrStatus } from '../services/dtrSubmissionService';

/** `485` -> `8h 5m`. Zero is a real value, so it renders as `0m`, not an em dash. */
export const formatDtrHours = (minutes: number): string => {
    const safe = Math.max(0, Math.round(minutes || 0));
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h ${m}m`;
};

/** `2026-08-04` + `2026-09-08` -> `Aug 4 – Sep 8, 2026`. */
export const formatDtrPeriod = (from: string | null, to: string | null): string => {
    const parse = (v: string | null) => {
        if (!v) return null;
        // Parsed as a local date: `new Date('2026-08-04')` is UTC midnight, which
        // renders as the previous day for anyone west of Greenwich.
        const d = new Date(`${v}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    };
    const a = parse(from);
    const b = parse(to);

    if (!a && !b) return '—';
    if (!a || !b) {
        const one = (a ?? b) as Date;
        return one.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // The year is stated once when both ends share it.
    if (a.getFullYear() === b.getFullYear()) return `${short(a)} – ${short(b)}, ${b.getFullYear()}`;
    const full = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${full(a)} – ${full(b)}`;
};

export const DTR_STATUS_LABEL: Record<DtrStatus, string> = {
    pending: 'Pending Review',
    approved: 'Approved',
    revision_requested: 'Revision Required',
};

/** The submission-history event names, as the two portals show them. */
export const DTR_EVENT_LABEL: Record<string, string> = {
    submitted: 'Submitted',
    resubmitted: 'Resubmitted',
    revision_requested: 'Revision requested',
    approved: 'Approved',
};

import React from 'react';
import type { DtrStatus } from '../services/dtrSubmissionService';
import { DTR_STATUS_LABEL } from '../utils/dtrFormat';

/** One badge shape for a DTR's status, wherever it appears. */
export const DtrStatusBadge: React.FC<{ status: DtrStatus }> = ({ status }) => (
    <span className={`dtr-status-badge is-${status}`}>
        <i /> {DTR_STATUS_LABEL[status]}
    </span>
);

export default DtrStatusBadge;

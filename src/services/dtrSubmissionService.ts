// Final DTR submission & review.
//
// The adviser approves ONE complete Daily Time Record, not each clock-in. This
// service is the only client path into that workflow; there is deliberately no
// per-timesheet approve/reject call here or in adviserService.
//
// Every RPC is scoped by the database to auth.uid(): a student can only submit
// their own DTR, the recipient adviser is resolved from the student's section
// (never sent by the client), and an adviser can only read or review the
// submissions addressed to them.
//
// See supabase_dtr_submissions.sql.

import { supabase } from '../lib/supabaseClient';

export type DtrStatus = 'pending' | 'approved' | 'revision_requested';

/** What the student's DTR page shows, driven entirely by the server. */
export type DtrState =
  | 'in_progress'
  | 'ready'
  | 'pending_review'
  | 'approved'
  | 'revision_required';

export type IssueSeverity = 'blocking' | 'advisory';

export interface DtrIssue {
  code: string;
  label: string;
  severity: IssueSeverity;
  /** Present on the flat `issues` list, absent on a day's own list. */
  date?: string;
}

/** One day of the record. */
export interface DtrDay {
  date: string;
  weekday: string;
  time_in: string | null;
  time_out: string | null;
  sessions: number;
  open_sessions: number;
  /** Rendered minutes for the day, breaks excluded. */
  minutes: number;
  break_minutes: number;
  recorded_status: string | null;
  remarks: string | null;
  blocking: boolean;
  issues: DtrIssue[];
}

export interface DtrSummary {
  required_hours: number;
  required_minutes: number;
  total_minutes: number;
  remaining_minutes: number;
  completion_pct: number;
  working_days: number;
  recorded_days: number;
  late_days: number;
  absent_days: number;
  incomplete_days: number;
  overtime_minutes: number;
  period_start: string | null;
  period_end: string | null;
}

export interface DtrEvent {
  event:
    | 'submitted'
    | 'resubmitted'
    | 'revision_requested'
    | 'approved'
    | 'admin_approved'
    | 'admin_revision_requested'
    | 'reopened'
    | 'reviewer_reassigned';
  actor: string | null;
  remarks: string | null;
  created_at: string;
}

/** The computed record, shared by the student page and the adviser's snapshot. */
export interface DtrComputation {
  student: {
    id: string;
    profile_id: string;
    name: string | null;
    email: string | null;
    section: string | null;
    company_id: string | null;
    company: string | null;
  };
  settings: { daily_limit_minutes: number; time_zone: string };
  summary: DtrSummary;
  days: DtrDay[];
  issues: DtrIssue[];
  hours_met: boolean;
  has_blocking: boolean;
  can_submit: boolean;
  computed_at: string;
}

/** The student's own view: the computation plus their submission, if any. */
export interface MyDtrStatus extends DtrComputation {
  state: DtrState;
  adviser: {
    id: string;
    name: string | null;
    adviser_type: string | null;
    section: string | null;
  } | null;
  submission: {
    id: string;
    status: DtrStatus;
    submitted_at: string;
    reviewed_at: string | null;
    adviser_remarks: string | null;
    attempt: number;
    total_minutes: number;
    required_hours: number;
    period_start: string | null;
    period_end: string | null;
    reviewer: string | null;
    history: DtrEvent[];
  } | null;
}

/** One row of the adviser's approval queue. */
export interface DtrSubmissionRow {
  id: string;
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  section_name: string | null;
  company_name: string | null;
  period_start: string | null;
  period_end: string | null;
  required_hours: number;
  total_minutes: number;
  working_days: number;
  status: DtrStatus;
  submitted_at: string;
  reviewed_at: string | null;
  adviser_remarks: string | null;
  attempt: number;
}

/**
 * One row of the admin's cross-adviser DTR list. Adds the reviewer's identity
 * and the "needs attention" signal (a pending DTR whose reviewer is missing,
 * deactivated, or no longer the student's section adviser).
 */
export interface AdminDtrSubmissionRow extends DtrSubmissionRow {
  adviser_id: string | null;
  adviser_name: string | null;
  adviser_active: boolean;
  current_adviser_id: string | null;
  needs_attention: boolean;
}

/** The filter chips on the admin DTR list. */
export type AdminDtrFilter = DtrStatus | 'all' | 'needs_attention';

/** One complete submission, as the student sent it. */
export interface DtrSubmissionDetail extends Omit<DtrSubmissionRow, 'student_email'> {
  student_email: string | null;
  reviewer: string | null;
  /** The record frozen at submit time — NOT a fresh computation. */
  snapshot: DtrComputation;
  history: DtrEvent[];
}

/**
 * Turns a Postgres failure into something a student or adviser can act on.
 * The workflow guards raise deliberate, readable messages; anything that smells
 * of a driver or schema problem is replaced.
 */
export function mapDtrError(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
      ? String((error as { message?: string }).message ?? '')
      : String(error ?? '');
  const text = raw.toLowerCase();

  if (!raw) return 'Something went wrong. Please try again.';
  if (text.includes('not authenticated')) return 'Your session has expired. Please sign in again.';
  if (
    text.includes('could not find the function')
    || text.includes('pgrst')
    || text.includes('does not exist')
  ) {
    return 'The DTR submission workflow has not been set up on this system yet. Ask an administrator to run supabase_dtr_submissions.sql.';
  }
  if (
    text.includes('column') || text.includes('violates') || text.includes('sqlstate')
    || text.includes('permission denied') || text.includes('row-level security')
    || text.includes('42501') || text.includes('relation')
  ) {
    return 'Something went wrong. Please try again.';
  }
  // A short, deliberate message from the workflow reads fine as-is.
  return raw.length < 250 ? raw : 'Something went wrong. Please try again.';
}

export const dtrSubmissionService = {
  // ── Student ───────────────────────────────────────────────────────────────

  /** The student's DTR, their submission state, and their assigned adviser. */
  async getMyStatus(): Promise<MyDtrStatus> {
    const { data, error } = await supabase.rpc('get_my_dtr_status');
    if (error) {
      console.error('get_my_dtr_status failed:', error);
      throw new Error(mapDtrError(error));
    }
    return data as MyDtrStatus;
  },

  /**
   * Submit the complete DTR to the assigned adviser.
   *
   * Returns `{ submitted: false, reason: 'already_pending' }` rather than
   * throwing when one is already under review, so a double-click cannot create
   * a second approval task.
   */
  async submit(): Promise<{ submitted: boolean; reason?: string; submission_id?: string; attempt?: number }> {
    const { data, error } = await supabase.rpc('submit_my_dtr');
    if (error) {
      console.error('submit_my_dtr failed:', error);
      throw new Error(mapDtrError(error));
    }
    return data as { submitted: boolean; reason?: string; submission_id?: string; attempt?: number };
  },

  // ── Adviser ───────────────────────────────────────────────────────────────

  /** The approval queue: one row per submission, never per attendance record. */
  async listForAdviser(status?: DtrStatus | 'all'): Promise<DtrSubmissionRow[]> {
    const { data, error } = await supabase.rpc('get_adviser_dtr_submissions', {
      p_status: status && status !== 'all' ? status : null,
    });
    if (error) {
      console.error('get_adviser_dtr_submissions failed:', error);
      throw new Error(mapDtrError(error));
    }
    return (data || []) as DtrSubmissionRow[];
  },

  /** One complete submitted DTR, for the review screen. */
  async get(id: string): Promise<DtrSubmissionDetail> {
    const { data, error } = await supabase.rpc('get_dtr_submission', { p_id: id });
    if (error) {
      console.error('get_dtr_submission failed:', error);
      throw new Error(mapDtrError(error));
    }
    return data as DtrSubmissionDetail;
  },

  /** Approve, or send the DTR back with remarks the student can act on. */
  async review(
    id: string,
    action: 'approve' | 'request_revision',
    remarks?: string,
  ): Promise<{ status: DtrStatus }> {
    const { data, error } = await supabase.rpc('review_dtr_submission', {
      p_id: id,
      p_action: action,
      p_remarks: remarks ?? null,
    });
    if (error) {
      console.error('review_dtr_submission failed:', error);
      throw new Error(mapDtrError(error));
    }
    return data as { status: DtrStatus };
  },

  /**
   * How many DTRs are waiting for this adviser.
   *
   * The badge counts SUBMISSIONS: a student with 25 attendance days still
   * counts as one.
   */
  async pendingCount(): Promise<number> {
    const rows = await this.listForAdviser('pending');
    return rows.length;
  },

  // ── Admin (force control) ───────────────────────────────────────────────────
  // Every method below is gated in the database by public.is_admin(); the server
  // row is the audit record, so there is no client-side createAuditLog call.

  /** Every submission across all advisers, with the "needs attention" signal. */
  async listForAdmin(filter?: AdminDtrFilter): Promise<AdminDtrSubmissionRow[]> {
    const { data, error } = await supabase.rpc('get_admin_dtr_submissions', {
      p_status: filter && filter !== 'all' ? filter : null,
    });
    if (error) {
      console.error('get_admin_dtr_submissions failed:', error);
      throw new Error(mapDtrError(error));
    }
    return (data || []) as AdminDtrSubmissionRow[];
  },

  /** Approve, request a revision on, or reopen a submission, as an administrator. */
  async adminReview(
    id: string,
    action: 'approve' | 'request_revision' | 'reopen',
    reason: string,
  ): Promise<{ status: DtrStatus }> {
    const { data, error } = await supabase.rpc('admin_review_dtr_submission', {
      p_id: id,
      p_action: action,
      p_reason: reason,
    });
    if (error) {
      console.error('admin_review_dtr_submission failed:', error);
      throw new Error(mapDtrError(error));
    }
    return data as { status: DtrStatus };
  },

  /**
   * Reassign the reviewer of an open submission. Pass `null` to hand it to the
   * student's current section adviser.
   */
  async reassignReviewer(
    id: string,
    adviserId: string | null,
    reason: string,
  ): Promise<{ adviser_id: string | null; adviser_name: string | null; status: DtrStatus }> {
    const { data, error } = await supabase.rpc('admin_reassign_dtr_reviewer', {
      p_id: id,
      p_adviser_id: adviserId,
      p_reason: reason,
    });
    if (error) {
      console.error('admin_reassign_dtr_reviewer failed:', error);
      throw new Error(mapDtrError(error));
    }
    return data as { adviser_id: string | null; adviser_name: string | null; status: DtrStatus };
  },

  /** How many submissions currently need an administrator's attention. */
  async needsAttentionCount(): Promise<number> {
    const rows = await this.listForAdmin('needs_attention');
    return rows.length;
  },
};

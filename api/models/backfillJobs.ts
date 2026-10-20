// Mirrors the backfill_job_statuses definition table.
export type iBackfillJobStatus = "pending_payment" | "awaiting_issue" | "ready" | "painting" | "done" | "failed" | "cancelled";

// The job statuses that lock a selection - mirrors backfill_job_statuses.locks_design
// and the idx_backfill_jobs_one_locking_per_selection predicate (a test checks all three agree).
export const LOCKING_JOB_STATUSES: iBackfillJobStatus[] = ["awaiting_issue", "ready", "painting"];

// The admin console's paint-job filters, each a set of job statuses.
export const ADMIN_JOB_FILTERS = {
    needs_attention: ["failed"],
    in_progress: ["awaiting_issue", "ready", "painting"],
    painted: ["done"],
    cancelled: ["cancelled"],
    pending_payment: ["pending_payment"],
} as const satisfies Record<string, readonly iBackfillJobStatus[]>;

export type iAdminJobFilter = keyof typeof ADMIN_JOB_FILTERS;

// An admin can retry only a failed job, and cancel any job the backfill
// Action isn't in the middle of painting.
export const RETRYABLE_JOB_STATUSES: iBackfillJobStatus[] = ["failed"];
export const CANCELLABLE_JOB_STATUSES: iBackfillJobStatus[] = ["pending_payment", "awaiting_issue", "ready", "failed"];

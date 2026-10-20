// Mirrors the backfill_job_statuses definition table.
export type iBackfillJobStatus = "pending_payment" | "awaiting_issue" | "ready" | "painting" | "done" | "failed" | "cancelled";

// The job statuses that lock a selection - mirrors backfill_job_statuses.locks_design
// and the idx_backfill_jobs_one_locking_per_selection predicate (a test checks all three agree).
export const LOCKING_JOB_STATUSES: iBackfillJobStatus[] = ["awaiting_issue", "ready", "painting"];

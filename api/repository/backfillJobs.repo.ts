import type { PoolClient } from "pg";
import pool from "../config/db";
import { logger } from "../config/logger";

import {
    iBackfillJobStatus,
    LOCKING_JOB_STATUSES,
    RETRYABLE_JOB_STATUSES,
    CANCELLABLE_JOB_STATUSES,
} from "../models/backfillJobs";

/** What a job paints - copied from the selection + design when checkout starts. */
export interface iPaintSnapshot {
    year: number;
    pattern: number[];
    start_date: string;
    custom_range: boolean;
}

// define the type of the return object from the repo() method
export interface iBackfillJobsRepo {
    createPending: (selectionId: string, snapshot: iPaintSnapshot, paymentIntentId: string, client?: PoolClient) => Promise<any>;
    markPaid: (paymentIntentId: string, client?: PoolClient) => Promise<any>;
    cancelByPaymentIntent: (paymentIntentId: string) => Promise<any>;
    getLatestForUserAndDesign: (userId: string, designId: string) => Promise<any>;
    getLockingForUserAndDesign: (userId: string, designId: string) => Promise<any>;
    markIssueOpened: (id: string, issueUrl: string) => Promise<any>;
    claimReady: () => Promise<any[]>;
    setStatus: (id: string, status: iBackfillJobStatus, lastError?: string | null) => Promise<any>;
    getPaintDetails: (jobIds: string[]) => Promise<any[]>;
    adminList: (statuses: readonly iBackfillJobStatus[] | null) => Promise<any[]>;
    adminCountsByStatus: () => Promise<Record<string, number>>;
    adminGetById: (jobId: string) => Promise<any | undefined>;
    retry: (jobId: string, client?: PoolClient) => Promise<any | undefined>;
    cancel: (jobId: string, client?: PoolClient) => Promise<any | undefined>;
}

// A job as the admin console shows it: whose, which design, and its
// status's wording from the backfill_job_statuses definitions.
const ADMIN_JOB_SELECT = `
    SELECT bj.*
        , st.label AS status_label
        , ds.user_id
        , ds.design_id
        , u.github_username
        , d.name AS design_name
    FROM backfill_jobs bj
    JOIN backfill_job_statuses st ON st.code = bj.status
    JOIN design_selections ds ON ds.id = bj.selection_id
    JOIN users u ON u.id = ds.user_id
    JOIN designs d ON d.id = ds.design_id
`;

// main repo init function to be called in the service factories
const repo = (): iBackfillJobsRepo => {
    // One job per payment intent: checkout re-uses its payment intent for a
    // retried attempt, so a repeat call hands back the job (and copy) it
    // already made rather than making another.
    const createPending = async (selectionId: string, snapshot: iPaintSnapshot, paymentIntentId: string, client?: PoolClient) => {
        try {
            const sqlString = `
                INSERT INTO backfill_jobs (selection_id, status, year, pattern, start_date, custom_range, stripe_payment_intent_id)
                VALUES ($1, 'pending_payment', $2, $3, $4, $5, $6)
                ON CONFLICT ON CONSTRAINT backfill_jobs_stripe_payment_intent_id_unique
                DO UPDATE SET stripe_payment_intent_id = backfill_jobs.stripe_payment_intent_id
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [
                selectionId,
                snapshot.year,
                snapshot.pattern,
                snapshot.start_date,
                snapshot.custom_range,
                paymentIntentId,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // pending_payment -> awaiting_issue (the design locks), unless another
    // job already has this selection locked - then this paid job is
    // cancelled instead (the payment stands, as a donation, like any repeat
    // purchase). The unique locking index backs this up against two
    // deliveries racing: the loser errors, and Stripe's redelivery then
    // lands in the cancelled branch. Returns undefined if there's no
    // pending job for the payment (already handled, or unknown).
    const markPaid = async (paymentIntentId: string, client?: PoolClient) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs bj
                SET status = CASE WHEN target.blocked THEN 'cancelled' ELSE 'awaiting_issue' END
                    , completed_at = CASE WHEN target.blocked THEN NOW() END
                    , updated_at = NOW()
                FROM (
                    SELECT pending.id
                        , EXISTS (
                            SELECT 1 FROM backfill_jobs other
                            WHERE other.selection_id = pending.selection_id
                              AND other.id <> pending.id
                              AND other.status = ANY($2::text[])
                        ) AS blocked
                    FROM backfill_jobs pending
                    WHERE pending.stripe_payment_intent_id = $1 AND pending.status = 'pending_payment'
                ) target
                WHERE bj.id = target.id
                RETURNING bj.*;
            `;
            const result = await (client ?? pool).query(sqlString, [paymentIntentId, LOCKING_JOB_STATUSES]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const cancelByPaymentIntent = async (paymentIntentId: string) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs
                SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
                WHERE stripe_payment_intent_id = $1 AND status = 'pending_payment'
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [paymentIntentId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // the user's most recent job for a design, whatever its status
    const getLatestForUserAndDesign = async (userId: string, designId: string) => {
        try {
            const sqlString = `
                SELECT bj.*
                FROM backfill_jobs bj
                JOIN design_selections ds ON ds.id = bj.selection_id
                WHERE ds.user_id = $1 AND ds.design_id = $2
                ORDER BY bj.created_at DESC
                LIMIT 1;
            `;
            const result = await pool.query(sqlString, [userId, designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // the job currently locking the user's selection of a design, if any
    const getLockingForUserAndDesign = async (userId: string, designId: string) => {
        try {
            const sqlString = `
                SELECT bj.*
                FROM backfill_jobs bj
                JOIN design_selections ds ON ds.id = bj.selection_id
                WHERE ds.user_id = $1 AND ds.design_id = $2 AND bj.status = ANY($3::text[]);
            `;
            const result = await pool.query(sqlString, [userId, designId, LOCKING_JOB_STATUSES]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const markIssueOpened = async (id: string, issueUrl: string) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs
                SET issue_url = $2, status = 'ready', updated_at = NOW()
                WHERE id = $1
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [id, issueUrl]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // ready -> painting in one statement, so two overlapping Action runs
    // can't both pick up the same job (SKIP LOCKED leaves rows another
    // claim is mid-update on to that claim)
    const claimReady = async () => {
        try {
            const sqlString = `
                UPDATE backfill_jobs
                SET status = 'painting', updated_at = NOW()
                WHERE id IN (
                    SELECT id FROM backfill_jobs
                    WHERE status = 'ready'
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *;
            `;
            const result = await pool.query(sqlString);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // finished statuses also stamp completed_at; lastError is kept only
    // for a failed job (the backfill Action's message, when it sends one)
    const setStatus = async (id: string, status: iBackfillJobStatus, lastError: string | null = null) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs bj
                SET status = $2
                    , completed_at = CASE WHEN s.is_finished THEN NOW() ELSE NULL END
                    , last_error = CASE WHEN $2 = 'failed' THEN $3 ELSE NULL END
                    , updated_at = NOW()
                FROM backfill_job_statuses s
                WHERE bj.id = $1 AND s.code = $2
                RETURNING bj.*;
            `;
            const result = await pool.query(sqlString, [id, status, lastError]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // everything needed to expand a claimed job into commits: who to author
    // as, which timezone to stamp in, and the job's own copy of what to
    // paint - never the live design, which may have been edited since.
    const getPaintDetails = async (jobIds: string[]) => {
        if (jobIds.length === 0) return [];
        try {
            const sqlString = `
                SELECT bj.id AS job_id
                    , bj.year
                    , bj.pattern
                    , bj.start_date
                    , bj.custom_range
                    , u.id AS user_id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , u.email
                    , COALESCE(up.use_real_email, FALSE) AS use_real_email
                    , COALESCE(up.timezone, 'UTC') AS timezone
                    , ds.design_id
                FROM backfill_jobs bj
                JOIN design_selections ds ON ds.id = bj.selection_id
                JOIN users u ON u.id = ds.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                WHERE bj.id = ANY($1::uuid[]);
            `;
            const result = await pool.query(sqlString, [jobIds]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // newest first; `statuses` null = every job
    const adminList = async (statuses: readonly iBackfillJobStatus[] | null) => {
        try {
            const sqlString = `
                ${ADMIN_JOB_SELECT}
                WHERE ($1::text[] IS NULL OR bj.status = ANY($1::text[]))
                ORDER BY bj.updated_at DESC
                LIMIT 200;
            `;
            const result = await pool.query(sqlString, [statuses]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const adminCountsByStatus = async () => {
        try {
            const result = await pool.query(`SELECT status, COUNT(*)::int AS count FROM backfill_jobs GROUP BY status;`);
            return Object.fromEntries(result.rows.map((r: { status: string; count: number }) => [r.status, r.count]));

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const adminGetById = async (jobId: string) => {
        try {
            const result = await pool.query(`${ADMIN_JOB_SELECT} WHERE bj.id = $1;`, [jobId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // failed -> back in the queue to repaint from its same copy: ready, or
    // awaiting_issue if the canvas issue was never opened. That re-locks the
    // selection, so another job already locking it trips
    // idx_backfill_jobs_one_locking_per_selection (the caller turns that
    // into a 409). Returns undefined if the job isn't retryable.
    const retry = async (jobId: string, client?: PoolClient) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs
                SET status = CASE WHEN issue_url IS NULL THEN 'awaiting_issue' ELSE 'ready' END
                    , completed_at = NULL
                    , last_error = NULL
                    , updated_at = NOW()
                WHERE id = $1 AND status = ANY($2::text[])
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [jobId, RETRYABLE_JOB_STATUSES]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Returns undefined if the job can't be cancelled (painting, or finished).
    const cancel = async (jobId: string, client?: PoolClient) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs
                SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND status = ANY($2::text[])
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [jobId, CANCELLABLE_JOB_STATUSES]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        adminList,
        adminCountsByStatus,
        adminGetById,
        retry,
        cancel,
        createPending,
        markPaid,
        cancelByPaymentIntent,
        getLatestForUserAndDesign,
        getLockingForUserAndDesign,
        markIssueOpened,
        claimReady,
        setStatus,
        getPaintDetails,
    }
};

export default { repo };

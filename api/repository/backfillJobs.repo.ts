import type { PoolClient } from "pg";
import pool from "../config/db";
import { logger } from "../config/logger";

export type iBackfillJobStatus = "awaiting_issue" | "ready" | "painting" | "done" | "failed";

// define the type of the return object from the repo() method
export interface iBackfillJobsRepo {
    create: (userId: string, designId: string, year: number, client?: PoolClient) => Promise<any>;
    getByUserAndDesign: (userId: string, designId: string) => Promise<any>;
    markIssueOpened: (id: string, issueUrl: string) => Promise<any>;
    claimReady: () => Promise<any[]>;
    setStatus: (id: string, status: iBackfillJobStatus) => Promise<any>;
    getPaintDetails: (jobIds: string[]) => Promise<any[]>;
}

// main repo init function to be called in the service factories
const repo = (): iBackfillJobsRepo => {
    // a redelivered payment webhook must not create a second job - the
    // no-op DO UPDATE makes RETURNING hand back the existing row. `client`
    // lets the payment webhook create it inside its ledger transaction.
    const create = async (userId: string, designId: string, year: number, client?: PoolClient) => {
        try {
            const sqlString = `
                INSERT INTO backfill_jobs (user_id, design_id, year)
                VALUES ($1, $2, $3)
                ON CONFLICT ON CONSTRAINT backfill_jobs_user_design_unique
                DO UPDATE SET user_id = backfill_jobs.user_id
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [userId, designId, year]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getByUserAndDesign = async (userId: string, designId: string) => {
        try {
            const sqlString = `SELECT * FROM backfill_jobs WHERE user_id = $1 AND design_id = $2;`;
            const result = await pool.query(sqlString, [userId, designId]);
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

    const setStatus = async (id: string, status: iBackfillJobStatus) => {
        try {
            const sqlString = `
                UPDATE backfill_jobs
                SET status = $2, updated_at = NOW()
                WHERE id = $1
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [id, status]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // everything needed to expand a claimed job into commits: who to author
    // as, which timezone to stamp in, and the design + its schedule. A job
    // whose selection has since been deleted has no row here.
    const getPaintDetails = async (jobIds: string[]) => {
        if (jobIds.length === 0) return [];
        try {
            const sqlString = `
                SELECT bj.id AS job_id
                    , bj.year
                    , u.id AS user_id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , u.email
                    , COALESCE(up.use_real_email, FALSE) AS use_real_email
                    , COALESCE(up.timezone, 'UTC') AS timezone
                    , bj.design_id
                    , ds.start_date
                    , ds.repeat_indefinitely
                    , ds.recurrence_end_date
                    , ds.custom_range
                    , d.pattern
                FROM backfill_jobs bj
                JOIN users u ON u.id = bj.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                JOIN design_selections ds ON ds.user_id = bj.user_id AND ds.design_id = bj.design_id
                JOIN designs d ON d.id = bj.design_id
                WHERE bj.id = ANY($1::uuid[]);
            `;
            const result = await pool.query(sqlString, [jobIds]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        create,
        getByUserAndDesign,
        markIssueOpened,
        claimReady,
        setStatus,
        getPaintDetails,
    }
};

export default { repo };

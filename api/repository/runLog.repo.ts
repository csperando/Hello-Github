import pool from "../config/db";
import { logger } from "../config/logger";

export type iRunLogStatus = "committed" | "failed";

export interface iRunLogCreateInput {
    user_id: string;
    design_id?: string | null;
    target_date: string;
    commit_count: number;
    status: iRunLogStatus;
}

// define the type of the return object from the repo() method
export interface iRunLogRepo {
    create: (input: iRunLogCreateInput) => Promise<any>;
    existsForUserAndDate: (userId: string, targetDate: string) => Promise<boolean>;
    pruneOlderThan: (days: number) => Promise<number>;
    getLatestPerDesignForUser: (userId: string) => Promise<any[]>;
    getCommittedDatesForUser: (userId: string, from: string, to: string) => Promise<string[]>;
}

// main repo init function to be called in the service factories
const repo = (): iRunLogRepo => {
    const create = async (input: iRunLogCreateInput) => {
        try {
            const sqlString = `
                INSERT INTO run_log (
                    user_id
                    , design_id
                    , target_date
                    , commit_count
                    , status
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `;

            const result = await pool.query(sqlString, [
                input.user_id,
                input.design_id ?? null,
                input.target_date,
                input.commit_count,
                input.status,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const existsForUserAndDate = async (userId: string, targetDate: string) => {
        try {
            const sqlString = `SELECT EXISTS(SELECT 1 FROM run_log WHERE user_id = $1 AND target_date = $2) AS exists;`;
            const result = await pool.query(sqlString, [userId, targetDate]);
            return result.rows[0].exists as boolean;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // based on created_at (when the row was logged), not target_date - a simple,
    // standard retention policy matching db/backup-db.sh's own file-age pruning.
    const pruneOlderThan = async (days: number) => {
        try {
            const sqlString = `DELETE FROM run_log WHERE created_at < NOW() - ($1 || ' days')::interval RETURNING id;`;
            const result = await pool.query(sqlString, [days]);
            return result.rowCount ?? 0;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Only a design's own author would ever see this be non-empty for more
    // than one row per design_id in practice (design_id is set at insert
    // time, before any deletion), one per design the user has ever run.
    const getLatestPerDesignForUser = async (userId: string) => {
        try {
            const sqlString = `
                SELECT DISTINCT ON (design_id) design_id, target_date, commit_count, status, created_at
                FROM run_log
                WHERE user_id = $1 AND design_id IS NOT NULL
                ORDER BY design_id, created_at DESC;
            `;
            const result = await pool.query(sqlString, [userId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // dates this app is already known to have painted for a user, within a
    // range - used to exclude those days when recomputing their q, so our
    // own painted commits never feed back into the calculation (see
    // .claude/tmp/goal.md's feedback-loop mitigation). 'failed' rows are
    // deliberately excluded: a failed run likely means no commit actually
    // landed that day, so it's still valid organic signal.
    const getCommittedDatesForUser = async (userId: string, from: string, to: string) => {
        try {
            const sqlString = `
                SELECT target_date FROM run_log
                WHERE user_id = $1 AND status = 'committed' AND target_date BETWEEN $2 AND $3;
            `;
            const result = await pool.query(sqlString, [userId, from, to]);
            return result.rows.map((row: { target_date: string }) => row.target_date);

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        create,
        existsForUserAndDate,
        pruneOlderThan,
        getLatestPerDesignForUser,
        getCommittedDatesForUser,
    }
};

export default { repo };

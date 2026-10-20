import pool from "../config/db";
import { logger } from "../config/logger";
import { iDesignSelectionCreateInput, iDesignSelectionUpdateInput } from "../models/designs";
import { LOCKING_JOB_STATUSES } from "../models/backfillJobs";

// A selection's paint status, worked out from its jobs (codes defined in
// design_paint_statuses): locked while a job locks it; otherwise from its
// latest done/failed job - painted only while that job's copy still matches
// the design exactly, so any edit since makes it unpainted again (and undoing
// the edit makes it painted again). Cancelled jobs never count. Expects the
// selection aliased as s, its design as d, and the locking statuses as $1.
const PAINT_STATUS_SELECT = `
    CASE
        WHEN locking.id IS NOT NULL THEN 'locked'
        WHEN latest.status = 'failed' THEN 'error'
        WHEN latest.status = 'done'
            AND latest.pattern = d.pattern
            AND latest.year = s.year
            AND latest.start_date = s.start_date
            AND latest.custom_range = s.custom_range
            THEN 'painted'
        ELSE 'unpainted'
    END AS paint_status
`;
const PAINT_STATUS_JOINS = `
    LEFT JOIN LATERAL (
        SELECT id FROM backfill_jobs
        WHERE selection_id = s.id AND status = ANY($1::text[])
        LIMIT 1
    ) locking ON TRUE
    LEFT JOIN LATERAL (
        SELECT status, pattern, year, start_date, custom_range FROM backfill_jobs
        WHERE selection_id = s.id AND status IN ('done', 'failed')
        ORDER BY completed_at DESC
        LIMIT 1
    ) latest ON TRUE
`;

// define the type of the return object from the repo() method
export interface iDesignSelectionsRepo {
    create: (userId: string, designId: string, input: iDesignSelectionCreateInput, client?: any) => Promise<any>;
    getByUserAndDesign: (userId: string, designId: string) => Promise<any>;
    softDelete: (userId: string, designId: string, client?: any) => Promise<any>;
    adminListForUser: (userId: string) => Promise<any[]>;
    restore: (userId: string, designId: string, client?: any) => Promise<any>;
    getAllForUser: (userId: string) => Promise<any>;
    update: (userId: string, designId: string, input: iDesignSelectionUpdateInput) => Promise<any>;
    countActiveExcludingUser: (designId: string, excludingUserId: string) => Promise<number>;
    setActiveExclusive: (userId: string, designId: string) => Promise<any>;
    deactivateActiveForUser: (userId: string) => Promise<any[]>;
}

// main repo init function to be called in the service factories
const repo = (): iDesignSelectionsRepo => {
    // is_active defaults to FALSE (not TRUE) when omitted: a freshly created/selected
    // design shouldn't silently start painting the user's graph, especially if they
    // already have a different active selection - activation is a separate, explicit
    // step (see update()) so it can't unexpectedly conflict with the one-active-per-
    // user constraint during ordinary creation.
    const create = async (userId: string, designId: string, input: iDesignSelectionCreateInput, client: any = pool) => {
        try {
            const sqlString = `
                INSERT INTO design_selections (
                    user_id
                    , design_id
                    , is_active
                    , start_date
                    , year
                    , custom_range
                    , repeat_indefinitely
                    , recurrence_end_date
                ) VALUES ($1, $2, COALESCE($3, FALSE), $4, $5, COALESCE($6, FALSE), COALESCE($7, FALSE), $8)
                RETURNING *;
            `;

            const result = await client.query(sqlString, [
                userId,
                designId,
                input.is_active ?? null,
                input.start_date,
                input.year,
                input.custom_range ?? null,
                input.repeat_indefinitely ?? null,
                input.recurrence_end_date ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getByUserAndDesign = async (userId: string, designId: string) => {
        try {
            const sqlString = `
                SELECT s.*
                    , ${PAINT_STATUS_SELECT}
                FROM design_selections s
                JOIN designs d ON d.id = s.design_id
                ${PAINT_STATUS_JOINS}
                WHERE s.user_id = $2 AND s.design_id = $3 AND s.deleted_at IS NULL;
            `;
            const result = await pool.query(sqlString, [LOCKING_JOB_STATUSES, userId, designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getAllForUser = async (userId: string) => {
        try {
            const sqlString = `
                SELECT s.id
                    , s.user_id
                    , s.design_id
                    , s.is_active
                    , s.start_date
                    , s.year
                    , s.custom_range
                    , s.repeat_indefinitely
                    , s.recurrence_end_date
                    , s.created_at
                    , s.updated_at
                    , d.name
                    , d.is_public
                    , d.pattern
                    , d.user_id AS design_owner_id
                    , ${PAINT_STATUS_SELECT}
                FROM design_selections s
                JOIN designs d ON d.id = s.design_id
                ${PAINT_STATUS_JOINS}
                WHERE s.user_id = $2 AND s.deleted_at IS NULL
                ORDER BY s.created_at DESC;
            `;
            const result = await pool.query(sqlString, [LOCKING_JOB_STATUSES, userId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const update = async (userId: string, designId: string, input: iDesignSelectionUpdateInput) => {
        try {
            // recurrence_end_date needs true three-state PATCH semantics (absent = leave
            // as-is, explicit null = clear it) - a plain COALESCE (like every other field
            // below) can never write NULL back once a value's been set, which would make
            // it impossible to switch a bounded-repeat selection back to indefinite.
            const recurrenceEndDateProvided = Object.prototype.hasOwnProperty.call(input, "recurrence_end_date");

            const sqlString = `
                UPDATE design_selections
                SET is_active = COALESCE($3, is_active)
                    , start_date = COALESCE($4, start_date)
                    , repeat_indefinitely = COALESCE($5, repeat_indefinitely)
                    , recurrence_end_date = CASE WHEN $6::boolean THEN $7::date ELSE recurrence_end_date END
                    , year = COALESCE($8, year)
                    , custom_range = COALESCE($9, custom_range)
                    , updated_at = NOW()
                WHERE user_id = $1 AND design_id = $2 AND deleted_at IS NULL
                RETURNING *;
            `;

            const result = await pool.query(sqlString, [
                userId,
                designId,
                input.is_active ?? null,
                input.start_date ?? null,
                input.repeat_indefinitely ?? null,
                recurrenceEndDateProvided,
                input.recurrence_end_date ?? null,
                input.year ?? null,
                input.custom_range ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Hidden from the user from now on, and no longer active - the row (and
    // any paint jobs under it) stays.
    const softDelete = async (userId: string, designId: string, client: any = pool) => {
        try {
            const sqlString = `
                UPDATE design_selections
                SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
                WHERE user_id = $1 AND design_id = $2 AND deleted_at IS NULL
                RETURNING id;
            `;
            const result = await client.query(sqlString, [userId, designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // admin-only: every selection the user has, deleted ones included, each
    // with its design and worked-out paint_status
    const adminListForUser = async (userId: string) => {
        try {
            const sqlString = `
                SELECT s.id
                    , s.design_id
                    , s.year
                    , s.start_date
                    , s.custom_range
                    , s.deleted_at
                    , s.created_at
                    , d.name
                    , d.user_id AS design_owner_id
                    , d.deleted_at AS design_deleted_at
                    , ${PAINT_STATUS_SELECT}
                FROM design_selections s
                JOIN designs d ON d.id = s.design_id
                ${PAINT_STATUS_JOINS}
                WHERE s.user_id = $2
                ORDER BY s.created_at DESC;
            `;
            const result = await pool.query(sqlString, [LOCKING_JOB_STATUSES, userId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // admin-only: undo a soft delete. Stays inactive - activation is its own step.
    const restore = async (userId: string, designId: string, client: any = pool) => {
        try {
            const sqlString = `
                UPDATE design_selections
                SET deleted_at = NULL, updated_at = NOW()
                WHERE user_id = $1 AND design_id = $2 AND deleted_at IS NOT NULL
                RETURNING id;
            `;
            const result = await client.query(sqlString, [userId, designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const countActiveExcludingUser = async (designId: string, excludingUserId: string) => {
        try {
            const sqlString = `
                SELECT COUNT(*)::int AS count
                FROM design_selections
                WHERE design_id = $1 AND is_active AND user_id != $2 AND deleted_at IS NULL;
            `;
            const result = await pool.query(sqlString, [designId, excludingUserId]);
            return result.rows[0].count as number;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Activate one selection and deactivate any other the user has active,
    // atomically - used when a payment webhook activates the design a user
    // just paid for and they still had a stale active selection from before
    // payments existed (which would otherwise trip the one-active-per-user
    // partial unique index).
    const setActiveExclusive = async (userId: string, designId: string) => {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `UPDATE design_selections SET is_active = FALSE, updated_at = NOW()
                 WHERE user_id = $1 AND is_active AND design_id <> $2;`,
                [userId, designId],
            );
            const result = await client.query(
                `UPDATE design_selections SET is_active = TRUE, updated_at = NOW()
                 WHERE user_id = $1 AND design_id = $2 RETURNING *;`,
                [userId, designId],
            );
            await client.query("COMMIT");
            return result.rows[0];

        } catch(err: any) {
            await client.query("ROLLBACK");
            logger.error(err);
            throw(err);
        } finally {
            client.release();
        }
    }

    // Deactivate whatever the user currently has active - used on lapse
    // (paid period expired, refund, dispute). Returns the affected design ids.
    const deactivateActiveForUser = async (userId: string) => {
        try {
            const result = await pool.query(
                `UPDATE design_selections SET is_active = FALSE, updated_at = NOW()
                 WHERE user_id = $1 AND is_active RETURNING design_id;`,
                [userId],
            );
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        create,
        getByUserAndDesign,
        softDelete,
        adminListForUser,
        restore,
        getAllForUser,
        update,
        countActiveExcludingUser,
        setActiveExclusive,
        deactivateActiveForUser,
    }
};

export default { repo };

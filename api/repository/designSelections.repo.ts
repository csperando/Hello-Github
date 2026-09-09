import pool from "../config/db";
import { logger } from "../config/logger";
import { iDesignSelectionCreateInput, iDesignSelectionUpdateInput } from "../models/designs";

// define the type of the return object from the repo() method
export interface iDesignSelectionsRepo {
    create: (userId: string, designId: string, input: iDesignSelectionCreateInput, client?: any) => Promise<any>;
    getByUserAndDesign: (userId: string, designId: string) => Promise<any>;
    getAllForUser: (userId: string) => Promise<any>;
    update: (userId: string, designId: string, input: iDesignSelectionUpdateInput) => Promise<any>;
    delete: (userId: string, designId: string, client?: any) => Promise<any>;
    countForDesign: (designId: string, client?: any) => Promise<number>;
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
                    , repeat_indefinitely
                    , recurrence_end_date
                ) VALUES ($1, $2, COALESCE($3, FALSE), $4, COALESCE($5, FALSE), $6)
                RETURNING *;
            `;

            const result = await client.query(sqlString, [
                userId,
                designId,
                input.is_active ?? null,
                input.start_date,
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
            const sqlString = `SELECT * FROM design_selections WHERE user_id = $1 AND design_id = $2;`;
            const result = await pool.query(sqlString, [userId, designId]);
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
                    , s.repeat_indefinitely
                    , s.recurrence_end_date
                    , s.created_at
                    , s.updated_at
                    , d.name
                    , d.is_public
                    , d.pattern
                    , d.user_id AS design_owner_id
                FROM design_selections s
                JOIN designs d ON d.id = s.design_id
                WHERE s.user_id = $1
                ORDER BY s.created_at DESC;
            `;
            const result = await pool.query(sqlString, [userId]);
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
                    , updated_at = NOW()
                WHERE user_id = $1 AND design_id = $2
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
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const deleteSelection = async (userId: string, designId: string, client: any = pool) => {
        try {
            const sqlString = `DELETE FROM design_selections WHERE user_id = $1 AND design_id = $2 RETURNING id;`;
            const result = await client.query(sqlString, [userId, designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const countForDesign = async (designId: string, client: any = pool) => {
        try {
            const sqlString = `SELECT COUNT(*)::int AS count FROM design_selections WHERE design_id = $1;`;
            const result = await client.query(sqlString, [designId]);
            return result.rows[0].count as number;

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
                WHERE design_id = $1 AND is_active AND user_id != $2;
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
        getAllForUser,
        update,
        delete: deleteSelection,
        countForDesign,
        countActiveExcludingUser,
        setActiveExclusive,
        deactivateActiveForUser,
    }
};

export default { repo };

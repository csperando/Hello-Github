import pool from "../config/db";
import { logger } from "../config/logger";
import { iDesignCreateInput, iDesignUpdateInput } from "../models/designs";

// define the type of the return object from the repo() method
export interface iDesignsRepo {
    create: (userId: string, input: iDesignCreateInput) => Promise<any>;
    getById: (designId: string) => Promise<any>;
    getAllByUserId: (userId: string) => Promise<any>;
    update: (designId: string, input: iDesignUpdateInput) => Promise<any>;
    delete: (designId: string) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iDesignsRepo => {
    const create = async (userId: string, input: iDesignCreateInput) => {
        try {
            const sqlString = `
                INSERT INTO designs (
                    user_id
                    , name
                    , is_public
                    , start_date
                    , end_date
                    , pattern
                    , repeat_indefinitely
                    , recurrence_end_date
                ) VALUES ($1, COALESCE($2, 'untitled design'), COALESCE($3, FALSE), $4, $5, $6, COALESCE($7, FALSE), $8)
                RETURNING *;
            `;

            const result = await pool.query(sqlString, [
                userId,
                input.name ?? null,
                input.is_public ?? null,
                input.start_date,
                input.end_date,
                input.pattern,
                input.repeat_indefinitely ?? null,
                input.recurrence_end_date ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getById = async (designId: string) => {
        try {
            const sqlString = `SELECT * FROM designs WHERE id = $1;`;
            const result = await pool.query(sqlString, [designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getAllByUserId = async (userId: string) => {
        try {
            const sqlString = `SELECT * FROM designs WHERE user_id = $1 ORDER BY created_at DESC;`;
            const result = await pool.query(sqlString, [userId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const update = async (designId: string, input: iDesignUpdateInput) => {
        try {
            // recurrence_end_date needs true three-state PATCH semantics (absent = leave
            // as-is, explicit null = clear it) since it's the only nullable, clearable
            // column here - a plain COALESCE (like every other field below) can never
            // write NULL back once a value's been set, which would make it impossible to
            // switch a bounded-repeat design back to indefinite.
            const recurrenceEndDateProvided = Object.prototype.hasOwnProperty.call(input, "recurrence_end_date");

            const sqlString = `
                UPDATE designs
                SET name = COALESCE($2, name)
                    , is_public = COALESCE($3, is_public)
                    , start_date = COALESCE($4, start_date)
                    , end_date = COALESCE($5, end_date)
                    , pattern = COALESCE($6, pattern)
                    , repeat_indefinitely = COALESCE($7, repeat_indefinitely)
                    , recurrence_end_date = CASE WHEN $8::boolean THEN $9::date ELSE recurrence_end_date END
                    , updated_at = NOW()
                WHERE id = $1
                RETURNING *;
            `;

            const result = await pool.query(sqlString, [
                designId,
                input.name ?? null,
                input.is_public ?? null,
                input.start_date ?? null,
                input.end_date ?? null,
                input.pattern ?? null,
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

    const deleteDesign = async (designId: string) => {
        try {
            const sqlString = `DELETE FROM designs WHERE id = $1 RETURNING id;`;
            const result = await pool.query(sqlString, [designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        create,
        getById,
        getAllByUserId,
        update,
        delete: deleteDesign,
    }
};

export default { repo };

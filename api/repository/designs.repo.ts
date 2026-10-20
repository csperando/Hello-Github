import pool from "../config/db";
import { logger } from "../config/logger";
import { iDesignUpdateInput } from "../models/designs";

export interface iDesignContentInput {
    name?: String;
    is_public?: Boolean;
    pattern: Number[];
}

// define the type of the return object from the repo() method
export interface iDesignsRepo {
    create: (userId: string, input: iDesignContentInput, client?: any) => Promise<any>;
    getById: (designId: string) => Promise<any>;
    getAllByUserId: (userId: string) => Promise<any>;
    update: (designId: string, input: iDesignUpdateInput) => Promise<any>;
    softDelete: (designId: string, client?: any) => Promise<any>;
    restore: (designId: string, client?: any) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iDesignsRepo => {
    const create = async (userId: string, input: iDesignContentInput, client: any = pool) => {
        try {
            const sqlString = `
                INSERT INTO designs (
                    user_id
                    , name
                    , is_public
                    , pattern
                ) VALUES ($1, COALESCE($2, 'untitled design'), COALESCE($3, FALSE), $4)
                RETURNING *;
            `;

            const result = await client.query(sqlString, [
                userId,
                input.name ?? null,
                input.is_public ?? null,
                input.pattern,
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
            const sqlString = `SELECT * FROM designs WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC;`;
            const result = await pool.query(sqlString, [userId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const update = async (designId: string, input: iDesignUpdateInput) => {
        try {
            const sqlString = `
                UPDATE designs
                SET name = COALESCE($2, name)
                    , is_public = COALESCE($3, is_public)
                    , pattern = COALESCE($4, pattern)
                    , updated_at = NOW()
                WHERE id = $1
                RETURNING *;
            `;

            const result = await pool.query(sqlString, [
                designId,
                input.name ?? null,
                input.is_public ?? null,
                input.pattern ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Can't be newly selected from now on; content stays readable through
    // any selection that already points at it (getById still returns it).
    const softDelete = async (designId: string, client: any = pool) => {
        try {
            const sqlString = `
                UPDATE designs SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING id;
            `;
            const result = await client.query(sqlString, [designId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // admin-only: undo a soft delete, making the design selectable again
    const restore = async (designId: string, client: any = pool) => {
        try {
            const sqlString = `
                UPDATE designs SET deleted_at = NULL, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NOT NULL
                RETURNING id;
            `;
            const result = await client.query(sqlString, [designId]);
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
        softDelete,
        restore,
    }
};

export default { repo };

import pool from "../config/db";
import { logger } from "../config/logger";
import { iProfileUpdateInput } from "../models/users";

// define the type of the return object from the repo() method
export interface iUserProfileRepo {
    upsert: (userId: string, input: iProfileUpdateInput) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iUserProfileRepo => {
    const upsert = async (userId: string, input: iProfileUpdateInput) => {
        try {
            const sqlString = `
                INSERT INTO user_profiles (
                    user_id
                    , display_name
                    , default_charity
                    , public_opt_in
                ) VALUES ($1, $2, $3, COALESCE($4, TRUE))
                ON CONFLICT (user_id) DO UPDATE
                SET display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name)
                    , default_charity = COALESCE(EXCLUDED.default_charity, user_profiles.default_charity)
                    -- reference $4 directly rather than EXCLUDED.public_opt_in: the VALUES
                    -- clause already defaults a missing $4 to TRUE (to satisfy NOT NULL on
                    -- insert), which would otherwise mask "not provided" and clobber an
                    -- existing false value with true on a partial update.
                    , public_opt_in = COALESCE($4, user_profiles.public_opt_in)
                    , updated_at = NOW()
                RETURNING user_id
                    , display_name
                    , default_charity
                    , public_opt_in
                    , created_at
                    , updated_at;
            `;

            const result = await pool.query(sqlString, [
                userId,
                input.display_name ?? null,
                input.default_charity ?? null,
                input.public_opt_in ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        upsert,
    }
};

export default { repo };

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
                    , timezone
                    , use_real_email
                ) VALUES ($1, $2, $3, COALESCE($4, TRUE), COALESCE($5, 'UTC'), COALESCE($6, FALSE))
                ON CONFLICT (user_id) DO UPDATE
                SET display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name)
                    , default_charity = COALESCE(EXCLUDED.default_charity, user_profiles.default_charity)
                    -- reference $4/$5/$6 directly rather than EXCLUDED.*: the VALUES clause
                    -- already defaults a missing param (to satisfy NOT NULL on insert), which
                    -- would otherwise mask "not provided" and clobber an existing non-default
                    -- value on a partial update.
                    , public_opt_in = COALESCE($4, user_profiles.public_opt_in)
                    , timezone = COALESCE($5, user_profiles.timezone)
                    , use_real_email = COALESCE($6, user_profiles.use_real_email)
                    , updated_at = NOW()
                RETURNING user_id
                    , display_name
                    , default_charity
                    , public_opt_in
                    , timezone
                    , use_real_email
                    , created_at
                    , updated_at;
            `;

            const result = await pool.query(sqlString, [
                userId,
                input.display_name ?? null,
                input.default_charity ?? null,
                input.public_opt_in ?? null,
                input.timezone ?? null,
                input.use_real_email ?? null,
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

import pool from "../config/db";
import { logger } from "../config/logger";
import { iUser, iGitHubUpsertInput } from "../models/users";

// define the type of the return object from the repo() method
export interface iUserRepo {
    getAllUsers: () => Promise<any>;
    getUserById: (userId: string) => Promise<any>;
    getUserByGitHubId: (userId: number) => Promise<any>;
    upsertFromGitHub: (input: iGitHubUpsertInput) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iUserRepo => {
    const getAllUsers = async () => {
        try {
            const sqlString = `
                SELECT u.id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , u.github_node_id
                    , u.github_profile_url
                    , u.avatar_url
                    , u.email
                    , u.name
                    , u.bio
                    , u.role
                    , u.is_active
                    , p.display_name
                    , p.default_charity
                    , COALESCE(p.public_opt_in, TRUE) AS public_opt_in
                    , COALESCE(p.timezone, 'UTC') AS timezone
                    , COALESCE(p.use_real_email, FALSE) AS use_real_email
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id;
            `
            const result = await pool.query(sqlString);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getUserById = async (userId: string) => {
        try {
            const sqlString = `
                SELECT u.id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , u.github_node_id
                    , u.github_profile_url
                    , u.avatar_url
                    , u.email
                    , u.name
                    , u.bio
                    , u.role
                    , u.is_active
                    , p.display_name
                    , p.default_charity
                    , COALESCE(p.public_opt_in, TRUE) AS public_opt_in
                    , COALESCE(p.timezone, 'UTC') AS timezone
                    , COALESCE(p.use_real_email, FALSE) AS use_real_email
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE u.id = $1;
            `

            const result = await pool.query(sqlString, [userId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getUserByGitHubId = async (ghId: number) => {
        try {
            const sqlString = `
                SELECT u.id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , u.github_node_id
                    , u.github_profile_url
                    , u.avatar_url
                    , u.email
                    , u.name
                    , u.bio
                    , u.role
                    , u.is_active
                    , p.display_name
                    , p.default_charity
                    , COALESCE(p.public_opt_in, TRUE) AS public_opt_in
                    , COALESCE(p.timezone, 'UTC') AS timezone
                    , COALESCE(p.use_real_email, FALSE) AS use_real_email
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE u.github_id = $1;
            `

            const result = await pool.query(sqlString, [ghId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const upsertFromGitHub = async (input: iGitHubUpsertInput) => {
        try {
            const sqlString = `
                INSERT INTO users (
                    github_id
                    , github_username
                    , github_email
                    , github_node_id
                    , github_profile_url
                    , avatar_url
                    , last_login_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (github_id) DO UPDATE
                SET github_username = EXCLUDED.github_username
                    , github_email = EXCLUDED.github_email
                    , github_node_id = EXCLUDED.github_node_id
                    , github_profile_url = EXCLUDED.github_profile_url
                    , avatar_url = EXCLUDED.avatar_url
                    , updated_at = NOW()
                    , last_login_at = NOW()
                RETURNING id
                    , github_id
                    , github_username
                    , github_email
                    , github_node_id
                    , github_profile_url
                    , avatar_url
                    , email
                    , name
                    , bio
                    , role
                    , is_active
                    , last_login_at
                    , (xmax = 0) AS inserted;
            `

            const result = await pool.query(sqlString, [
                input.github_id,
                input.github_username,
                input.github_email,
                input.github_node_id,
                input.github_profile_url,
                input.avatar_url,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        getAllUsers,
        getUserById,
        getUserByGitHubId,
        upsertFromGitHub,
    }
};

export default { repo };

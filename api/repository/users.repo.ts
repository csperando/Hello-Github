import pool from "../config/db";
import { logger } from "../config/logger";
import { toContainsPattern } from "./sqlPatterns";
import { iUser, iGitHubUpsertInput } from "../models/users";

// define the type of the return object from the repo() method
export interface iUserRepo {
    getAllUsers: () => Promise<any>;
    getUserById: (userId: string) => Promise<any>;
    getUserByGitHubUsername: (ghUsername: string) => Promise<any>;
    getUserByGitHubId: (ghId: number) => Promise<any>;
    upsertFromGitHub: (input: iGitHubUpsertInput) => Promise<any>;
    insertFromGitHub: (input: iGitHubUpsertInput) => Promise<any>;
    updateEmailPreference: (userId: string, email: string) => Promise<any>;
    adminSearch: (search: string | null) => Promise<any[]>;
    setRoleAndActive: (userId: string, input: { role?: string; is_active?: boolean }, client?: any) => Promise<any>;
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
                    , u.github_noreply_email
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
                    , u.github_noreply_email
                    , u.github_node_id
                    , u.github_profile_url
                    , u.avatar_url
                    , u.email
                    , u.name
                    , u.bio
                    , u.role
                    , u.is_active
                    , u.created_at
                    , p.display_name
                    , p.default_charity
                    , COALESCE(p.public_opt_in, TRUE) AS public_opt_in
                    , COALESCE(p.timezone, 'UTC') AS timezone
                    , COALESCE(p.use_real_email, FALSE) AS use_real_email
                    , b.paid_until
                    , COALESCE(b.auto_renew, FALSE) AS auto_renew
                    , b.subscription_status
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                LEFT JOIN user_billing b ON b.user_id = u.id
                WHERE u.id = $1;
            `

            const result = await pool.query(sqlString, [userId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getUserByGitHubUsername = async (ghUsername: string) => {
        try {
            const sqlString = `
                SELECT u.id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , u.github_noreply_email
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
                WHERE u.github_username = $1;
            `

            const result = await pool.query(sqlString, [ghUsername]);
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
                    , u.github_noreply_email
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
                    , github_noreply_email
                    , github_node_id
                    , github_profile_url
                    , avatar_url
                    , last_login_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (github_id) DO UPDATE
                SET github_username = EXCLUDED.github_username
                    , github_email = EXCLUDED.github_email
                    , github_noreply_email = EXCLUDED.github_noreply_email
                    , github_node_id = EXCLUDED.github_node_id
                    , github_profile_url = EXCLUDED.github_profile_url
                    , avatar_url = EXCLUDED.avatar_url
                    , updated_at = NOW()
                    , last_login_at = NOW()
                    -- email deliberately not in this SET list: it's the
                    -- user's chosen effective address, only resynced by
                    -- UserService.updateProfile on a profile save, not
                    -- silently rewritten here on every login.
                RETURNING id
                    , github_id
                    , github_username
                    , github_email
                    , github_noreply_email
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
                input.github_noreply_email,
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

    const insertFromGitHub = async (input: iGitHubUpsertInput) => {
        try {
            const sqlString = `
                INSERT INTO users (
                    github_id
                    , github_username
                    , github_email
                    , github_noreply_email
                    , github_node_id
                    , github_profile_url
                    , avatar_url
                    , last_login_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (github_id) DO NOTHING
                RETURNING id
                    , github_id
                    , github_username
                    , github_email
                    , github_noreply_email
                    , github_node_id
                    , github_profile_url
                    , avatar_url
                    , email
                    , name
                    , bio
                    , role
                    , is_active
                    , last_login_at;
            `

            const result = await pool.query(sqlString, [
                input.github_id,
                input.github_username,
                input.github_email,
                input.github_noreply_email,
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

    const updateEmailPreference = async (userId: string, email: string) => {
        try {
            const sqlString = `
                UPDATE users
                SET email = $2
                    , updated_at = NOW()
                WHERE id = $1
                RETURNING id, email;
            `

            const result = await pool.query(sqlString, [userId, email]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // newest first, with what each has contributed (refunds taken off);
    // matches username, display name or email. Capped - the console searches.
    const adminSearch = async (search: string | null) => {
        try {
            const sqlString = `
                SELECT u.id
                    , u.github_username
                    , u.email
                    , u.role
                    , u.is_active
                    , u.created_at
                    , p.display_name
                    , COALESCE((
                        SELECT SUM(pay.amount_total_cents - pay.amount_refunded_cents)
                        FROM payments pay WHERE pay.user_id = u.id
                    ), 0)::int AS contributed_cents
                FROM users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE $1::text IS NULL
                    OR u.github_username ILIKE $1
                    OR p.display_name ILIKE $1
                    OR u.email ILIKE $1
                ORDER BY u.created_at DESC
                LIMIT 200;
            `;
            const result = await pool.query(sqlString, [search ? toContainsPattern(search) : null]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // admin-only: role and whether the account can sign in
    const setRoleAndActive = async (userId: string, input: { role?: string; is_active?: boolean }, client: any = pool) => {
        try {
            const sqlString = `
                UPDATE users
                SET role = COALESCE($2, role)
                    , is_active = COALESCE($3, is_active)
                    , updated_at = NOW()
                WHERE id = $1
                RETURNING id, role, is_active;
            `;
            const result = await client.query(sqlString, [userId, input.role ?? null, input.is_active ?? null]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        getAllUsers,
        getUserById,
        getUserByGitHubUsername,
        getUserByGitHubId,
        upsertFromGitHub,
        insertFromGitHub,
        updateEmailPreference,
        adminSearch,
        setRoleAndActive,
    }
};

export default { repo };

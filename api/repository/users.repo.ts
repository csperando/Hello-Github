import pool from "../config/db";
import { logger } from "../config/logger";
import { iUser } from "../models/users";

// define the type of the return object from the repo() method
export interface iUserRepo {
    getAllUsers: () => Promise<any>;
    getUserById: (userId: string) => Promise<any>;
    getUserByGitHubId: (userId: number) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iUserRepo => {
    const getAllUsers = async () => {
        try {
            const sqlString = `
                SELECT id
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
                FROM users;
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
                SELECT id
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
                FROM users
                WHERE id = $1;
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
                SELECT id
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
                FROM users
                WHERE github_id = $1;
            `
            
            const result = await pool.query(sqlString, [ghId]);
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
    }
};

export default { repo };

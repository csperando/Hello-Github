import pool from "../config/db";
import { logger } from "../config/logger";

export interface iUpsertContributionsInput {
    user_id: string;
    year: number;
    q: number | null;
    commit_counts: number[] | null;
    max_level_2_contribution: number | null;
}

export interface iActiveContributionUser {
    user_id: string;
    github_username: string;
}

// define the type of the return object from the repo() method
export interface iUsersContributionsRepo {
    upsert: (input: iUpsertContributionsInput) => Promise<any>;
    findByUserId: (userId: string) => Promise<any | null>;
    findActiveUsers: () => Promise<iActiveContributionUser[]>;
}

// main repo init function to be called in the service factories
const repo = (): iUsersContributionsRepo => {
    // rolls the previously-stored year's q/commit_counts into
    // previous_year_q/previous_year_commit_counts only when the stored year
    // differs from the incoming one - a same-year refresh leaves the
    // existing previous_year_* fallback untouched.
    const upsert = async (input: iUpsertContributionsInput) => {
        try {
            const sqlString = `
                INSERT INTO users_contributions (
                    user_id
                    , year
                    , q
                    , commit_counts
                    , max_level_2_contribution
                    , computed_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    year = EXCLUDED.year
                    , q = EXCLUDED.q
                    , commit_counts = EXCLUDED.commit_counts
                    , max_level_2_contribution = EXCLUDED.max_level_2_contribution
                    , previous_year_q = CASE
                        WHEN users_contributions.year IS DISTINCT FROM EXCLUDED.year THEN users_contributions.q
                        ELSE users_contributions.previous_year_q
                    END
                    , previous_year_commit_counts = CASE
                        WHEN users_contributions.year IS DISTINCT FROM EXCLUDED.year THEN users_contributions.commit_counts
                        ELSE users_contributions.previous_year_commit_counts
                    END
                    , computed_at = NOW()
                RETURNING *;
            `;

            const result = await pool.query(sqlString, [
                input.user_id,
                input.year,
                input.q,
                input.commit_counts,
                input.max_level_2_contribution,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const findByUserId = async (userId: string) => {
        try {
            const sqlString = `SELECT * FROM users_contributions WHERE user_id = $1;`;
            const result = await pool.query(sqlString, [userId]);
            return result.rows[0] ?? null;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // distinct users worth refreshing a q for - only those with an active
    // design selection AND a current paid period actually paint, mirroring
    // scheduler.repo.ts's gating.
    const findActiveUsers = async () => {
        try {
            const sqlString = `
                SELECT DISTINCT u.id AS user_id, u.github_username
                FROM users u
                JOIN design_selections ds ON ds.user_id = u.id AND ds.is_active
                JOIN user_billing ub ON ub.user_id = u.id AND ub.paid_until > NOW()
                WHERE u.is_active;
            `;
            const result = await pool.query(sqlString);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        upsert,
        findByUserId,
        findActiveUsers,
    }
};

export default { repo };

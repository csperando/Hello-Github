import pool from "../config/db";
import { logger } from "../config/logger";

// define the type of the return object from the repo() method
export interface iSchedulerRepo {
    findDueCandidates: (windowStartHour?: number, windowEndHourExclusive?: number) => Promise<any[]>;
}

// main repo init function to be called in the service factories
const repo = (): iSchedulerRepo => {
    /**
     * Users with an active design selection whose *current local time* (per
     * their stored IANA timezone) falls within [windowStartHour,
     * windowEndHourExclusive) - a wide (default 4-hour) early-morning
     * window, not a precise instant, since correctness no longer depends on
     * exactly when this runs (see scheduler.service.ts's explicit commit
     * date stamping) - this window only needs to be reasonably close to
     * "early in the user's day" for a good UX. Excludes anyone who already
     * has a run_log row for their current local date, so re-running within
     * the same window doesn't double-process them. target_date is simply
     * "what day is it for them right now", since the window check already
     * guarantees it's early in their day.
     */
    const findDueCandidates = async (windowStartHour: number = 0, windowEndHourExclusive: number = 4) => {
        try {
            const sqlString = `
                SELECT u.id AS user_id
                    , u.github_id
                    , u.github_username
                    , u.github_email
                    , COALESCE(up.use_real_email, FALSE) AS use_real_email
                    , COALESCE(up.timezone, 'UTC') AS timezone
                    , ds.design_id
                    , ds.start_date
                    , ds.repeat_indefinitely
                    , ds.recurrence_end_date
                    , d.pattern
                    , (NOW() AT TIME ZONE COALESCE(up.timezone, 'UTC'))::date AS target_date
                FROM users u
                LEFT JOIN user_profiles up ON up.user_id = u.id
                JOIN design_selections ds ON ds.user_id = u.id AND ds.is_active
                JOIN designs d ON d.id = ds.design_id
                WHERE u.is_active
                    AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(up.timezone, 'UTC'))) >= $1
                    AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(up.timezone, 'UTC'))) < $2
                    AND NOT EXISTS (
                        SELECT 1 FROM run_log rl
                        WHERE rl.user_id = u.id
                            AND rl.target_date = (NOW() AT TIME ZONE COALESCE(up.timezone, 'UTC'))::date
                    );
            `;

            const result = await pool.query(sqlString, [windowStartHour, windowEndHourExclusive]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        findDueCandidates,
    }
};

export default { repo };

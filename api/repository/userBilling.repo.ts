import type { PoolClient } from "pg";
import pool from "../config/db";
import { logger } from "../config/logger";

export interface iUserBillingSubscriptionInput {
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
    auto_renew?: boolean | null;
}

export interface iLapsedActiveUser {
    user_id: string;
    design_id: string;
}

// define the type of the return object from the repo() method
export interface iUserBillingRepo {
    getByUserId: (userId: string) => Promise<any | null>;
    getByStripeCustomerId: (stripeCustomerId: string) => Promise<any | null>;
    upsertCustomerId: (userId: string, stripeCustomerId: string) => Promise<any>;
    updateSubscription: (userId: string, input: iUserBillingSubscriptionInput) => Promise<any>;
    setPaidUntil: (userId: string, paidUntilIso: string) => Promise<any>;
    bumpPaidUntilOneYear: (userId: string, client?: PoolClient) => Promise<any>;
    listLapsedActiveUsers: () => Promise<iLapsedActiveUser[]>;
}

// main repo init function to be called in the service factories
const repo = (): iUserBillingRepo => {
    // A missing row means "never paid" - callers must handle null, never
    // treat its absence as covered (see .claude/tmp/goal.md).
    const getByUserId = async (userId: string) => {
        try {
            const result = await pool.query(`SELECT * FROM user_billing WHERE user_id = $1;`, [userId]);
            return result.rows[0] ?? null;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const getByStripeCustomerId = async (stripeCustomerId: string) => {
        try {
            const result = await pool.query(`SELECT * FROM user_billing WHERE stripe_customer_id = $1;`, [stripeCustomerId]);
            return result.rows[0] ?? null;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const upsertCustomerId = async (userId: string, stripeCustomerId: string) => {
        try {
            const sqlString = `
                INSERT INTO user_billing (user_id, stripe_customer_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE
                SET stripe_customer_id = EXCLUDED.stripe_customer_id
                    , updated_at = NOW()
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [userId, stripeCustomerId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Partial update of the subscription triple. Each field is left untouched
    // when its param is absent (COALESCE against the existing row), so a
    // "status changed" webhook doesn't wipe the subscription id and vice
    // versa. A row is created if somehow missing.
    const updateSubscription = async (userId: string, input: iUserBillingSubscriptionInput) => {
        try {
            const sqlString = `
                INSERT INTO user_billing (user_id, stripe_subscription_id, subscription_status, auto_renew)
                VALUES ($1, $2, $3, COALESCE($4, FALSE))
                ON CONFLICT (user_id) DO UPDATE
                SET stripe_subscription_id = COALESCE($2, user_billing.stripe_subscription_id)
                    , subscription_status = COALESCE($3, user_billing.subscription_status)
                    , auto_renew = COALESCE($4, user_billing.auto_renew)
                    , updated_at = NOW()
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [
                userId,
                input.stripe_subscription_id ?? null,
                input.subscription_status ?? null,
                input.auto_renew ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Absolute set - used for a subscription invoice, where Stripe's
    // current_period_end is the source of truth and re-applying the same
    // value is a harmless no-op.
    const setPaidUntil = async (userId: string, paidUntilIso: string) => {
        try {
            const sqlString = `
                INSERT INTO user_billing (user_id, paid_until)
                VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE
                SET paid_until = EXCLUDED.paid_until
                    , updated_at = NOW()
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [userId, paidUntilIso]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Additive extend by one year from whichever is later, now or the
    // current paid_until - used for a one-time payment. GREATEST ignores a
    // NULL paid_until, so a first-time payer gets NOW() + 1 year. Because
    // this is additive rather than an absolute set, a duplicate webhook
    // delivery calling it twice would double-credit the user; the caller is
    // responsible for running this and the payments ledger insert in the
    // same transaction (see PaymentsService.onPaymentIntentSucceeded) so a
    // losing concurrent delivery's credit rolls back with its failed insert
    // instead of being applied twice.
    const bumpPaidUntilOneYear = async (userId: string, client?: PoolClient) => {
        try {
            const sqlString = `
                INSERT INTO user_billing (user_id, paid_until)
                VALUES ($1, NOW() + INTERVAL '1 year')
                ON CONFLICT (user_id) DO UPDATE
                SET paid_until = GREATEST(NOW(), user_billing.paid_until) + INTERVAL '1 year'
                    , updated_at = NOW()
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [userId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Users who have an active design selection but are no longer covered -
    // either no user_billing row at all (a selection left active from before
    // payments existed) or paid_until already in the past. Compared at the
    // instant (not whole-day like the scheduler): once the period has truly
    // ended the selection shouldn't keep reading as active. Because the
    // scheduler's whole-day grace is the looser check, this can only ever
    // run a few hours behind it, never ahead.
    const listLapsedActiveUsers = async () => {
        try {
            const sqlString = `
                SELECT ds.user_id, ds.design_id
                FROM design_selections ds
                JOIN users u ON u.id = ds.user_id AND u.is_active
                LEFT JOIN user_billing ub ON ub.user_id = ds.user_id
                WHERE ds.is_active
                    AND (ub.paid_until IS NULL OR ub.paid_until < NOW());
            `;
            const result = await pool.query(sqlString);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        getByUserId,
        getByStripeCustomerId,
        upsertCustomerId,
        updateSubscription,
        setPaidUntil,
        bumpPaidUntilOneYear,
        listLapsedActiveUsers,
    }
};

export default { repo };

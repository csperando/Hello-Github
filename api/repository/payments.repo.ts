import pool from "../config/db";
import { logger } from "../config/logger";

export type iPaymentKind = "one_time" | "subscription";

export interface iPaymentCreateInput {
    user_id: string;
    stripe_event_id: string;
    stripe_object_id?: string | null;
    kind: iPaymentKind;
    status: string;
    amount_total_cents: number;
    amount_platform_cents: number;
    amount_charity_cents: number;
    charity_ein_id?: number | null;
    period_start?: string | null;
    period_end?: string | null;
}

// define the type of the return object from the repo() method
export interface iPaymentsRepo {
    create: (input: iPaymentCreateInput) => Promise<any>;
    existsByStripeEventId: (stripeEventId: string) => Promise<boolean>;
    listForUser: (userId: string) => Promise<any[]>;
    getLatestForUser: (userId: string) => Promise<any | null>;
}

// main repo init function to be called in the service factories
const repo = (): iPaymentsRepo => {
    const create = async (input: iPaymentCreateInput) => {
        try {
            const sqlString = `
                INSERT INTO payments (
                    user_id
                    , stripe_event_id
                    , stripe_object_id
                    , kind
                    , status
                    , amount_total_cents
                    , amount_platform_cents
                    , amount_charity_cents
                    , charity_ein_id
                    , period_start
                    , period_end
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *;
            `;
            const result = await pool.query(sqlString, [
                input.user_id,
                input.stripe_event_id,
                input.stripe_object_id ?? null,
                input.kind,
                input.status,
                input.amount_total_cents,
                input.amount_platform_cents,
                input.amount_charity_cents,
                input.charity_ein_id ?? null,
                input.period_start ?? null,
                input.period_end ?? null,
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // The webhook idempotency check: has this exact Stripe event already
    // produced a ledger row? (The UNIQUE constraint is the backstop; this is
    // the cheap up-front guard.)
    const existsByStripeEventId = async (stripeEventId: string) => {
        try {
            const sqlString = `SELECT EXISTS(SELECT 1 FROM payments WHERE stripe_event_id = $1) AS exists;`;
            const result = await pool.query(sqlString, [stripeEventId]);
            return result.rows[0].exists as boolean;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const listForUser = async (userId: string) => {
        try {
            const sqlString = `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC;`;
            const result = await pool.query(sqlString, [userId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Most recent charge for a user - reused as the amount/split/charity
    // template when a one-time payer later opts into auto-renew.
    const getLatestForUser = async (userId: string) => {
        try {
            const sqlString = `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1;`;
            const result = await pool.query(sqlString, [userId]);
            return result.rows[0] ?? null;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        create,
        existsByStripeEventId,
        listForUser,
        getLatestForUser,
    }
};

export default { repo };

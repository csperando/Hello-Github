import type { PoolClient } from "pg";
import pool from "../config/db";
import { logger } from "../config/logger";
import { toContainsPattern } from "./sqlPatterns";

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

export type iRefundState = "paid" | "partially_refunded" | "refunded";

export interface iAdminPaymentFilters {
    search?: string;
    refundState?: iRefundState;
    since?: string;
    userId?: string;
}

export interface iRefundInput {
    amount_refunded_cents: number;
    refunded_at: string | null;
    stripe_refund_id: string | null;
    admin_note: string | null;
}

// How much of a payment has been refunded - worked out from the recorded
// refunded amount, never stored (the Stripe-reported status column stays as is).
const REFUND_STATE_SQL = `
    CASE
        WHEN p.amount_refunded_cents = 0 THEN 'paid'
        WHEN p.amount_refunded_cents < p.amount_total_cents THEN 'partially_refunded'
        ELSE 'refunded'
    END
`;

// A payment as the admin console shows it: who paid, the charity, and the
// design/year it bought (a one-time payment's paint job shares its payment
// intent id; a subscription invoice has none).
const ADMIN_PAYMENT_SELECT = `
    SELECT p.*
        , ${REFUND_STATE_SQL} AS refund_state
        , u.github_username
        , u.email AS user_email
        , o.name AS charity_name
        , d.name AS design_name
        , bj.year AS design_year
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN eo_bmf o ON o.id = p.charity_ein_id
    LEFT JOIN backfill_jobs bj ON bj.stripe_payment_intent_id = p.stripe_object_id
    LEFT JOIN design_selections ds ON ds.id = bj.selection_id
    LEFT JOIN designs d ON d.id = ds.design_id
`;

// define the type of the return object from the repo() method
export interface iPaymentsRepo {
    create: (input: iPaymentCreateInput, client?: PoolClient) => Promise<any>;
    existsByStripeEventId: (stripeEventId: string) => Promise<boolean>;
    listForUser: (userId: string) => Promise<any[]>;
    getLatestForUser: (userId: string) => Promise<any | null>;
    adminList: (filters: iAdminPaymentFilters) => Promise<any[]>;
    adminGetById: (paymentId: string) => Promise<any | undefined>;
    recordRefund: (paymentId: string, input: iRefundInput, client?: PoolClient) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iPaymentsRepo => {
    // `client` lets a caller run this against an existing transaction (e.g.
    // atomically with a `user_billing` credit) instead of a fresh pool
    // connection; every existing call site omits it and is unaffected.
    const create = async (input: iPaymentCreateInput, client?: PoolClient) => {
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
            const result = await (client ?? pool).query(sqlString, [
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

    // A fast-path only: has this exact Stripe event already produced a
    // ledger row? Skips redundant work (Stripe API calls, the DB write
    // below) on Stripe's ordinary post-200 redelivery of an already-fully-
    // processed event. It cannot by itself close the race between two truly
    // concurrent deliveries - the UNIQUE constraint on stripe_event_id below,
    // paired with the transaction/catch in the webhook handlers that write
    // here, is what actually guarantees at most one row (and, for the
    // additive one-time-payment credit, at most one charge applied).
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

    // newest first; every filter optional. Capped - the console searches
    // rather than pages.
    const adminList = async (filters: iAdminPaymentFilters) => {
        try {
            const sqlString = `
                SELECT * FROM (${ADMIN_PAYMENT_SELECT}) payment
                WHERE ($1::text IS NULL
                        OR payment.github_username ILIKE $1
                        OR payment.user_email ILIKE $1
                        OR payment.stripe_object_id ILIKE $1
                        OR payment.stripe_refund_id ILIKE $1)
                    AND ($2::text IS NULL OR payment.refund_state = $2)
                    AND ($3::timestamptz IS NULL OR payment.created_at >= $3)
                    AND ($4::uuid IS NULL OR payment.user_id = $4)
                ORDER BY payment.created_at DESC
                LIMIT 200;
            `;
            const result = await pool.query(sqlString, [
                filters.search ? toContainsPattern(filters.search) : null,
                filters.refundState ?? null,
                filters.since ?? null,
                filters.userId ?? null,
            ]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    const adminGetById = async (paymentId: string) => {
        try {
            const result = await pool.query(`${ADMIN_PAYMENT_SELECT} WHERE p.id = $1;`, [paymentId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Records a refund made in Stripe - no money moves here. The
    // payments_amount_refunded_in_range CHECK backs up the validation.
    const recordRefund = async (paymentId: string, input: iRefundInput, client?: PoolClient) => {
        try {
            const sqlString = `
                UPDATE payments
                SET amount_refunded_cents = $2
                    , refunded_at = $3
                    , stripe_refund_id = $4
                    , admin_note = $5
                WHERE id = $1
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [
                paymentId,
                input.amount_refunded_cents,
                input.refunded_at,
                input.stripe_refund_id,
                input.admin_note,
            ]);
            return result.rows[0];

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
        adminList,
        adminGetById,
        recordRefund,
    }
};

export default { repo };

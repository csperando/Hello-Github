/**
 * What a user sees of their own payment - the Stripe event/object ids and
 * user_id stay server-side.
 */
export interface iPublicPayment {
    id: string;
    kind: "one_time" | "subscription";
    status: string;
    amount_total_cents: number;
    amount_platform_cents: number;
    amount_charity_cents: number;
    charity_ein_id: number | null;
    period_start: string | null;
    period_end: string | null;
    created_at: string;
}

export function toPublicPayment(payment: iPublicPayment): iPublicPayment {
    return {
        id: payment.id,
        kind: payment.kind,
        status: payment.status,
        amount_total_cents: payment.amount_total_cents,
        amount_platform_cents: payment.amount_platform_cents,
        amount_charity_cents: payment.amount_charity_cents,
        charity_ein_id: payment.charity_ein_id,
        period_start: payment.period_start,
        period_end: payment.period_end,
        created_at: payment.created_at,
    };
}

/** What a user sees of their own backfill job. */
export interface iPublicBackfillJob {
    id: string;
    design_id: string;
    year: number;
    status: string;
    issue_url: string | null;
}

export function toPublicBackfillJob(job: iPublicBackfillJob): iPublicBackfillJob {
    return {
        id: job.id,
        design_id: job.design_id,
        year: job.year,
        status: job.status,
        issue_url: job.issue_url,
    };
}

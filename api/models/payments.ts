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

/** What a user sees of one of their own paint (backfill) jobs. */
export interface iPublicBackfillJob {
    id: string;
    year: number;
    status: string;
    issue_url: string | null;
    created_at: string;
    completed_at: string | null;
}

export function toPublicBackfillJob(job: iPublicBackfillJob): iPublicBackfillJob {
    return {
        id: job.id,
        year: job.year,
        status: job.status,
        issue_url: job.issue_url,
        created_at: job.created_at,
        completed_at: job.completed_at,
    };
}

/** A design's worked-out paint status plus its latest paint job - GET /payments/paint-status/:designId's shape. */
export interface iPublicPaintStatus {
    paint_status: string;
    latest_job: iPublicBackfillJob | null;
}

export function toPublicPaintStatus(status: { paint_status: string; latest_job: iPublicBackfillJob | null }): iPublicPaintStatus {
    return {
        paint_status: status.paint_status,
        latest_job: status.latest_job ? toPublicBackfillJob(status.latest_job) : null,
    };
}

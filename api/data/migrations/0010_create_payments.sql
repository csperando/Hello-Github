-- Append-only ledger of successful Stripe charges (one-time payments and
-- each paid subscription invoice). One row is written per Stripe webhook
-- event; `stripe_event_id` is UNIQUE so a redelivered event is a no-op
-- rather than a double-count. This table is the source of truth for the
-- platform/charity split and drives the manual charity disbursement
-- process (there is no automated payout yet - see .claude/tmp/goal.md).
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),

    -- the webhook event that produced this row (idempotency key) and the
    -- underlying Stripe object (PaymentIntent or Invoice) it settled
    stripe_event_id VARCHAR(255) NOT NULL,
    stripe_object_id VARCHAR(255),

    kind VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL,

    -- all amounts in integer cents, USD; platform + charity always sum to total
    amount_total_cents INTEGER NOT NULL,
    amount_platform_cents INTEGER NOT NULL,
    amount_charity_cents INTEGER NOT NULL,
    charity_ein_id BIGINT REFERENCES eo_bmf(id) ON DELETE SET NULL,

    -- the paid painting window this charge covers
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payments_stripe_event_id_unique UNIQUE (stripe_event_id),
    CONSTRAINT payments_kind_valid CHECK (kind IN ('one_time', 'subscription')),
    CONSTRAINT payments_amounts_nonneg CHECK (
        amount_total_cents >= 0
        AND amount_platform_cents >= 0
        AND amount_charity_cents >= 0
    ),
    CONSTRAINT payments_amounts_sum CHECK (
        amount_platform_cents + amount_charity_cents = amount_total_cents
    )
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_charity_ein_id ON payments(charity_ein_id);

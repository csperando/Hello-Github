-- One row per user, holding their Stripe customer/subscription linkage and
-- their current paid painting window. Payment is user-level, not per design
-- selection: `paid_until` alone decides whether the scheduler is allowed to
-- paint for this user at all (see .claude/tmp/goal.md's two-layer model).
-- A user with no row here has simply never paid - every read must treat a
-- missing row as "not covered", never create one implicitly.
CREATE TABLE IF NOT EXISTS user_billing (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Stripe linkage. customer id is set lazily on first checkout; the
    -- subscription pair is null for one-time payers.
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50),
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,

    -- The precise instant the current paid year ends. The scheduler compares
    -- this at whole-day granularity (paint through the last calendar day),
    -- but the exact instant is kept for everything else.
    paid_until TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A Stripe customer / subscription maps to exactly one user - guard
    -- against ever crediting the wrong account from a webhook.
    CONSTRAINT user_billing_stripe_customer_id_unique UNIQUE (stripe_customer_id),
    CONSTRAINT user_billing_stripe_subscription_id_unique UNIQUE (stripe_subscription_id)
);

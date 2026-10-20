-- Admin console support.
--
-- Refunds are issued by hand in Stripe; an admin records them here so a
-- user's contributed total and payment history stay right. Only the refunded
-- amount is stored - paid / partially refunded / refunded is worked out from
-- it, and the Stripe-reported `status` column is left as it was.
ALTER TABLE payments
    ADD COLUMN amount_refunded_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN refunded_at TIMESTAMPTZ,
    ADD COLUMN stripe_refund_id TEXT,
    ADD COLUMN admin_note TEXT,
    ADD CONSTRAINT payments_amount_refunded_in_range CHECK (
        amount_refunded_cents >= 0 AND amount_refunded_cents <= amount_total_cents
    );

-- The backfill Action's error for a failed paint, when it reports one.
ALTER TABLE backfill_jobs ADD COLUMN last_error TEXT;

-- One row per admin change, written in the same transaction as the change.
-- `changes` holds {"field": {"from": ..., "to": ...}} for edits, or details
-- for actions like a job retry.
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT admin_audit_log_entity_type_valid CHECK (
        entity_type IN ('payment', 'backfill_job', 'user', 'design_selection')
    )
);

CREATE INDEX idx_admin_audit_log_entity ON admin_audit_log (entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS design_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    design_id UUID NOT NULL REFERENCES designs(id),

    is_active BOOLEAN NOT NULL DEFAULT FALSE,

    start_date DATE NOT NULL,
    repeat_indefinitely BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_end_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT design_selections_user_design_unique UNIQUE (user_id, design_id),
    CONSTRAINT design_selections_recurrence_end_date_consistency CHECK (
        NOT repeat_indefinitely OR recurrence_end_date IS NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_design_selections_one_active_per_user
    ON design_selections (user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_design_selections_design_id ON design_selections(design_id);

-- designs is a live production table: backfill one selection row per existing
-- design (owned/authored by its creator) before dropping the scheduling
-- columns below, rather than dropping-then-recreating. A user can already
-- own more than one design, which would violate the one-active-per-user
-- index above if every row were backfilled active - only the most recently
-- created design per user is marked active; the rest still get a (inactive)
-- selection row, preserving their scheduling data rather than losing it.
INSERT INTO design_selections (user_id, design_id, is_active, start_date, repeat_indefinitely, recurrence_end_date)
SELECT user_id, id,
    (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) = 1),
    start_date, repeat_indefinitely, recurrence_end_date
FROM designs;

ALTER TABLE designs
    DROP COLUMN start_date,
    DROP COLUMN end_date,
    DROP COLUMN repeat_indefinitely,
    DROP COLUMN recurrence_end_date;

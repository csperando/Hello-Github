-- Soft deletes, paint jobs owned by a design selection, and paint-status
-- definitions.
--
-- backfill_jobs was keyed by (user_id, design_id) - a selection in all but
-- name - with an FK to designs that blocked deleting a purchased design. Jobs
-- now belong to design_selections via selection_id, a selection can be
-- painted many times, and each job keeps its own copy of what it paints
-- (pattern + schedule) so later edits can't change a paid paint.

-- ---- status definitions ----------------------------------------------------

-- Stored job states. locks_design: the selection can't be edited, deleted, or
-- checked out again while a job is in one of these. is_finished: the job
-- will never change again.
CREATE TABLE backfill_job_statuses (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    locks_design BOOLEAN NOT NULL,
    is_finished BOOLEAN NOT NULL,
    sort_order INTEGER NOT NULL
);

INSERT INTO backfill_job_statuses (code, label, description, locks_design, is_finished, sort_order) VALUES
    ('pending_payment', 'awaiting payment', 'Checkout started; what to paint is copied, waiting for payment.', FALSE, FALSE, 10),
    ('awaiting_issue', 'awaiting consent', 'Paid; waiting for the user to link their account to the canvas repo.', TRUE, FALSE, 20),
    ('ready', 'queued', 'Ready for the backfill Action to pick up.', TRUE, FALSE, 30),
    ('painting', 'painting', 'Picked up; commits are being made.', TRUE, FALSE, 40),
    ('done', 'painted', 'Painted successfully.', FALSE, TRUE, 50),
    ('failed', 'failed', 'The paint job hit an error.', FALSE, TRUE, 60),
    ('cancelled', 'cancelled', 'Payment failed or was cancelled, or another paint was already in progress.', FALSE, TRUE, 70);

-- A selection's paint status is worked out from its jobs, never stored - this
-- only defines the codes and their wording.
CREATE TABLE design_paint_statuses (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    sort_order INTEGER NOT NULL
);

INSERT INTO design_paint_statuses (code, label, description, sort_order) VALUES
    ('unpainted', 'not painted', 'Never painted, or edited since it was last painted.', 10),
    ('locked', 'painting', 'A paid paint is in progress; the design can''t be edited until it finishes.', 20),
    ('painted', 'painted', 'Painted, and unchanged since.', 30),
    ('error', 'paint failed', 'The last paint hit an error.', 40);

-- ---- soft deletes ----------------------------------------------------------

ALTER TABLE designs ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE design_selections ADD COLUMN deleted_at TIMESTAMPTZ;

-- ---- backfill_jobs -> design_selections, with a copy of what it paints ------

ALTER TABLE backfill_jobs
    ADD COLUMN selection_id UUID REFERENCES design_selections(id),
    ADD COLUMN pattern INTEGER[],
    ADD COLUMN start_date DATE,
    ADD COLUMN custom_range BOOLEAN,
    ADD COLUMN stripe_payment_intent_id TEXT,
    ADD COLUMN completed_at TIMESTAMPTZ;

-- existing jobs: their selection, and the design as it is now - the closest
-- record left of what was bought
UPDATE backfill_jobs bj
SET selection_id = ds.id
    , pattern = d.pattern
    , start_date = ds.start_date
    , custom_range = ds.custom_range
    , completed_at = CASE WHEN bj.status IN ('done', 'failed') THEN bj.updated_at END
FROM design_selections ds
JOIN designs d ON d.id = ds.design_id
WHERE ds.user_id = bj.user_id AND ds.design_id = bj.design_id;

-- a job whose selection was hard-deleted before soft deletes existed can't be
-- linked - stop with the ids rather than guess
DO $$
DECLARE
    orphans TEXT;
BEGIN
    SELECT string_agg(id::text, ', ') INTO orphans FROM backfill_jobs WHERE selection_id IS NULL;
    IF orphans IS NOT NULL THEN
        RAISE EXCEPTION 'backfill_jobs with no matching design selection: %', orphans;
    END IF;
END $$;

ALTER TABLE backfill_jobs
    ALTER COLUMN selection_id SET NOT NULL,
    ALTER COLUMN pattern SET NOT NULL,
    ALTER COLUMN start_date SET NOT NULL,
    ALTER COLUMN custom_range SET NOT NULL,
    DROP CONSTRAINT backfill_jobs_status_valid,
    ADD CONSTRAINT backfill_jobs_status_fk FOREIGN KEY (status) REFERENCES backfill_job_statuses(code),
    ADD CONSTRAINT backfill_jobs_stripe_payment_intent_id_unique UNIQUE (stripe_payment_intent_id),
    DROP CONSTRAINT backfill_jobs_user_design_unique,
    DROP COLUMN user_id,
    DROP COLUMN design_id;

-- At most one job locking a selection at a time. The status list must be
-- literal here - it mirrors backfill_job_statuses.locks_design, and a test
-- checks the two agree.
CREATE UNIQUE INDEX idx_backfill_jobs_one_locking_per_selection
    ON backfill_jobs (selection_id)
    WHERE status IN ('awaiting_issue', 'ready', 'painting');

CREATE INDEX idx_backfill_jobs_selection_id ON backfill_jobs (selection_id);

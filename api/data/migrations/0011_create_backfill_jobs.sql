-- One row per purchased past-year design. Moves through:
--   awaiting_issue -> (user grants public_repo, we open the canvas-repo issue as them) -> ready
--   ready -> (claimed by the backfill Action) -> painting -> done | failed
-- The issue is what makes GitHub count commits in the canvas repo toward the
-- user's graph (a repo relationship is required; a star doesn't count).
CREATE TABLE IF NOT EXISTS backfill_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    design_id UUID NOT NULL REFERENCES designs(id),

    -- the past calendar year the design is painted onto
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_issue',
    issue_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT backfill_jobs_user_design_unique UNIQUE (user_id, design_id),
    CONSTRAINT backfill_jobs_status_valid CHECK (status IN ('awaiting_issue', 'ready', 'painting', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON backfill_jobs(status);

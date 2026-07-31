CREATE TABLE IF NOT EXISTS run_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    design_id UUID REFERENCES designs(id) ON DELETE SET NULL,

    target_date DATE NOT NULL,
    commit_count INTEGER NOT NULL,
    status TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT run_log_user_target_date_unique UNIQUE (user_id, target_date),
    CONSTRAINT run_log_status_valid CHECK (status IN ('committed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_run_log_target_date ON run_log(target_date);

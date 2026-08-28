CREATE TABLE IF NOT EXISTS users_contributions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    year INTEGER NOT NULL,
    q NUMERIC,
    commit_counts INTEGER[],
    max_level_2_contribution INTEGER,

    previous_year_q NUMERIC,
    previous_year_commit_counts INTEGER[],

    computed_at TIMESTAMPTZ,

    CONSTRAINT users_contributions_commit_counts_length CHECK (commit_counts IS NULL OR cardinality(commit_counts) = 4),
    CONSTRAINT users_contributions_previous_year_commit_counts_length CHECK (previous_year_commit_counts IS NULL OR cardinality(previous_year_commit_counts) = 4)
);

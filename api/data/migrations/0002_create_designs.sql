CREATE TABLE IF NOT EXISTS designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),

    name VARCHAR(255) NOT NULL DEFAULT 'untitled design',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    pattern INTEGER[] NOT NULL,

    repeat_indefinitely BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_end_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT designs_pattern_length_multiple_of_7 CHECK (cardinality(pattern) % 7 = 0),
    CONSTRAINT designs_pattern_values_in_range CHECK (pattern <@ ARRAY[0,1,2,3,4]),
    CONSTRAINT designs_end_date_after_start CHECK (end_date >= start_date),
    CONSTRAINT designs_recurrence_end_date_consistency CHECK (
        (NOT repeat_indefinitely OR recurrence_end_date IS NULL) AND
        (recurrence_end_date IS NULL OR recurrence_end_date > end_date)
    )
);

CREATE INDEX IF NOT EXISTS idx_designs_user_id ON designs(user_id);

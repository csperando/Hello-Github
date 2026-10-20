-- Store the two facts the editor and backfill depend on explicitly, rather
-- than inferring them:
--
--   year         - the past calendar year being painted. Previously guessed
--                  from start_date + 6 days, which is ambiguous: a year's last
--                  grid column and the next year's first column start on the
--                  same Sunday (e.g. Sun 2025-12-28 is both).
--   custom_range - the pattern tiles forward from start_date through Dec 31 of
--                  `year`. Previously encoded as recurrence_end_date = Dec 31,
--                  a column that belongs to a separate, unimplemented feature
--                  (as does repeat_indefinitely) - both stay, unused here.

ALTER TABLE design_selections
    ADD COLUMN custom_range BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN year INTEGER;

-- the editor only ever wrote recurrence_end_date for custom ranges
UPDATE design_selections
SET custom_range = TRUE
    , recurrence_end_date = NULL
WHERE recurrence_end_date IS NOT NULL;

-- a purchased design's job already records the year that was paid for
UPDATE design_selections ds
SET year = bj.year
FROM backfill_jobs bj
WHERE bj.user_id = ds.user_id AND bj.design_id = ds.design_id;

-- everything else: the old start_date + 6 days rule
UPDATE design_selections
SET year = EXTRACT(YEAR FROM start_date + 6)::int
WHERE year IS NULL;

-- Flag rows starting on a Sunday shared by two years' grids (the last column
-- of year - 1 is also the first column of year) with no purchase to confirm
-- which was meant - the fallback picked the later year. Check these by hand.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT ds.id, ds.start_date, ds.year
        FROM design_selections ds
        WHERE ds.start_date < make_date(ds.year, 1, 1)
          AND NOT EXISTS (
              SELECT 1 FROM backfill_jobs bj WHERE bj.user_id = ds.user_id AND bj.design_id = ds.design_id
          )
    LOOP
        RAISE NOTICE 'design_selections %: start_date % is shared by % and %, set to %', r.id, r.start_date, r.year - 1, r.year, r.year;
    END LOOP;
END $$;

ALTER TABLE design_selections
    ALTER COLUMN year SET NOT NULL,
    -- start_date's column must be inside `year`'s grid: from the Sunday on or
    -- before Jan 1 through Dec 31
    ADD CONSTRAINT design_selections_start_date_in_year CHECK (
        start_date >= make_date(year, 1, 1) - EXTRACT(DOW FROM make_date(year, 1, 1))::int
        AND start_date <= make_date(year, 12, 31)
    );

-- default_charity previously stored a free-text charity name; the app now
-- searches eo_bmf and needs to store a real org id instead. Existing values
-- are placeholder name strings from before this table had real users, so
-- it's safe to null them out rather than try to map them.
ALTER TABLE user_profiles
    ALTER COLUMN default_charity TYPE BIGINT USING NULL;

ALTER TABLE user_profiles
    ADD CONSTRAINT fk_user_profiles_default_charity
    FOREIGN KEY (default_charity) REFERENCES eo_bmf(id)
    ON DELETE SET NULL;

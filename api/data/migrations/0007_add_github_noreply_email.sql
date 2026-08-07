ALTER TABLE users
    ADD COLUMN IF NOT EXISTS github_noreply_email VARCHAR(320);

-- Deterministic from data every row already has - no GitHub API call needed.
-- Keep this format string in sync by hand with computeNoreplyEmail() in
-- api/services/github.service.ts.
UPDATE users
    SET github_noreply_email = github_id::text || '+' || github_username || '@users.noreply.github.com'
    WHERE github_noreply_email IS NULL;

ALTER TABLE users
    ALTER COLUMN github_noreply_email SET NOT NULL;

-- Backfill `email` the same way UserService.updateProfile computes it going
-- forward (default use_real_email = FALSE when no user_profiles row exists
-- yet). `email` is the user's chosen *effective* commit-author address,
-- kept in sync on profile save - it stays nullable (unlike
-- github_noreply_email) since it's a derived cache, not a fact about the
-- user, so an insert path that forgets to populate it should degrade
-- gracefully rather than fail.
UPDATE users u
    SET email = CASE
        WHEN COALESCE((SELECT up.use_real_email FROM user_profiles up WHERE up.user_id = u.id), FALSE)
            THEN u.github_email
        ELSE u.github_noreply_email
    END
    WHERE u.email IS NULL;

import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import UserProfilesRepository from "../../repository/userProfiles.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("UserProfilesRepository.upsert", () => {
    const usersRepo = UsersRepository.repo();
    const profilesRepo = UserProfilesRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -3;

    const upsertInput: iGitHubUpsertInput = {
        github_id: testGitHubId,
        github_username: "octocat-profile-repo-test",
        github_email: "octocat-profile-repo-test@example.com",
        github_node_id: "MDQ6VXNlcjM=",
        github_profile_url: "https://github.com/octocat-profile-repo-test",
        avatar_url: "https://avatars.githubusercontent.com/u/3?v=4",
    };

    let userId: string;
    let fixtureOrgId: number;
    // fixed, reserved-range EIN so this fixture never collides with real eo_bmf data
    const fixtureEin = "000000001";

    beforeAll(async () => {
        await runMigrations();

        const org = await pool.query(
            "INSERT INTO eo_bmf (ein, name) VALUES ($1, $2) RETURNING id;",
            [fixtureEin, "Repo Test Charity"],
        );
        fixtureOrgId = org.rows[0].id;
    });

    afterAll(async () => {
        await pool.query("DELETE FROM eo_bmf WHERE ein = $1;", [fixtureEin]);
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub(upsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        // cascades to any user_profiles row
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("creates a new profile row on first upsert, defaulting public_opt_in to true, timezone to UTC, and use_real_email to false when omitted", async () => {
        const profile = await profilesRepo.upsert(userId, { display_name: "Lena Ortiz" });

        expect(profile.user_id).toBe(userId);
        expect(profile.display_name).toBe("Lena Ortiz");
        expect(profile.default_charity).toBeNull();
        expect(profile.public_opt_in).toBe(true);
        expect(profile.timezone).toBe("UTC");
        expect(profile.use_real_email).toBe(false);
    });

    it("only overwrites fields provided on a later upsert, leaving others as-is", async () => {
        await profilesRepo.upsert(userId, {
            display_name: "Lena Ortiz",
            default_charity: fixtureOrgId,
            public_opt_in: false,
            timezone: "America/Chicago",
            use_real_email: true,
        });

        const updated = await profilesRepo.upsert(userId, { display_name: "Lena O." });

        expect(updated.display_name).toBe("Lena O.");
        expect(updated.default_charity).toBe(fixtureOrgId);
        expect(updated.public_opt_in).toBe(false);
        expect(updated.timezone).toBe("America/Chicago");
        expect(updated.use_real_email).toBe(true);
    });

    it("updates timezone and use_real_email independently without clobbering other fields", async () => {
        await profilesRepo.upsert(userId, { display_name: "Lena Ortiz", timezone: "America/Chicago" });

        const updated = await profilesRepo.upsert(userId, { timezone: "Asia/Kolkata", use_real_email: true });

        expect(updated.display_name).toBe("Lena Ortiz");
        expect(updated.timezone).toBe("Asia/Kolkata");
        expect(updated.use_real_email).toBe(true);
    });

    it("does not clobber a true use_real_email back to false when omitted on a later upsert", async () => {
        await profilesRepo.upsert(userId, { use_real_email: true });

        const updated = await profilesRepo.upsert(userId, { display_name: "Lena O." });

        expect(updated.use_real_email).toBe(true);
    });

    it("does not clobber a non-default timezone back to UTC when omitted on a later upsert", async () => {
        await profilesRepo.upsert(userId, { timezone: "America/Chicago" });

        const updated = await profilesRepo.upsert(userId, { display_name: "Lena O." });

        expect(updated.timezone).toBe("America/Chicago");
    });

    it("bumps updated_at on a repeat upsert", async () => {
        const first = await profilesRepo.upsert(userId, { display_name: "Lena Ortiz" });
        const second = await profilesRepo.upsert(userId, { display_name: "Lena O." });

        expect(new Date(second.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(first.updated_at).getTime());
    });
});

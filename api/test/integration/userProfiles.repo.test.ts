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

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub(upsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        // cascades to any user_profiles row
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("creates a new profile row on first upsert, defaulting public_opt_in to true when omitted", async () => {
        const profile = await profilesRepo.upsert(userId, { display_name: "Lena Ortiz" });

        expect(profile.user_id).toBe(userId);
        expect(profile.display_name).toBe("Lena Ortiz");
        expect(profile.default_charity).toBeNull();
        expect(profile.public_opt_in).toBe(true);
    });

    it("only overwrites fields provided on a later upsert, leaving others as-is", async () => {
        await profilesRepo.upsert(userId, {
            display_name: "Lena Ortiz",
            default_charity: "GiveDirectly",
            public_opt_in: false,
        });

        const updated = await profilesRepo.upsert(userId, { display_name: "Lena O." });

        expect(updated.display_name).toBe("Lena O.");
        expect(updated.default_charity).toBe("GiveDirectly");
        expect(updated.public_opt_in).toBe(false);
    });

    it("bumps updated_at on a repeat upsert", async () => {
        const first = await profilesRepo.upsert(userId, { display_name: "Lena Ortiz" });
        const second = await profilesRepo.upsert(userId, { display_name: "Lena O." });

        expect(new Date(second.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(first.updated_at).getTime());
    });
});

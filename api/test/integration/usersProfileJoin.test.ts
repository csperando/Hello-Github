import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import UserProfilesRepository from "../../repository/userProfiles.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("users.repo profile join", () => {
    const usersRepo = UsersRepository.repo();
    const profilesRepo = UserProfilesRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -4;

    const upsertInput: iGitHubUpsertInput = {
        github_id: testGitHubId,
        github_username: "octocat-join-test",
        github_email: "octocat-join-test@example.com",
        github_node_id: "MDQ6VXNlcjQ=",
        github_profile_url: "https://github.com/octocat-join-test",
        avatar_url: "https://avatars.githubusercontent.com/u/4?v=4",
    };

    let userId: string;
    let fixtureOrgId: number;
    // fixed, reserved-range EIN so this fixture never collides with real eo_bmf data
    const fixtureEin = "000000002";

    beforeAll(async () => {
        await runMigrations();

        const org = await pool.query(
            "INSERT INTO eo_bmf (ein, name) VALUES ($1, $2) RETURNING id;",
            [fixtureEin, "Join Test Charity"],
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

    it("getUserById defaults display_name/default_charity to null, public_opt_in to true, timezone to UTC, and use_real_email to false when no profile row exists", async () => {
        const user = await usersRepo.getUserById(userId);

        expect(user.display_name).toBeNull();
        expect(user.default_charity).toBeNull();
        expect(user.public_opt_in).toBe(true);
        expect(user.timezone).toBe("UTC");
        expect(user.use_real_email).toBe(false);
    });

    it("getUserById returns the joined profile fields once a profile row exists", async () => {
        await profilesRepo.upsert(userId, {
            display_name: "Lena Ortiz",
            default_charity: fixtureOrgId,
            public_opt_in: false,
            timezone: "America/Chicago",
            use_real_email: true,
        });

        const user = await usersRepo.getUserById(userId);

        expect(user.display_name).toBe("Lena Ortiz");
        expect(user.default_charity).toBe(fixtureOrgId);
        expect(user.public_opt_in).toBe(false);
        expect(user.timezone).toBe("America/Chicago");
        expect(user.use_real_email).toBe(true);
        // core user fields untouched by the join
        expect(user.github_username).toBe("octocat-join-test");
    });

    it("getUserByGitHubId returns the same joined profile fields", async () => {
        await profilesRepo.upsert(userId, { display_name: "Lena Ortiz", timezone: "Asia/Kolkata" });

        const user = await usersRepo.getUserByGitHubId(testGitHubId);

        expect(user.display_name).toBe("Lena Ortiz");
        expect(user.public_opt_in).toBe(true);
        expect(user.timezone).toBe("Asia/Kolkata");
        expect(user.use_real_email).toBe(false);
    });
});

import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import UsersContributionsRepository from "../../repository/usersContributions.repo";
import DesignsRepository from "../../repository/designs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("UsersContributionsRepository", () => {
    const usersRepo = UsersRepository.repo();
    const contributionsRepo = UsersContributionsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -106;

    let userId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-userscontrib-repo-test",
            github_email: "octocat-userscontrib-repo-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-userscontrib-repo-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwNg==",
            github_profile_url: "https://github.com/octocat-userscontrib-repo-test",
            avatar_url: "https://avatars.githubusercontent.com/u/106?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM users_contributions WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM user_billing WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    const makeCovered = () =>
        pool.query(
            `INSERT INTO user_billing (user_id, paid_until) VALUES ($1, NOW() + INTERVAL '1 year')
             ON CONFLICT (user_id) DO UPDATE SET paid_until = EXCLUDED.paid_until;`,
            [userId],
        );

    describe("findByUserId", () => {
        it("returns null when no row exists yet", async () => {
            expect(await contributionsRepo.findByUserId(userId)).toBeNull();
        });
    });

    describe("upsert", () => {
        it("creates a first row with the given values and null previous_year fields", async () => {
            const row = await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: 15,
                commit_counts: [12, 27, 42, 53],
                max_level_2_contribution: 30,
            });

            expect(row.user_id).toBe(userId);
            expect(row.year).toBe(2026);
            expect(Number(row.q)).toBe(15);
            expect(row.commit_counts).toEqual([12, 27, 42, 53]);
            expect(row.max_level_2_contribution).toBe(30);
            expect(row.previous_year_q).toBeNull();
            expect(row.previous_year_commit_counts).toBeNull();
        });

        it("allows a cold-start row with null q/commit_counts", async () => {
            const row = await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: null,
                commit_counts: null,
                max_level_2_contribution: null,
            });

            expect(row.q).toBeNull();
            expect(row.commit_counts).toBeNull();
        });

        it("refreshing within the same year updates q/commit_counts but leaves previous_year fields untouched", async () => {
            await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: 15,
                commit_counts: [12, 27, 42, 53],
                max_level_2_contribution: 30,
            });

            const refreshed = await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: 16,
                commit_counts: [12, 28, 44, 56],
                max_level_2_contribution: 32,
            });

            expect(Number(refreshed.q)).toBe(16);
            expect(refreshed.commit_counts).toEqual([12, 28, 44, 56]);
            expect(refreshed.previous_year_q).toBeNull();
            expect(refreshed.previous_year_commit_counts).toBeNull();
        });

        it("rolls the prior year's q/commit_counts into previous_year fields on a year rollover", async () => {
            await contributionsRepo.upsert({
                user_id: userId,
                year: 2025,
                q: 7.5,
                commit_counts: [6, 14, 21, 27],
                max_level_2_contribution: 15,
            });

            const rolled = await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: null,
                commit_counts: null,
                max_level_2_contribution: null,
            });

            expect(rolled.year).toBe(2026);
            expect(rolled.q).toBeNull();
            expect(rolled.commit_counts).toBeNull();
            expect(Number(rolled.previous_year_q)).toBe(7.5);
            expect(rolled.previous_year_commit_counts).toEqual([6, 14, 21, 27]);
        });

        it("does not overwrite an existing previous_year fallback with nulls on a same-year refresh", async () => {
            // simulate a year that already rolled over once, then two same-year refreshes
            await contributionsRepo.upsert({
                user_id: userId,
                year: 2025,
                q: 7.5,
                commit_counts: [6, 14, 21, 27],
                max_level_2_contribution: 15,
            });
            await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: null,
                commit_counts: null,
                max_level_2_contribution: null,
            });

            const secondRefresh = await contributionsRepo.upsert({
                user_id: userId,
                year: 2026,
                q: null,
                commit_counts: null,
                max_level_2_contribution: null,
            });

            expect(Number(secondRefresh.previous_year_q)).toBe(7.5);
            expect(secondRefresh.previous_year_commit_counts).toEqual([6, 14, 21, 27]);
        });
    });

    describe("findActiveUsers", () => {
        const designsRepo = DesignsRepository.repo();
        const designSelectionsRepo = DesignSelectionsRepository.repo();

        it("includes a user with an active design selection and a current paid period", async () => {
            const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
            await designSelectionsRepo.create(userId, design.id, { start_date: "2026-01-04", year: 2026, is_active: true });
            await makeCovered();

            const active = await contributionsRepo.findActiveUsers();

            expect(active).toContainEqual({ user_id: userId, github_username: "octocat-userscontrib-repo-test" });

            await designSelectionsRepo.delete(userId, design.id);
            await pool.query("DELETE FROM designs WHERE id = $1;", [design.id]);
        });

        it("excludes an active-selection user with no current paid period", async () => {
            const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
            await designSelectionsRepo.create(userId, design.id, { start_date: "2026-01-04", year: 2026, is_active: true });
            // no makeCovered()

            const active = await contributionsRepo.findActiveUsers();

            expect(active).not.toContainEqual(expect.objectContaining({ user_id: userId }));

            await designSelectionsRepo.delete(userId, design.id);
            await pool.query("DELETE FROM designs WHERE id = $1;", [design.id]);
        });

        it("excludes a user with no active design selection", async () => {
            const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
            await designSelectionsRepo.create(userId, design.id, { start_date: "2026-01-04", year: 2026, is_active: false });

            const active = await contributionsRepo.findActiveUsers();

            expect(active).not.toContainEqual(expect.objectContaining({ user_id: userId }));

            await designSelectionsRepo.delete(userId, design.id);
            await pool.query("DELETE FROM designs WHERE id = $1;", [design.id]);
        });

        it("excludes a user with no design selections at all", async () => {
            const active = await contributionsRepo.findActiveUsers();
            expect(active).not.toContainEqual(expect.objectContaining({ user_id: userId }));
        });
    });
});

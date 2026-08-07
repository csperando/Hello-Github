import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import RunLogRepository from "../../repository/runLog.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("RunLogRepository", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const runLogRepo = RunLogRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -12;

    let userId: string;
    let designId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-runlog-repo-test",
            github_email: "octocat-runlog-repo-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-runlog-repo-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEy",
            github_profile_url: "https://github.com/octocat-runlog-repo-test",
            avatar_url: "https://avatars.githubusercontent.com/u/12?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        designId = design.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM run_log WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    describe("create / existsForUserAndDate", () => {
        it("creates a row and existsForUserAndDate reports it", async () => {
            expect(await runLogRepo.existsForUserAndDate(userId, "2026-01-04")).toBe(false);

            const row = await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            });

            expect(row.user_id).toBe(userId);
            expect(row.target_date).toBe("2026-01-04");
            expect(row.commit_count).toBe(5);
            expect(row.status).toBe("committed");
            expect(await runLogRepo.existsForUserAndDate(userId, "2026-01-04")).toBe(true);
        });

        it("existsForUserAndDate is false for a different date", async () => {
            await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            });

            expect(await runLogRepo.existsForUserAndDate(userId, "2026-01-05")).toBe(false);
        });

        it("rejects a second row for the same (user, target_date)", async () => {
            await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            });

            await expect(
                runLogRepo.create({
                    user_id: userId,
                    design_id: designId,
                    target_date: "2026-01-04",
                    commit_count: 2,
                    status: "committed",
                }),
            ).rejects.toThrow();
        });

        it("allows design_id to be null (e.g. a failed run with no design resolved)", async () => {
            const row = await runLogRepo.create({
                user_id: userId,
                target_date: "2026-01-04",
                commit_count: 0,
                status: "failed",
            });

            expect(row.design_id).toBeNull();
        });
    });

    describe("pruneOlderThan", () => {
        it("deletes rows older than the given number of days and leaves recent ones", async () => {
            await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            });
            // backdate created_at directly - the repo always writes NOW()
            await pool.query(
                `UPDATE run_log SET created_at = NOW() - interval '100 days' WHERE user_id = $1 AND target_date = '2026-01-04';`,
                [userId],
            );
            await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-11",
                commit_count: 3,
                status: "committed",
            });

            const deletedCount = await runLogRepo.pruneOlderThan(90);

            expect(deletedCount).toBe(1);
            expect(await runLogRepo.existsForUserAndDate(userId, "2026-01-04")).toBe(false);
            expect(await runLogRepo.existsForUserAndDate(userId, "2026-01-11")).toBe(true);
        });
    });

    describe("getLatestPerDesignForUser", () => {
        it("returns the most recent row per design", async () => {
            const secondDesign = await designsRepo.create(userId, { pattern: [0, 0, 0, 0, 0, 0, 0] });

            await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            });
            await runLogRepo.create({
                user_id: userId,
                design_id: designId,
                target_date: "2026-01-11",
                commit_count: 3,
                status: "failed",
            });
            // a different date: run_log's UNIQUE(user_id, target_date) means one row per
            // day regardless of design (a user only ever has one active selection at a
            // time), so two designs' runs for the same user can never share a date
            await runLogRepo.create({
                user_id: userId,
                design_id: secondDesign.id,
                target_date: "2026-01-18",
                commit_count: 1,
                status: "committed",
            });

            const latest = await runLogRepo.getLatestPerDesignForUser(userId);

            expect(latest).toHaveLength(2);
            const forFirst = latest.find((r: any) => r.design_id === designId);
            expect(forFirst.target_date).toBe("2026-01-11");
            expect(forFirst.status).toBe("failed");
            const forSecond = latest.find((r: any) => r.design_id === secondDesign.id);
            expect(forSecond.target_date).toBe("2026-01-18");

            await pool.query("DELETE FROM designs WHERE id = $1;", [secondDesign.id]);
        });

        it("returns an empty array for a user with no runs", async () => {
            expect(await runLogRepo.getLatestPerDesignForUser(userId)).toEqual([]);
        });
    });
});

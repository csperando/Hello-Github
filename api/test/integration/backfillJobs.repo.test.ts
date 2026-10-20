import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import BackfillJobsRepository from "../../repository/backfillJobs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import UserProfileRepository from "../../repository/userProfiles.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("BackfillJobsRepository", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const backfillRepo = BackfillJobsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    const profilesRepo = UserProfileRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -108;

    let userId: string;
    let designId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-backfill-repo-test",
            github_email: "octocat-backfill-repo-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-backfill-repo-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwOA==",
            github_profile_url: "https://github.com/octocat-backfill-repo-test",
            avatar_url: "https://avatars.githubusercontent.com/u/108?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        designId = design.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM backfill_jobs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM user_profiles WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    afterAll(async () => {
        await pool.end();
    });

    it("creates a job awaiting its issue", async () => {
        const job = await backfillRepo.create(userId, designId, 2024);

        expect(job).toMatchObject({ user_id: userId, design_id: designId, year: 2024, status: "awaiting_issue", issue_url: null });
        expect(await backfillRepo.getByUserAndDesign(userId, designId)).toMatchObject({ id: job.id });
    });

    it("create is idempotent for a redelivered payment: returns the existing job", async () => {
        const first = await backfillRepo.create(userId, designId, 2024);
        const second = await backfillRepo.create(userId, designId, 2024);

        expect(second.id).toBe(first.id);
    });

    it("markIssueOpened stores the issue url and moves the job to ready", async () => {
        const job = await backfillRepo.create(userId, designId, 2024);

        const updated = await backfillRepo.markIssueOpened(job.id, "https://github.com/o/r/issues/1");

        expect(updated).toMatchObject({ status: "ready", issue_url: "https://github.com/o/r/issues/1" });
    });

    it("claimReady hands each ready job out once, marking it painting", async () => {
        const job = await backfillRepo.create(userId, designId, 2024);
        expect(await backfillRepo.claimReady()).toEqual([]);

        await backfillRepo.markIssueOpened(job.id, "https://github.com/o/r/issues/1");

        const claimed = await backfillRepo.claimReady();
        expect(claimed.map((j: { id: string }) => j.id)).toContain(job.id);
        expect(claimed.find((j: { id: string }) => j.id === job.id)).toMatchObject({ status: "painting" });

        const again = await backfillRepo.claimReady();
        expect(again.map((j: { id: string }) => j.id)).not.toContain(job.id);
    });

    it("setStatus records the final outcome", async () => {
        const job = await backfillRepo.create(userId, designId, 2024);

        const done = await backfillRepo.setStatus(job.id, "done");

        expect(done).toMatchObject({ status: "done" });
    });

    it("getPaintDetails joins each job with what painting it needs", async () => {
        await selectionsRepo.create(userId, designId, {
            start_date: "2024-12-29",
            year: 2025,
            custom_range: true,
        });
        await profilesRepo.upsert(userId, { timezone: "America/Chicago" });
        const job = await backfillRepo.create(userId, designId, 2025);

        const [details] = await backfillRepo.getPaintDetails([job.id]);

        expect(details).toMatchObject({
            job_id: job.id,
            user_id: userId,
            github_id: testGitHubId,
            github_username: "octocat-backfill-repo-test",
            design_id: designId,
            year: 2025,
            timezone: "America/Chicago",
            use_real_email: false,
            pattern: [0, 1, 2, 3, 4, 0, 0],
            start_date: "2024-12-29",
            custom_range: true,
        });
    });

    it("getPaintDetails omits a job whose selection is gone, and defaults timezone to UTC", async () => {
        const orphan = await backfillRepo.create(userId, designId, 2025);
        expect(await backfillRepo.getPaintDetails([orphan.id])).toEqual([]);

        await selectionsRepo.create(userId, designId, { start_date: "2024-12-29", year: 2025 });
        const [details] = await backfillRepo.getPaintDetails([orphan.id]);
        expect(details).toMatchObject({ timezone: "UTC" });
    });

    it("getPaintDetails returns nothing for no job ids", async () => {
        expect(await backfillRepo.getPaintDetails([])).toEqual([]);
    });
});

import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import BackfillJobsRepository from "../../repository/backfillJobs.repo";
import type { iPaintSnapshot } from "../../repository/backfillJobs.repo";
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
    const pattern = [0, 1, 2, 3, 4, 0, 0];

    let userId: string;
    let designId: string;
    let selectionId: string;
    let snapshot: iPaintSnapshot;

    // each test's payment intents are unique, so a leftover row can't collide
    let piCounter = 0;
    const nextPi = () => `pi_test_backfill_repo_${Date.now()}_${piCounter++}`;

    const paintStatus = async () => (await selectionsRepo.getByUserAndDesign(userId, designId)).paint_status;

    /** Checkout + payment: a pending job moved to awaiting_issue. */
    async function paidJob(copy: iPaintSnapshot = snapshot) {
        const pi = nextPi();
        await backfillRepo.createPending(selectionId, copy, pi);
        return backfillRepo.markPaid(pi);
    }

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

        const design = await designsRepo.create(userId, { pattern });
        designId = design.id;
        const selection = await selectionsRepo.create(userId, designId, { start_date: "2024-12-29", year: 2025 });
        selectionId = selection.id;
        snapshot = { year: 2025, pattern, start_date: "2024-12-29", custom_range: false };
    });

    afterEach(async () => {
        await pool.query(
            "DELETE FROM backfill_jobs WHERE selection_id IN (SELECT id FROM design_selections WHERE user_id = $1);",
            [userId],
        );
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM user_profiles WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    afterAll(async () => {
        await pool.end();
    });

    describe("checkout -> payment", () => {
        it("createPending makes a pending_payment job holding its own copy of what to paint", async () => {
            const job = await backfillRepo.createPending(selectionId, snapshot, nextPi());

            expect(job).toMatchObject({
                selection_id: selectionId,
                status: "pending_payment",
                year: 2025,
                pattern,
                start_date: "2024-12-29",
                custom_range: false,
                issue_url: null,
            });
        });

        it("createPending is idempotent per payment intent - a retried checkout keeps the first copy", async () => {
            const pi = nextPi();
            const first = await backfillRepo.createPending(selectionId, snapshot, pi);
            const second = await backfillRepo.createPending(selectionId, { ...snapshot, year: 2024 }, pi);

            expect(second.id).toBe(first.id);
            expect(second.year).toBe(2025);
        });

        it("markPaid moves the paid job to awaiting_issue", async () => {
            const job = await paidJob();

            expect(job.status).toBe("awaiting_issue");
            expect(job.completed_at).toBeNull();
        });

        it("markPaid cancels the paid job when another paint already has the selection locked", async () => {
            await paidJob();
            const second = await paidJob();

            expect(second.status).toBe("cancelled");
            expect(second.completed_at).not.toBeNull();
        });

        it("markPaid returns nothing for an unknown or already-handled payment", async () => {
            const pi = nextPi();
            await backfillRepo.createPending(selectionId, snapshot, pi);
            await backfillRepo.markPaid(pi);

            expect(await backfillRepo.markPaid(pi)).toBeUndefined();
            expect(await backfillRepo.markPaid("pi_unknown")).toBeUndefined();
        });

        it("cancelByPaymentIntent closes a pending job only", async () => {
            const pendingPi = nextPi();
            await backfillRepo.createPending(selectionId, snapshot, pendingPi);
            expect((await backfillRepo.cancelByPaymentIntent(pendingPi)).status).toBe("cancelled");

            const paid = await paidJob();
            expect(await backfillRepo.cancelByPaymentIntent(paid.stripe_payment_intent_id)).toBeUndefined();
        });
    });

    describe("the database allows one locking job per selection", () => {
        it("rejects a second awaiting_issue/ready/painting job for the same selection", async () => {
            await paidJob();
            const pending = await backfillRepo.createPending(selectionId, snapshot, nextPi());

            await expect(
                pool.query("UPDATE backfill_jobs SET status = 'ready' WHERE id = $1;", [pending.id]),
            ).rejects.toThrow();
        });

        it("allows any number of finished jobs", async () => {
            for (const status of ["done", "failed", "done"]) {
                const job = await paidJob();
                await backfillRepo.setStatus(job.id, status as "done" | "failed");
            }
            const count = await pool.query("SELECT COUNT(*)::int AS n FROM backfill_jobs WHERE selection_id = $1;", [selectionId]);
            expect(count.rows[0].n).toBe(3);
        });
    });

    describe("lookups", () => {
        it("getLockingForUserAndDesign finds the in-progress job, not pending or finished ones", async () => {
            await backfillRepo.createPending(selectionId, snapshot, nextPi());
            expect(await backfillRepo.getLockingForUserAndDesign(userId, designId)).toBeUndefined();

            const paid = await paidJob();
            expect((await backfillRepo.getLockingForUserAndDesign(userId, designId)).id).toBe(paid.id);

            await backfillRepo.setStatus(paid.id, "done");
            expect(await backfillRepo.getLockingForUserAndDesign(userId, designId)).toBeUndefined();
        });

        it("getLatestForUserAndDesign returns the most recent job, whatever its status", async () => {
            const first = await paidJob();
            await backfillRepo.setStatus(first.id, "done");
            const pending = await backfillRepo.createPending(selectionId, snapshot, nextPi());

            expect((await backfillRepo.getLatestForUserAndDesign(userId, designId)).id).toBe(pending.id);
        });
    });

    describe("painting", () => {
        it("markIssueOpened stores the issue url and moves the job to ready", async () => {
            const job = await paidJob();

            const ready = await backfillRepo.markIssueOpened(job.id, "https://github.com/o/canvas/issues/1");

            expect(ready).toMatchObject({ status: "ready", issue_url: "https://github.com/o/canvas/issues/1" });
        });

        it("claimReady hands each ready job out once, marking it painting", async () => {
            const job = await paidJob();
            await backfillRepo.markIssueOpened(job.id, "https://github.com/o/canvas/issues/1");

            const claimed = await backfillRepo.claimReady();
            expect(claimed.map((j: { id: string }) => j.id)).toContain(job.id);
            expect(claimed.find((j: { id: string }) => j.id === job.id).status).toBe("painting");

            const again = await backfillRepo.claimReady();
            expect(again.map((j: { id: string }) => j.id)).not.toContain(job.id);
        });

        it("setStatus records the outcome and stamps completed_at only for finished statuses", async () => {
            const job = await paidJob();

            expect((await backfillRepo.setStatus(job.id, "painting")).completed_at).toBeNull();
            const done = await backfillRepo.setStatus(job.id, "done");
            expect(done.status).toBe("done");
            expect(done.completed_at).not.toBeNull();
        });

        it("getPaintDetails paints from the job's copy, not the design as it is now, and defaults timezone to UTC", async () => {
            const job = await paidJob({ year: 2025, pattern, start_date: "2024-12-29", custom_range: true });
            // edits after paying never reach the job
            await designsRepo.update(designId, { pattern: [1, 1, 1, 1, 1, 1, 1] });
            await selectionsRepo.update(userId, designId, { year: 2024, start_date: "2024-03-03" });

            const [details] = await backfillRepo.getPaintDetails([job.id]);

            expect(details).toMatchObject({
                job_id: job.id,
                user_id: userId,
                design_id: designId,
                github_username: "octocat-backfill-repo-test",
                timezone: "UTC",
                year: 2025,
                pattern,
                start_date: "2024-12-29",
                custom_range: true,
            });
        });

        it("getPaintDetails reads the user's timezone", async () => {
            const job = await paidJob();
            await profilesRepo.upsert(userId, { timezone: "America/Chicago" });

            const [details] = await backfillRepo.getPaintDetails([job.id]);

            expect(details.timezone).toBe("America/Chicago");
        });

        it("getPaintDetails returns nothing for no job ids", async () => {
            expect(await backfillRepo.getPaintDetails([])).toEqual([]);
        });
    });

    describe("a selection's worked-out paint_status", () => {
        it("is unpainted before any paint, and pending checkout doesn't change that", async () => {
            expect(await paintStatus()).toBe("unpainted");

            await backfillRepo.createPending(selectionId, snapshot, nextPi());
            expect(await paintStatus()).toBe("unpainted");
        });

        it("is locked from payment until the paint finishes", async () => {
            const job = await paidJob();
            expect(await paintStatus()).toBe("locked");

            await backfillRepo.markIssueOpened(job.id, "https://github.com/o/canvas/issues/1");
            expect(await paintStatus()).toBe("locked");

            await backfillRepo.setStatus(job.id, "painting");
            expect(await paintStatus()).toBe("locked");
        });

        it("is painted once done, while the design still matches what was painted", async () => {
            const job = await paidJob();
            await backfillRepo.setStatus(job.id, "done");

            expect(await paintStatus()).toBe("painted");
        });

        it.each([
            ["the pattern", async () => designsRepo.update(designId, { pattern: [1, 1, 1, 1, 1, 1, 1] })],
            ["the year", async () => selectionsRepo.update(userId, designId, { year: 2024, start_date: "2023-12-31" })],
            ["the start", async () => selectionsRepo.update(userId, designId, { start_date: "2025-01-05" })],
            ["custom range", async () => selectionsRepo.update(userId, designId, { custom_range: true })],
        ])("goes back to unpainted after editing %s", async (_label, edit) => {
            const job = await paidJob();
            await backfillRepo.setStatus(job.id, "done");

            await edit();

            expect(await paintStatus()).toBe("unpainted");
        });

        it("goes back to painted when an edit is undone", async () => {
            const job = await paidJob();
            await backfillRepo.setStatus(job.id, "done");

            await designsRepo.update(designId, { pattern: [1, 1, 1, 1, 1, 1, 1] });
            await designsRepo.update(designId, { pattern });

            expect(await paintStatus()).toBe("painted");
        });

        it("is error when the latest paint failed", async () => {
            const job = await paidJob();
            await backfillRepo.setStatus(job.id, "failed");

            expect(await paintStatus()).toBe("error");
        });

        it("follows the latest finished paint, and ignores cancelled jobs", async () => {
            const failed = await paidJob();
            await backfillRepo.setStatus(failed.id, "failed");
            const done = await paidJob();
            await backfillRepo.setStatus(done.id, "done");
            const abandoned = nextPi();
            await backfillRepo.createPending(selectionId, snapshot, abandoned);
            await backfillRepo.cancelByPaymentIntent(abandoned);

            expect(await paintStatus()).toBe("painted");
        });

        it("repaints: painted in 2025, moved to 2024 and bought again - both jobs keep their own copy", async () => {
            const first = await paidJob();
            await backfillRepo.setStatus(first.id, "done");

            await selectionsRepo.update(userId, designId, { year: 2024, start_date: "2023-12-31" });
            const second = await paidJob({ ...snapshot, year: 2024, start_date: "2023-12-31" });
            expect(second.status).toBe("awaiting_issue");
            expect(await paintStatus()).toBe("locked");

            await backfillRepo.setStatus(second.id, "done");
            expect(await paintStatus()).toBe("painted");

            const jobs = await pool.query("SELECT year, start_date FROM backfill_jobs WHERE selection_id = $1 ORDER BY created_at;", [selectionId]);
            expect(jobs.rows).toEqual([
                { year: 2025, start_date: "2024-12-29" },
                { year: 2024, start_date: "2023-12-31" },
            ]);
        });
    });
});

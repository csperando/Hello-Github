import type { iBackfillJobsRepo } from "../../repository/backfillJobs.repo";
import type { iUserRepo } from "../../repository/users.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const backfillJobsRepoMock = createMockRepoProxy<iBackfillJobsRepo>();
mockRepo("repository/backfillJobs.repo", backfillJobsRepoMock);
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

import { BackfillService } from "../../services/backfill.service";
import { computeCommitTimestamp } from "../../services/scheduler.timing";

function details(overrides: Record<string, unknown> = {}) {
    return {
        job_id: "j1",
        year: 2025,
        user_id: "u1",
        github_id: 583231,
        github_username: "octocat",
        github_email: "octocat@example.com",
        email: null,
        use_real_email: false,
        timezone: "America/Chicago",
        design_id: "d1",
        // the 2025 grid starts on Sunday 2024-12-29
        start_date: "2024-12-29",
        custom_range: false,
        repeat_indefinitely: false,
        recurrence_end_date: null,
        // two weeks, Monday painted in each: 2024-12-30 and 2025-01-06
        pattern: [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
        ...overrides,
    };
}

describe("BackfillService", () => {
    beforeEach(() => {
        backfillJobsRepoMock.__reset();
        usersRepoMock.__reset();
        backfillJobsRepoMock.claimReady.mockResolvedValue([{ id: "j1", status: "painting" }]);
        backfillJobsRepoMock.getPaintDetails.mockResolvedValue([details()]);
        backfillJobsRepoMock.setStatus.mockResolvedValue({});
    });

    describe("claimPaintCommits", () => {
        it("returns nothing (and looks nothing up) when no job is ready", async () => {
            backfillJobsRepoMock.claimReady.mockResolvedValue([]);

            expect(await new BackfillService().claimPaintCommits()).toEqual([]);
            expect(backfillJobsRepoMock.getPaintDetails).not.toHaveBeenCalled();
        });

        it("expands a job into one single-commit entry per painted day inside its year only", async () => {
            const commits = await new BackfillService().claimPaintCommits();

            // 2024-12-30 is painted too, but falls outside the job's year
            expect(commits).toEqual([
                {
                    job_id: "j1",
                    user_id: "u1",
                    github_id: 583231,
                    github_username: "octocat",
                    design_id: "d1",
                    target_date: "2025-01-06",
                    commit_count: 1,
                    commit_author_email: "583231+octocat@users.noreply.github.com",
                    commit_timestamp: computeCommitTimestamp("America/Chicago", "2025-01-06"),
                },
            ]);
            expect(backfillJobsRepoMock.getPaintDetails).toHaveBeenCalledWith(["j1"]);
        });

        it("tiles a repeating custom range through Dec 31 of the year", async () => {
            backfillJobsRepoMock.getPaintDetails.mockResolvedValue([
                details({ pattern: [0, 1, 0, 0, 0, 0, 0], custom_range: true }),
            ]);

            const dates = (await new BackfillService().claimPaintCommits()).map((c) => c.target_date);

            // every Monday of 2025
            expect(dates).toHaveLength(52);
            expect(dates[0]).toBe("2025-01-06");
            expect(dates[dates.length - 1]).toBe("2025-12-29");
        });

        it("tiles a mid-year custom range forward only - nothing before its start", async () => {
            backfillJobsRepoMock.getPaintDetails.mockResolvedValue([
                details({ start_date: "2025-03-02", pattern: [0, 1, 0, 0, 0, 0, 0], custom_range: true }),
            ]);

            const dates = (await new BackfillService().claimPaintCommits()).map((c) => c.target_date);

            expect(dates[0]).toBe("2025-03-03");
            expect(dates[dates.length - 1]).toBe("2025-12-29");
            expect(dates).toHaveLength(44); // Mondays from Mar 3 through Dec 29
        });

        it("authors as the user's real email when they chose it", async () => {
            backfillJobsRepoMock.getPaintDetails.mockResolvedValue([details({ use_real_email: true })]);

            const [commit] = await new BackfillService().claimPaintCommits();
            expect(commit!.commit_author_email).toBe("octocat@example.com");
        });

        it("prefers the synced effective email when present", async () => {
            backfillJobsRepoMock.getPaintDetails.mockResolvedValue([details({ email: "synced@example.com" })]);

            const [commit] = await new BackfillService().claimPaintCommits();
            expect(commit!.commit_author_email).toBe("synced@example.com");
        });

        it("fails a claimed job whose selection is gone, rather than leaving it painting", async () => {
            backfillJobsRepoMock.claimReady.mockResolvedValue([{ id: "j1" }, { id: "j2" }]);

            const commits = await new BackfillService().claimPaintCommits();

            expect(commits.every((c) => c.job_id === "j1")).toBe(true);
            expect(backfillJobsRepoMock.setStatus).toHaveBeenCalledWith("j2", "failed");
        });

        it("marks a job with no painted days in its year done straight away", async () => {
            backfillJobsRepoMock.getPaintDetails.mockResolvedValue([details({ pattern: [0, 0, 0, 0, 0, 0, 0] })]);

            expect(await new BackfillService().claimPaintCommits()).toEqual([]);
            expect(backfillJobsRepoMock.setStatus).toHaveBeenCalledWith("j1", "done");
        });
    });

    describe("completeJobs", () => {
        it("records each job's outcome", async () => {
            backfillJobsRepoMock.setStatus.mockImplementation(async (id: string, status: string) => ({ id, status }));

            const result = await new BackfillService().completeJobs([
                { job_id: "j1", status: "done" },
                { job_id: "j2", status: "failed" },
            ]);

            expect(backfillJobsRepoMock.setStatus).toHaveBeenCalledWith("j1", "done", null);
            expect(backfillJobsRepoMock.setStatus).toHaveBeenCalledWith("j2", "failed", null);
            expect(result).toEqual([{ id: "j1", status: "done" }, { id: "j2", status: "failed" }]);
        });

        it("keeps a failed job's error, for admins to read", async () => {
            backfillJobsRepoMock.setStatus.mockImplementation(async (id: string, status: string) => ({ id, status }));

            await new BackfillService().completeJobs([{ job_id: "j2", status: "failed", error: "git push rejected" }]);

            expect(backfillJobsRepoMock.setStatus).toHaveBeenCalledWith("j2", "failed", "git push rejected");
        });
    });
});

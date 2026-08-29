import type { iSchedulerRepo } from "../../repository/scheduler.repo";
import type { iRunLogRepo } from "../../repository/runLog.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const schedulerRepoMock = createMockRepoProxy<iSchedulerRepo>();
mockRepo("repository/scheduler.repo", schedulerRepoMock);
const runLogRepoMock = createMockRepoProxy<iRunLogRepo>();
mockRepo("repository/runLog.repo", runLogRepoMock);

import { SchedulerService } from "../../services/scheduler.service";
import { deriveCommitCounts, DEFAULT_Q } from "../../services/designs.schedule";

function baseCandidate(overrides: Record<string, unknown> = {}) {
    return {
        user_id: "u1",
        github_id: 583231,
        github_username: "octocat",
        github_email: "octocat@example.com",
        use_real_email: false,
        timezone: "UTC",
        design_id: "d1",
        pattern: [0, 1, 2, 3, 4, 0, 0],
        start_date: "2026-01-04",
        repeat_indefinitely: false,
        recurrence_end_date: null,
        target_date: "2026-01-07", // Wednesday of week 0, intensity 3
        commit_counts: [12, 27, 42, 53], // real q=15 derived counts
        previous_year_commit_counts: null,
        ...overrides,
    };
}

describe("SchedulerService.getDueCommits", () => {
    beforeEach(() => {
        schedulerRepoMock.__reset();
    });

    it("returns a scheduled commit for a due candidate, with the noreply email by default", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([baseCandidate()]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits).toHaveLength(1);
        expect(commits[0]!.userId).toBe("u1");
        expect(commits[0]!.designId).toBe("d1");
        expect(commits[0]!.targetDate).toBe("2026-01-07");
        expect(commits[0]!.commitCount).toBe(42); // intensity 3 -> commit_counts[2]
        expect(commits[0]!.authorEmail).toBe("583231+octocat@users.noreply.github.com");
        expect(commits[0]!.commitTimestamp).toBe("2026-01-07T01:00:00.000Z"); // UTC, 1am default
    });

    it("uses the real email when use_real_email is true and github_email is present", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ use_real_email: true, github_email: "real@example.com" }),
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits[0]!.authorEmail).toBe("real@example.com");
    });

    it("falls back to noreply when use_real_email is true but github_email is missing", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ use_real_email: true, github_email: null }),
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits[0]!.authorEmail).toBe("583231+octocat@users.noreply.github.com");
    });

    it("uses the stored email column verbatim when present, taking priority over the use_real_email/github_email recompute", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ email: "stored@example.com", use_real_email: true, github_email: "real@example.com" }),
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits[0]!.authorEmail).toBe("stored@example.com");
    });

    it("drops a candidate whose selection has lapsed (pattern contributes nothing that day)", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ target_date: "2026-01-20" }), // well past a 1-week, non-repeating pattern
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits).toHaveLength(0);
    });

    it("drops a candidate whose intensity for the day is 0", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ target_date: "2026-01-04" }), // day 0 of [0,1,2,3,4,0,0] -> intensity 0
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits).toHaveLength(0);
    });

    it("falls back to previous_year_commit_counts when this year's commit_counts is missing", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ commit_counts: null, previous_year_commit_counts: [6, 14, 21, 27] }),
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits[0]!.commitCount).toBe(21); // intensity 3 -> previous_year_commit_counts[2]
    });

    it("falls back to the closed-form default when neither this year's nor last year's commit_counts exist (cold start)", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ commit_counts: null, previous_year_commit_counts: null }),
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits[0]!.commitCount).toBe(deriveCommitCounts(DEFAULT_Q)[2]);
    });

    it("computes the commit timestamp using each candidate's own timezone", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ timezone: "Asia/Kolkata" }),
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits[0]!.commitTimestamp).toBe("2026-01-06T19:30:00.000Z");
    });

    it("processes multiple candidates independently, dropping only the ones with nothing to paint", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([
            baseCandidate({ user_id: "u1", target_date: "2026-01-07" }), // intensity 3, kept
            baseCandidate({ user_id: "u2", target_date: "2026-01-04" }), // intensity 0, dropped
            baseCandidate({ user_id: "u3", target_date: "2026-01-08" }), // intensity 4, kept
        ]);

        const commits = await new SchedulerService().getDueCommits();

        expect(commits.map((c) => c.userId).sort()).toEqual(["u1", "u3"]);
    });

    it("passes the window arguments through to the repo", async () => {
        schedulerRepoMock.findDueCandidates.mockResolvedValue([]);

        await new SchedulerService().getDueCommits(2, 6);

        expect(schedulerRepoMock.findDueCandidates).toHaveBeenCalledWith(2, 6);
    });

    it("propagates repo errors without swallowing them", async () => {
        schedulerRepoMock.findDueCandidates.mockRejectedValue(new Error("db down"));

        await expect(new SchedulerService().getDueCommits()).rejects.toThrow("db down");
    });
});

describe("SchedulerService.recordCompletion", () => {
    beforeEach(() => {
        runLogRepoMock.__reset();
    });

    it("delegates to the run_log repo", async () => {
        runLogRepoMock.create.mockResolvedValue({ id: "r1", status: "committed" });

        const result = await new SchedulerService().recordCompletion({
            user_id: "u1",
            target_date: "2026-01-04",
            commit_count: 5,
            status: "committed",
        });

        expect(runLogRepoMock.create).toHaveBeenCalledWith({
            user_id: "u1",
            target_date: "2026-01-04",
            commit_count: 5,
            status: "committed",
        });
        expect(result).toEqual({ id: "r1", status: "committed" });
    });

    it("propagates repo errors without swallowing them (e.g. a UNIQUE(user_id, target_date) conflict)", async () => {
        runLogRepoMock.create.mockRejectedValue(new Error("duplicate key value"));

        await expect(
            new SchedulerService().recordCompletion({
                user_id: "u1",
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            }),
        ).rejects.toThrow("duplicate key value");
    });
});

import type { iUsersContributionsRepo, iActiveContributionUser } from "../../repository/usersContributions.repo";
import type { iRunLogRepo } from "../../repository/runLog.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const contributionsRepoMock = createMockRepoProxy<iUsersContributionsRepo>();
mockRepo("repository/usersContributions.repo", contributionsRepoMock);
const runLogRepoMock = createMockRepoProxy<iRunLogRepo>();
mockRepo("repository/runLog.repo", runLogRepoMock);

jest.mock("../../services/github.service", () => ({
    __esModule: true,
    fetchContributionCalendar: jest.fn(),
}));
import * as githubService from "../../services/github.service";

import { ContributionRefreshService } from "../../services/contributionRefresh.service";

const fetchContributionCalendarMock = githubService.fetchContributionCalendar as jest.Mock;

describe("ContributionRefreshService.refreshForUser", () => {
    beforeEach(() => {
        contributionsRepoMock.__reset();
        runLogRepoMock.__reset();
        fetchContributionCalendarMock.mockReset();
        runLogRepoMock.getCommittedDatesForUser.mockResolvedValue([]);
        contributionsRepoMock.upsert.mockResolvedValue({ user_id: "u1", year: 2026, q: 20, commit_counts: [15, 35, 55, 70] });
    });

    it("computes q/commit_counts from fetched days and upserts them", async () => {
        fetchContributionCalendarMock.mockResolvedValue([
            { date: "2026-01-01", count: 0, level: 0 },
            { date: "2026-01-02", count: 20, level: 2 },
        ]);

        await new ContributionRefreshService().refreshForUser("u1", "octocat", new Date("2026-06-15T00:00:00Z"));

        expect(contributionsRepoMock.upsert).toHaveBeenCalledWith({
            user_id: "u1",
            year: 2026,
            q: 10, // max(count@level2)/2 = 20/2
            commit_counts: [8, 18, 28, 35], // deriveCommitCounts(10)
            max_level_2_contribution: 20,
        });
    });

    it("fetches the current calendar year to date, based on the injected 'today'", async () => {
        fetchContributionCalendarMock.mockResolvedValue([]);

        await new ContributionRefreshService().refreshForUser("u1", "octocat", new Date("2026-06-15T00:00:00Z"));

        expect(fetchContributionCalendarMock).toHaveBeenCalledWith("octocat", "2026-01-01", "2026-06-15");
    });

    it("excludes days present in run_log's committed dates before computing q", async () => {
        fetchContributionCalendarMock.mockResolvedValue([
            { date: "2026-01-02", count: 40, level: 2 }, // would push q to 20 if included
        ]);
        runLogRepoMock.getCommittedDatesForUser.mockResolvedValue(["2026-01-02"]);

        await new ContributionRefreshService().refreshForUser("u1", "octocat", new Date("2026-06-15T00:00:00Z"));

        expect(contributionsRepoMock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ q: null, commit_counts: null, max_level_2_contribution: null }),
        );
    });

    it("upserts null q/commit_counts/max_level_2_contribution on cold start (no usable data)", async () => {
        fetchContributionCalendarMock.mockResolvedValue([
            { date: "2026-01-01", count: 0, level: 0 },
        ]);

        await new ContributionRefreshService().refreshForUser("u1", "octocat", new Date("2026-06-15T00:00:00Z"));

        expect(contributionsRepoMock.upsert).toHaveBeenCalledWith({
            user_id: "u1",
            year: 2026,
            q: null,
            commit_counts: null,
            max_level_2_contribution: null,
        });
    });

    it("returns the persisted row from the repo", async () => {
        fetchContributionCalendarMock.mockResolvedValue([]);
        contributionsRepoMock.upsert.mockResolvedValue({ user_id: "u1", year: 2026, q: null, commit_counts: null });

        const result = await new ContributionRefreshService().refreshForUser("u1", "octocat", new Date("2026-06-15T00:00:00Z"));

        expect(result).toEqual({ user_id: "u1", year: 2026, q: null, commit_counts: null });
    });

    it("propagates errors from the fetch without swallowing them", async () => {
        fetchContributionCalendarMock.mockRejectedValue(new Error("GitHub unreachable"));

        await expect(
            new ContributionRefreshService().refreshForUser("u1", "octocat", new Date("2026-06-15T00:00:00Z")),
        ).rejects.toThrow("GitHub unreachable");
    });
});

describe("ContributionRefreshService.refreshAll", () => {
    beforeEach(() => {
        contributionsRepoMock.__reset();
        runLogRepoMock.__reset();
        fetchContributionCalendarMock.mockReset();
        runLogRepoMock.getCommittedDatesForUser.mockResolvedValue([]);
        contributionsRepoMock.upsert.mockResolvedValue({});
    });

    it("refreshes every active user and reports how many succeeded", async () => {
        const activeUsers: iActiveContributionUser[] = [
            { user_id: "u1", github_username: "octocat" },
            { user_id: "u2", github_username: "monalisa" },
        ];
        contributionsRepoMock.findActiveUsers.mockResolvedValue(activeUsers);
        fetchContributionCalendarMock.mockResolvedValue([]);

        const result = await new ContributionRefreshService().refreshAll(new Date("2026-06-15T00:00:00Z"));

        expect(result).toEqual({ refreshed: 2, failed: 0 });
        expect(fetchContributionCalendarMock).toHaveBeenCalledWith("octocat", "2026-01-01", "2026-06-15");
        expect(fetchContributionCalendarMock).toHaveBeenCalledWith("monalisa", "2026-01-01", "2026-06-15");
    });

    it("continues past a single user's failure and still reports it", async () => {
        contributionsRepoMock.findActiveUsers.mockResolvedValue([
            { user_id: "u1", github_username: "octocat" },
            { user_id: "u2", github_username: "monalisa" },
        ]);
        fetchContributionCalendarMock
            .mockRejectedValueOnce(new Error("GitHub unreachable"))
            .mockResolvedValueOnce([]);

        const result = await new ContributionRefreshService().refreshAll(new Date("2026-06-15T00:00:00Z"));

        expect(result).toEqual({ refreshed: 1, failed: 1 });
    });

    it("returns zero counts when there are no active users", async () => {
        contributionsRepoMock.findActiveUsers.mockResolvedValue([]);

        const result = await new ContributionRefreshService().refreshAll(new Date("2026-06-15T00:00:00Z"));

        expect(result).toEqual({ refreshed: 0, failed: 0 });
    });
});

import UsersContributionsRepository from "../repository/usersContributions.repo";
import RunLogRepository from "../repository/runLog.repo";
import { fetchContributionCalendar } from "./github.service";
import { computeQ, deriveCommitCounts, maxContributionAtLevel, iContributionDay } from "./designs.schedule";
import { logger } from "../config/logger";

export interface iRefreshedContributions {
    user_id: string;
    year: number;
    q: number | null;
    commit_counts: number[] | null;
}

export interface iRefreshAllResult {
    refreshed: number;
    failed: number;
}

export class ContributionRefreshService {
    public contributionsRepo: any;
    public runLogRepo: any;

    constructor() {
        this.contributionsRepo = UsersContributionsRepository.repo();
        this.runLogRepo = RunLogRepository.repo();
    }

    /**
     * Recomputes and persists one user's current-year q/commit_counts from
     * their real, already-rendered GitHub contribution data. Days this app
     * already knows it painted (via run_log) are excluded before computing
     * q, so our own commits never feed back into the calculation - see
     * .claude/tmp/goal.md's feedback-loop mitigation.
     */
    public async refreshForUser(userId: string, githubUsername: string, today: Date = new Date()): Promise<iRefreshedContributions> {
        try {
            const year = today.getUTCFullYear();
            const from = `${year}-01-01`;
            const to = today.toISOString().slice(0, 10);

            const [allDays, paintedDates] = await Promise.all([
                fetchContributionCalendar(githubUsername, from, to),
                this.runLogRepo.getCommittedDatesForUser(userId, from, to),
            ]);

            const paintedDateSet = new Set(paintedDates);
            const organicDays: iContributionDay[] = allDays.filter((day) => !paintedDateSet.has(day.date));

            const q = computeQ(organicDays);
            const commitCounts = q === null ? null : deriveCommitCounts(q);
            const maxLevel2Contribution = q === null ? null : maxContributionAtLevel(organicDays, 2);

            const row = await this.contributionsRepo.upsert({
                user_id: userId,
                year,
                q,
                commit_counts: commitCounts,
                max_level_2_contribution: maxLevel2Contribution,
            });

            return { user_id: row.user_id, year: row.year, q: row.q, commit_counts: row.commit_counts };

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    /**
     * Refreshes every user with an active design selection. Each user is
     * independent - one user's fetch failure (GitHub unreachable, private
     * account, etc.) is logged and counted, not allowed to abort the batch.
     */
    public async refreshAll(today: Date = new Date()): Promise<iRefreshAllResult> {
        const activeUsers = await this.contributionsRepo.findActiveUsers();

        let refreshed = 0;
        let failed = 0;

        for (const user of activeUsers) {
            try {
                await this.refreshForUser(user.user_id, user.github_username, today);
                refreshed++;

            } catch(err: any) {
                logger.error(err);
                failed++;
            }
        }

        return { refreshed, failed };
    }
}

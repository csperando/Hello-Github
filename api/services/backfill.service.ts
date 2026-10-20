import BackfillJobsRepository from "../repository/backfillJobs.repo";
import UserRepository from "../repository/users.repo";
import { createIssue, fetchGitHubUser } from "./github.service";
import { getIntensityForDate } from "./designs.schedule";
// import { computeQ, deriveCommitCounts, DEFAULT_Q } from "./designs.schedule";
// import { fetchContributionCalendar } from "./github.service";
import { computeCommitTimestamp } from "./scheduler.timing";
import { resolveAuthorEmail } from "./scheduler.service";
import { config } from "../config/config";
import { logger } from "../config/logger";

// MVP: every painted day gets exactly one commit. The editor only paints a
// single intensity, so equal counts render evenly, and re-running a stuck
// job just makes a few days two-commit days. The q-based counts below are
// kept for when multiple brush levels come back (see designs.schedule.ts) -
// note painting a mostly empty past year shifts that year's own q, which
// that approach would have to account for.
const COMMITS_PER_PAINTED_DAY = 1;

/** One day's commit for the backfill Action - /scheduler/due's shape plus the job. */
export interface iBackfillCommit {
    job_id: string;
    user_id: string;
    github_id: number;
    github_username: string;
    design_id: string;
    target_date: string;
    commit_count: number;
    commit_author_email: string;
    commit_timestamp: string; // ISO instant for GIT_AUTHOR_DATE/GIT_COMMITTER_DATE
}

export interface iBackfillCompletion {
    job_id: string;
    status: "done" | "failed";
}

/** Every calendar date (YYYY-MM-DD, UTC) of `year`. */
function datesOfYear(year: number): string[] {
    const dates: string[] = [];
    for (let date = new Date(Date.UTC(year, 0, 1)); date.getUTCFullYear() === year; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
}

/**
 * Past-year backfill. GitHub only counts a user's commits in the canvas repo
 * once they have a relationship with it (an opened issue is enough; a star
 * isn't), so after paying, each user grants a one-off public_repo consent and
 * we open that issue as them. The token is used for that one call and dropped.
 */
export class BackfillService {
    public backfillJobsRepo: any;
    public usersRepo: any;

    constructor() {
        this.backfillJobsRepo = BackfillJobsRepository.repo();
        this.usersRepo = UserRepository.repo();
    }

    /** The paid job currently in progress for the user's design (awaiting its issue, queued, or painting), or undefined. */
    public async getJob(userId: string, designId: string): Promise<any> {
        try {
            return await this.backfillJobsRepo.getLockingForUserAndDesign(userId, designId);
        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Opens the canvas-repo issue as the user with a freshly granted token,
     * then moves the job awaiting_issue -> ready. Refuses a token for a
     * different GitHub account than the logged-in user's. Throws on any
     * failure, leaving the job awaiting its issue so the user can retry.
     */
    public async openCanvasIssue(userId: string, designId: string, accessToken: string): Promise<void> {
        const job = await this.backfillJobsRepo.getLockingForUserAndDesign(userId, designId);
        if (!job || job.status !== "awaiting_issue") {
            throw new Error(`paint consent: user ${userId} has no job awaiting its issue for design ${designId}`);
        }

        const user = await this.usersRepo.getUserById(userId);
        const ghUser = await fetchGitHubUser(accessToken);
        if (!user || Number(user.github_id) !== ghUser.id) {
            throw new Error(`paint consent: GitHub account ${ghUser.id} is not user ${userId}'s`);
        }

        const issueUrl = await createIssue(
            accessToken,
            config.PAINT_TARGET_REPO,
            `🎨 @${ghUser.login} is painting their ${job.year} graph`,
            "Opened through Commits for Good to link this account to the canvas repo, so the commits " +
                "painted here count on its contribution graph. Feel free to close it.",
        );

        await this.backfillJobsRepo.markIssueOpened(job.id, issueUrl);
    }

    /**
     * Claims every ready job (ready -> painting, each handed out once) and
     * expands it into one commit per painted day of its year - from the job's
     * own copy of the design, never the live one. A job with no paint details
     * is failed; one with nothing to paint is done - so a claimed job never
     * sits in painting without the Action knowing of it.
     */
    public async claimPaintCommits(): Promise<iBackfillCommit[]> {
        try {
            const jobs = await this.backfillJobsRepo.claimReady();
            if (jobs.length === 0) return [];

            const jobIds: string[] = jobs.map((job: { id: string }) => job.id);
            const detailRows = await this.backfillJobsRepo.getPaintDetails(jobIds);
            const detailsByJob = new Map<string, any>(detailRows.map((row: any) => [row.job_id, row]));

            const commits: iBackfillCommit[] = [];

            for (const jobId of jobIds) {
                const details = detailsByJob.get(jobId);
                if (!details) {
                    logger.error(`backfill: job ${jobId} has no paint details - marking failed`);
                    await this.backfillJobsRepo.setStatus(jobId, "failed");
                    continue;
                }

                // const commitCounts = await this.commitCountsForYear(details.github_username, details.year);

                const schedule = {
                    start_date: details.start_date,
                    repeat_indefinitely: false,
                    custom_range: details.custom_range,
                    year: details.year,
                };
                const authorEmail = resolveAuthorEmail(details);
                let painted = 0;

                for (const date of datesOfYear(details.year)) {
                    const intensity = getIntensityForDate(details.pattern, schedule, date);
                    if (intensity === null || intensity === 0) continue;

                    painted++;
                    commits.push({
                        job_id: jobId,
                        user_id: details.user_id,
                        github_id: details.github_id,
                        github_username: details.github_username,
                        design_id: details.design_id,
                        target_date: date,
                        commit_count: COMMITS_PER_PAINTED_DAY, // commitCounts[intensity - 1]
                        commit_author_email: authorEmail,
                        commit_timestamp: computeCommitTimestamp(details.timezone, date),
                    });
                }

                if (painted === 0) {
                    logger.info(`backfill: job ${jobId} paints nothing in ${details.year} - marking done`);
                    await this.backfillJobsRepo.setStatus(jobId, "done");
                }
            }

            return commits;

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    // Reference for q-based counts (unused - see COMMITS_PER_PAINTED_DAY):
    // the user's real activity that year sets how many commits read as each
    // shade; no activity, or an unreachable calendar, falls back to DEFAULT_Q.
    //
    // private async commitCountsForYear(githubUsername: string, year: number): Promise<[number, number, number, number]> {
    //     try {
    //         const days = await fetchContributionCalendar(githubUsername, `${year}-01-01`, `${year}-12-31`);
    //         return deriveCommitCounts(computeQ(days) ?? DEFAULT_Q);
    //     } catch (err: any) {
    //         logger.error(err);
    //         return deriveCommitCounts(DEFAULT_Q);
    //     }
    // }

    /** Records each job's final outcome as reported by the Action. */
    public async completeJobs(completions: iBackfillCompletion[]): Promise<any[]> {
        try {
            const recorded = [];
            for (const completion of completions) {
                recorded.push(await this.backfillJobsRepo.setStatus(completion.job_id, completion.status));
            }
            return recorded;

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }
}

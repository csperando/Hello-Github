import SchedulerRepository from "../repository/scheduler.repo";
import RunLogRepository from "../repository/runLog.repo";
import { getIntensityForDate, deriveCommitCounts, DEFAULT_Q } from "./designs.schedule";
import { computeCommitTimestamp } from "./scheduler.timing";
import { computeNoreplyEmail } from "./github.service";
import { logger } from "../config/logger";

// closed-form fallback for a candidate with no users_contributions data at
// all yet (brand-new account, first refresh hasn't landed) - computed once
// at module load since DEFAULT_Q never changes at runtime.
const FALLBACK_COMMIT_COUNTS = deriveCommitCounts(DEFAULT_Q);

export interface iScheduledCommit {
    userId: string;
    githubId: number;
    githubUsername: string;
    designId: string;
    targetDate: string;
    commitCount: number;
    authorEmail: string;
    commitTimestamp: string; // ISO instant for GIT_AUTHOR_DATE/GIT_COMMITTER_DATE
}

export interface iCompletionReport {
    user_id: string;
    target_date: string;
    commit_count: number;
    status: "committed" | "failed";
}

export class SchedulerService {
    public repo: any;
    public runLogRepo: any;

    constructor() {
        this.repo = SchedulerRepository.repo();
        this.runLogRepo = RunLogRepository.repo();
    }

    /**
     * Due candidates (repo layer) enriched into concrete commits to make:
     * the day's intensity/commit count from the design's pattern, the
     * author email per the user's noreply-vs-real preference, and the
     * precise UTC instant to stamp as GIT_AUTHOR_DATE/GIT_COMMITTER_DATE -
     * this stamping is what makes correctness independent of when the
     * workflow that actually builds the commits runs (the repo layer's
     * timezone-window check only needs to be reasonably close, not exact).
     * Candidates whose pattern contributes nothing today (lapsed one-off,
     * or an intensity-0 day) are silently dropped, not returned as a
     * zero-commit entry.
     */
    public async getDueCommits(windowStartHour?: number, windowEndHourExclusive?: number): Promise<iScheduledCommit[]> {
        try {
            const candidates = await this.repo.findDueCandidates(windowStartHour, windowEndHourExclusive);
            const commits: iScheduledCommit[] = [];

            for (const candidate of candidates) {
                const intensity = getIntensityForDate(
                    candidate.pattern,
                    {
                        start_date: candidate.start_date,
                        repeat_indefinitely: candidate.repeat_indefinitely,
                        recurrence_end_date: candidate.recurrence_end_date,
                    },
                    candidate.target_date,
                );
                if (intensity === null || intensity === 0) continue;

                // this year's precomputed counts -> last year's (rollover
                // fallback) -> the closed-form default (cold start, no
                // users_contributions data at all yet) - see .claude/tmp/goal.md.
                const commitCounts = candidate.commit_counts ?? candidate.previous_year_commit_counts ?? FALLBACK_COMMIT_COUNTS;
                const commitCount = commitCounts[intensity - 1];

                // candidate.email (the synced "effective" address, see
                // UserService.updateProfile) is preferred when present;
                // recomputing here is a defensive fallback, not the primary
                // path - a NULL author email reaching a real `git commit` is
                // a worse failure mode than this extra branch.
                const authorEmail = candidate.email
                    ?? (candidate.use_real_email && candidate.github_email
                        ? candidate.github_email
                        : computeNoreplyEmail(candidate.github_id, candidate.github_username));

                commits.push({
                    userId: candidate.user_id,
                    githubId: candidate.github_id,
                    githubUsername: candidate.github_username,
                    designId: candidate.design_id,
                    targetDate: candidate.target_date,
                    commitCount,
                    authorEmail,
                    commitTimestamp: computeCommitTimestamp(candidate.timezone, candidate.target_date),
                });
            }

            return commits;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    /** Records one due user's outcome in run_log; relies on its UNIQUE(user_id, target_date) as the dedupe safety net. */
    public async recordCompletion(report: iCompletionReport) {
        try {
            const row = await this.runLogRepo.create({
                user_id: report.user_id,
                target_date: report.target_date,
                commit_count: report.commit_count,
                status: report.status,
            });
            return row;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }
}

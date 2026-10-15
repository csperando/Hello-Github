import BackfillJobsRepository from "../repository/backfillJobs.repo";
import UserRepository from "../repository/users.repo";
import { createIssue, fetchGitHubUser } from "./github.service";
import { config } from "../config/config";
import { logger } from "../config/logger";

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

    /** The user's job for a design, or undefined. */
    public async getJob(userId: string, designId: string): Promise<any> {
        try {
            return await this.backfillJobsRepo.getByUserAndDesign(userId, designId);
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
        const job = await this.backfillJobsRepo.getByUserAndDesign(userId, designId);
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
}

// import { BaseService } from "./Base.service";
import UserRepository from "../repository/users.repo";
import UserProfileRepository from "../repository/userProfiles.repo";
import { iUser, iGitHubUpsertInput, iProfileUpdateInput } from "../models/users";
import { computeNoreplyEmail } from "./github.service";
import { ContributionRefreshService } from "./contributionRefresh.service";
import { iConfig } from "../config/config";
import { logger } from "../config/logger";

export class UserService {
    public repo: any;
    public profileRepo: any;

    constructor() {
        this.repo = UserRepository.repo();
        this.profileRepo = UserProfileRepository.repo();
    }

    public async getAllUsers() {
        try {
            const users = await this.repo.getAllUsers() || [];
            return users;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async getUserById(userId: string) {
        try {
            const users = await this.repo.getUserById(userId) || [];
            return users;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }
    
    public async getUserByGitHubUsername(ghUsername: string): Promise<iUser[]> {
        try {
            const users = await this.repo.getUserByGitHubUsername(ghUsername) || [];
            return users;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async getUserByGitHubId(ghId: number): Promise<iUser[]> {
        try {
            const users = await this.repo.getUserByGitHubId(ghId) || [];
            return users;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async upsertFromGitHub(input: iGitHubUpsertInput) {
        try {
            const user = await this.repo.upsertFromGitHub(input);

            // Best-effort, non-blocking: a brand-new or low-activity account
            // often has nothing usable to compute yet (cold-start fallback
            // covers that), and login shouldn't wait on or fail because of
            // this. Not awaited on purpose.
            new ContributionRefreshService()
                .refreshForUser(user.id, String(input.github_username))
                .catch((err: any) => logger.error(err));

            return user;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async insertFromGitHub(input: iGitHubUpsertInput) {
        try {
            const user = await this.repo.insertFromGitHub(input);
            return user;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async updateProfile(userId: string, input: iProfileUpdateInput) {
        try {
            await this.profileRepo.upsert(userId, input);
            const user = await this.repo.getUserById(userId);

            // Kept in sync on every save (not just when use_real_email was in
            // this PATCH body) - the freshly-joined use_real_email already
            // reflects the correct post-upsert value regardless of what
            // specifically changed, so this is a cheap, idempotent no-op
            // when nothing relevant did.
            const effectiveEmail = user.use_real_email
                ? user.github_email
                : (user.github_noreply_email ?? computeNoreplyEmail(user.github_id, user.github_username));

            await this.repo.updateEmailPreference(userId, effectiveEmail);
            user.email = effectiveEmail;

            return user;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }
}

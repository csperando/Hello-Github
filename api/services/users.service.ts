// import { BaseService } from "./Base.service";
import UserRepository from "../repository/users.repo";
import UserProfileRepository from "../repository/userProfiles.repo";
import { iUser, iGitHubUpsertInput, iProfileUpdateInput } from "../models/users";
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
    
    public async getUserByGitHubId(ghId: number) {
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
            return user;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }
}

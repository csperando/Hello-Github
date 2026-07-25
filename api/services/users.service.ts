// import { BaseService } from "./Base.service";
import UserRepository from "../repository/users.repo";
import { iUser, iGitHubUpsertInput } from "../models/users";
import { iConfig } from "../config/config";
import { logger } from "../config/logger";

export class UserService {
    public repo: any;
    
    constructor() {
        this.repo = UserRepository.repo();
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
}

// import { BaseService } from "./Base.service";
import OrgsRepository from "../repository/orgs.repo";
import { iOrg } from "../models/orgs";
import { iConfig } from "../config/config";
import { logger } from "../config/logger";

export class OrgsService {
    public repo: any;
    
    constructor() {
        this.repo = OrgsRepository.repo();
    }

    public async getAllOrgs() {
        try {
            const orgs = await this.repo.getAllOrgs() || [];
            return orgs;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }
}

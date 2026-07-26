import DesignsRepository from "../repository/designs.repo";
import { iDesignCreateInput, iDesignUpdateInput } from "../models/designs";
import { logger } from "../config/logger";

export class DesignService {
    public repo: any;

    constructor() {
        this.repo = DesignsRepository.repo();
    }

    public async createDesign(userId: string, input: iDesignCreateInput) {
        try {
            const design = await this.repo.create(userId, input);
            return design;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async getDesignById(designId: string) {
        try {
            const design = await this.repo.getById(designId);
            return design;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async getDesignsByUserId(userId: string) {
        try {
            const designs = await this.repo.getAllByUserId(userId) || [];
            return designs;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async updateDesign(designId: string, input: iDesignUpdateInput) {
        try {
            const design = await this.repo.update(designId, input);
            return design;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async deleteDesign(designId: string) {
        try {
            const design = await this.repo.delete(designId);
            return design;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }
}

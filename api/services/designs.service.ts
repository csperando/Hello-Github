import pool from "../config/db";
import DesignsRepository from "../repository/designs.repo";
import DesignSelectionsRepository from "../repository/designSelections.repo";
import RunLogRepository from "../repository/runLog.repo";
import {
    iDesignCreateInput,
    iDesignUpdateInput,
    iDesignSelectionCreateInput,
    iDesignSelectionUpdateInput,
} from "../models/designs";
import { logger } from "../config/logger";

export class DesignService {
    public repo: any;
    public selectionsRepo: any;
    public runLogRepo: any;

    constructor() {
        this.repo = DesignsRepository.repo();
        this.selectionsRepo = DesignSelectionsRepository.repo();
        this.runLogRepo = RunLogRepository.repo();
    }

    /**
     * Creates a design and the creator's own initial selection together in
     * one transaction, so a design is never created pivot-less.
     */
    public async createDesign(userId: string, input: iDesignCreateInput) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const design = await this.repo.create(
                userId,
                { name: input.name, is_public: input.is_public, pattern: input.pattern },
                client,
            );
            const selection = await this.selectionsRepo.create(
                userId,
                design.id,
                {
                    start_date: input.start_date,
                    repeat_indefinitely: input.repeat_indefinitely,
                    recurrence_end_date: input.recurrence_end_date,
                },
                client,
            );

            await client.query("COMMIT");
            return { design, selection };

        } catch(err: any) {
            await client.query("ROLLBACK");
            logger.error(err);
            throw(err);
        } finally {
            client.release();
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

    public async getSelectionsByUserId(userId: string) {
        try {
            const selections = await this.selectionsRepo.getAllForUser(userId) || [];
            return selections;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async getSelection(userId: string, designId: string) {
        try {
            const selection = await this.selectionsRepo.getByUserAndDesign(userId, designId);
            return selection;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async countOtherActiveSelections(designId: string, excludingUserId: string) {
        try {
            const count = await this.selectionsRepo.countActiveExcludingUser(designId, excludingUserId);
            return count;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async getLastRunStatuses(userId: string) {
        try {
            const statuses = await this.runLogRepo.getLatestPerDesignForUser(userId) || [];
            return statuses;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async selectDesign(userId: string, designId: string, input: iDesignSelectionCreateInput) {
        try {
            const selection = await this.selectionsRepo.create(userId, designId, input);
            return selection;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    public async updateSelection(userId: string, designId: string, input: iDesignSelectionUpdateInput) {
        try {
            const selection = await this.selectionsRepo.update(userId, designId, input);
            return selection;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    /**
     * Removes the user's selection - the only user-facing "delete" action -
     * and, in the same transaction, deletes the design's content too if
     * zero other selections reference it (application-level cleanup, not a
     * literal FK ON DELETE CASCADE, which would run the wrong direction).
     */
    public async deleteSelection(userId: string, designId: string) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const selection = await this.selectionsRepo.delete(userId, designId, client);
            const remaining = await this.selectionsRepo.countForDesign(designId, client);

            let designDeleted = false;
            if (remaining === 0) {
                await this.repo.delete(designId, client);
                designDeleted = true;
            }

            await client.query("COMMIT");
            return { selection, designDeleted };

        } catch(err: any) {
            await client.query("ROLLBACK");
            logger.error(err);
            throw(err);
        } finally {
            client.release();
        }
    }
}

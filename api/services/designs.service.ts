import pool from "../config/db";
import DesignsRepository from "../repository/designs.repo";
import DesignSelectionsRepository from "../repository/designSelections.repo";
import RunLogRepository from "../repository/runLog.repo";
import DesignPaintStatusesRepository from "../repository/designPaintStatuses.repo";
import UserBillingRepository from "../repository/userBilling.repo";
import {
    iDesignCreateInput,
    iDesignUpdateInput,
    iDesignSelectionCreateInput,
    iDesignSelectionUpdateInput,
} from "../models/designs";
import { logger } from "../config/logger";

/**
 * Thrown when a user tries to activate a design selection without a current
 * paid period. The design routes map err.code === "PAYMENT_REQUIRED" to a
 * 402 with this message.
 */
export class PaymentRequiredError extends Error {
    public code = "PAYMENT_REQUIRED";
    constructor(message = "A current payment is required to activate a design.") {
        super(message);
        this.name = "PaymentRequiredError";
    }
}

/**
 * Thrown when a change is attempted on a design selection while a paid paint
 * is in progress (paint_status "locked"). The design routes map
 * err.code === "DESIGN_LOCKED" to a 409 with this message.
 */
export class DesignLockedError extends Error {
    public code = "DESIGN_LOCKED";
    constructor(message = "This design is being painted - it can't be changed until the paint finishes.") {
        super(message);
        this.name = "DesignLockedError";
    }
}

// The selection fields that say what gets painted - locked while a paint is in progress.
const SCHEDULE_FIELDS = ["start_date", "year", "custom_range", "repeat_indefinitely", "recurrence_end_date"] as const;

export class DesignService {
    public repo: any;
    public selectionsRepo: any;
    public runLogRepo: any;
    public billingRepo: any;
    public paintStatusesRepo: any;

    constructor() {
        this.repo = DesignsRepository.repo();
        this.selectionsRepo = DesignSelectionsRepository.repo();
        this.runLogRepo = RunLogRepository.repo();
        this.billingRepo = UserBillingRepository.repo();
        this.paintStatusesRepo = DesignPaintStatusesRepository.repo();
    }

    /** The paint-status definitions (code/label/description) a selection's paint_status refers to. */
    public async getPaintStatuses() {
        try {
            return await this.paintStatusesRepo.getAll();

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // Activation (is_active -> true) is only allowed while the user has an
    // unelapsed paid period. Painting itself is separately gated in the
    // scheduler; this just keeps the toggle honest in the UI.
    private async assertCoveredForActivation(userId: string, wantsActive: unknown): Promise<void> {
        if (wantsActive !== true) return;
        const billing = await this.billingRepo.getByUserId(userId);
        const covered = !!billing?.paid_until && new Date(billing.paid_until).getTime() > Date.now();
        if (!covered) throw new PaymentRequiredError();
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
                    year: input.year,
                    custom_range: input.custom_range,
                    repeat_indefinitely: input.repeat_indefinitely,
                    recurrence_end_date: input.recurrence_end_date,
                },
                client,
            );

            await client.query("COMMIT");
            // re-read so the selection carries its worked-out paint_status
            const withStatus = await this.selectionsRepo.getByUserAndDesign(userId, design.id);
            return { design, selection: withStatus ?? selection };

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

    private async assertNotLocked(userId: string, designId: string): Promise<void> {
        const selection = await this.selectionsRepo.getByUserAndDesign(userId, designId);
        if (selection?.paint_status === "locked") throw new DesignLockedError();
    }

    /**
     * Content edits are blocked while the design's *owner* has a paint in
     * progress - name/is_public included, so a locked design reads as
     * entirely frozen. (Other users' paints are unaffected either way: every
     * job paints its own copy.)
     */
    public async updateDesign(designId: string, ownerId: string, input: iDesignUpdateInput) {
        try {
            await this.assertNotLocked(ownerId, designId);
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
            await this.assertCoveredForActivation(userId, input.is_active);
            const selection = await this.selectionsRepo.create(userId, designId, input);
            // re-read so the selection carries its worked-out paint_status
            return (await this.selectionsRepo.getByUserAndDesign(userId, designId)) ?? selection;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    /** Returns the updated selection with its (re-worked-out) paint_status. */
    public async updateSelection(userId: string, designId: string, input: iDesignSelectionUpdateInput) {
        try {
            if (SCHEDULE_FIELDS.some((field) => field in input)) {
                await this.assertNotLocked(userId, designId);
            }
            await this.assertCoveredForActivation(userId, input.is_active);
            await this.selectionsRepo.update(userId, designId, input);
            return await this.selectionsRepo.getByUserAndDesign(userId, designId);

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    /**
     * The only user-facing "delete" - soft, so paid history and any paint
     * jobs stay. The user's selection is hidden and deactivated; if they own
     * the design it's soft-deleted too, so nobody can newly select it - but
     * other users' existing selections of it keep working. Refused while a
     * paint is in progress.
     */
    public async deleteSelection(userId: string, designId: string) {
        await this.assertNotLocked(userId, designId);

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const selection = await this.selectionsRepo.softDelete(userId, designId, client);
            const design = await this.repo.getById(designId);
            const designDeleted = !!selection && design?.user_id === userId;
            if (designDeleted) {
                await this.repo.softDelete(designId, client);
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

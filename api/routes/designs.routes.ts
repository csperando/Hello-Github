import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import {
    toPublicDesign,
    toPublicSelection,
    toPublicSelectionWithDesign,
    toPublicRunStatus,
    toPublicPaintStatus,
} from "../models/designs";
import { DesignService } from "../services/designs.service";
import { UserService } from "../services/users.service";
import { requireAuth } from "../middleware/auth.middleware";
import {
    extractDesignCreateInput,
    extractDesignUpdateInput,
    extractDesignSelectionCreateInput,
    extractDesignSelectionUpdateInput,
} from "../services/designs.validation";
import { logger } from "../config/logger";

const router = Router();
let designService: DesignService;
let userService: UserService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    designService = new DesignService();
    userService = new UserService();
    next();
});

function isActiveAdmin(user: any): boolean {
    return !!user && !Array.isArray(user) && user.role === "admin" && user.is_active !== false;
}

// unique_violation - see design_selections' constraints (0004_create_design_selections.sql)
const PG_UNIQUE_VIOLATION = "23505";

// DesignService throws PaymentRequiredError (code "PAYMENT_REQUIRED") when a
// user tries to activate a selection without a current paid period.
function isPaymentRequired(err: any): boolean {
    return err?.code === "PAYMENT_REQUIRED";
}

// DesignService throws DesignLockedError (code "DESIGN_LOCKED") on a change
// attempted while a paid paint is in progress.
function isDesignLocked(err: any): boolean {
    return err?.code === "DESIGN_LOCKED";
}

function sendLocked(res: Response, err: any): void {
    const response: iResponse = { status: 409, success: false, error: err.message };
    res.status(409).json(response);
}

function friendlySelectionConflictMessage(err: any): string | undefined {
    if (err?.code !== PG_UNIQUE_VIOLATION) return undefined;
    if (err.constraint === "idx_design_selections_one_active_per_user") {
        return "You already have another design active. Deactivate it before activating this one.";
    }
    if (err.constraint === "design_selections_user_design_unique") {
        return "You've already selected this design.";
    }
    return "Conflicts with an existing selection.";
}

/**
 * Create a design (owned by the authenticated user) and their own initial
 * selection of it, together.
 */
router.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractDesignCreateInput(req.body ?? {});

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const created = await designService.createDesign(req.user!.id, input!);
        const response: iResponse = { status: 200, success: true, data: [{ design: toPublicDesign(created.design), selection: toPublicSelection(created.selection) }] };
        res.status(200).json(response);

    } catch(err: any) {
        if (isPaymentRequired(err)) {
            const response: iResponse = { status: 402, success: false, error: err.message };
            res.status(402).json(response);
            return;
        }
        const conflict = friendlySelectionConflictMessage(err);
        if (conflict) {
            const response: iResponse = { status: 400, success: false, error: conflict };
            res.status(400).json(response);
            return;
        }
        logger.error(err);
        next(err);
    }
});

/**
 * List the authenticated user's selections (authored and adopted alike),
 * each joined with the design content it points at.
 */
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const selections = await designService.getSelectionsByUserId(req.user!.id);
        const response: iResponse = { status: 200, success: true, data: selections.map(toPublicSelectionWithDesign) };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * The paint-status definitions a selection's paint_status refers to, for the
 * wording shown in the UI. Registered before GET /:designId, like /last-run.
 */
router.get("/paint-statuses", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const statuses = await designService.getPaintStatuses();
        const response: iResponse = { status: 200, success: true, data: statuses.map(toPublicPaintStatus) };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Latest run_log status per design the authenticated user has ever run, for
 * a "last painted 2 hours ago" / "failed" display on the Dashboard. Must be
 * registered before GET /:designId - otherwise "last-run" would be matched
 * as a designId.
 */
router.get("/last-run", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const statuses = await designService.getLastRunStatuses(req.user!.id);
        const response: iResponse = { status: 200, success: true, data: statuses.map(toPublicRunStatus) };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Get a single design's content - the owner, an admin, or anyone if it's
 * public. A deleted design stays readable only through an existing selection
 * of it (or by an admin) - to its deleting owner it's gone.
 */
router.get("/:designId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const design = await designService.getDesignById((req.params.designId as string));

        if (design?.deleted_at) {
            const selection = await designService.getSelection(req.user!.id, req.params.designId as string);
            const requester = selection ? null : await userService.getUserById(req.user!.id);
            if (!selection && !isActiveAdmin(requester)) {
                const response: iResponse = { status: 404, success: false, error: "Design not found." };
                res.status(404).json(response);
                return;
            }
            const response: iResponse = { status: 200, success: true, data: [toPublicDesign(design)] };
            res.status(200).json(response);
            return;
        }

        if (!design) {
            const response: iResponse = { status: 404, success: false, error: "Design not found." };
            res.status(404).json(response);
            return;
        }

        if (design.user_id !== req.user!.id && !design.is_public) {
            const requester = await userService.getUserById(req.user!.id);
            if (!isActiveAdmin(requester)) {
                const response: iResponse = { status: 403, success: false, error: "Forbidden." };
                res.status(403).json(response);
                return;
            }
        }

        const response: iResponse = { status: 200, success: true, data: [toPublicDesign(design)] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Update a design's content (name/is_public/pattern) - owner or admin only,
 * independent of whether the requester currently has an active selection on it.
 */
router.patch("/:designId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const design = await designService.getDesignById((req.params.designId as string));

        if (!design || design.deleted_at) {
            const response: iResponse = { status: 404, success: false, error: "Design not found." };
            res.status(404).json(response);
            return;
        }

        if (design.user_id !== req.user!.id) {
            const requester = await userService.getUserById(req.user!.id);
            if (!isActiveAdmin(requester)) {
                const response: iResponse = { status: 403, success: false, error: "Forbidden." };
                res.status(403).json(response);
                return;
            }
        }

        const { input, error } = extractDesignUpdateInput(req.body ?? {});

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const updated = await designService.updateDesign((req.params.designId as string), design.user_id, input!);
        const response: iResponse = { status: 200, success: true, data: [toPublicDesign(updated)] };
        res.status(200).json(response);

    } catch(err) {
        if (isDesignLocked(err)) {
            sendLocked(res, err);
            return;
        }
        logger.error(err);
        next(err);
    }
});

/**
 * Count how many *other* users currently have an active selection on this
 * design - owner or admin only, used by the frontend to warn ("N users are
 * using this design") before the owner flips is_public off.
 */
router.get("/:designId/selections/count", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const design = await designService.getDesignById((req.params.designId as string));

        if (!design) {
            const response: iResponse = { status: 404, success: false, error: "Design not found." };
            res.status(404).json(response);
            return;
        }

        if (design.user_id !== req.user!.id) {
            const requester = await userService.getUserById(req.user!.id);
            if (!isActiveAdmin(requester)) {
                const response: iResponse = { status: 403, success: false, error: "Forbidden." };
                res.status(403).json(response);
                return;
            }
        }

        const count = await designService.countOtherActiveSelections((req.params.designId as string), req.user!.id);
        const response: iResponse = { status: 200, success: true, data: [{ count }] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Select a design (the owner's own, or an existing public one) for the
 * authenticated user - creates their design_selections row for it.
 */
router.post("/:designId/select", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const design = await designService.getDesignById((req.params.designId as string));

        if (!design || design.deleted_at) {
            const response: iResponse = { status: 404, success: false, error: "Design not found." };
            res.status(404).json(response);
            return;
        }

        if (design.user_id !== req.user!.id && !design.is_public) {
            const requester = await userService.getUserById(req.user!.id);
            if (!isActiveAdmin(requester)) {
                const response: iResponse = { status: 403, success: false, error: "Forbidden." };
                res.status(403).json(response);
                return;
            }
        }

        const { input, error } = extractDesignSelectionCreateInput(
            req.body ?? {},
            (design.pattern as unknown as number[]).length,
        );

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const selection = await designService.selectDesign(req.user!.id, req.params.designId as string, input!);
        const response: iResponse = { status: 200, success: true, data: [toPublicSelection(selection)] };
        res.status(200).json(response);

    } catch(err: any) {
        if (isPaymentRequired(err)) {
            const response: iResponse = { status: 402, success: false, error: err.message };
            res.status(402).json(response);
            return;
        }
        const conflict = friendlySelectionConflictMessage(err);
        if (conflict) {
            const response: iResponse = { status: 400, success: false, error: conflict };
            res.status(400).json(response);
            return;
        }
        logger.error(err);
        next(err);
    }
});

/**
 * Update the authenticated user's own selection of a design (scheduling
 * fields and/or the is_active toggle).
 */
router.patch("/:designId/select", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const design = await designService.getDesignById((req.params.designId as string));

        if (!design) {
            const response: iResponse = { status: 404, success: false, error: "Design not found." };
            res.status(404).json(response);
            return;
        }

        const current = await designService.getSelection(req.user!.id, req.params.designId as string);

        if (!current) {
            const response: iResponse = { status: 404, success: false, error: "You haven't selected this design." };
            res.status(404).json(response);
            return;
        }

        const { input, error } = extractDesignSelectionUpdateInput(
            req.body ?? {},
            current,
            (design.pattern as unknown as number[]).length,
        );

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const updated = await designService.updateSelection(req.user!.id, (req.params.designId as string), input!);
        const response: iResponse = { status: 200, success: true, data: [toPublicSelection(updated)] };
        res.status(200).json(response);

    } catch(err: any) {
        if (isDesignLocked(err)) {
            sendLocked(res, err);
            return;
        }
        if (isPaymentRequired(err)) {
            const response: iResponse = { status: 402, success: false, error: err.message };
            res.status(402).json(response);
            return;
        }
        const conflict = friendlySelectionConflictMessage(err);
        if (conflict) {
            const response: iResponse = { status: 400, success: false, error: conflict };
            res.status(400).json(response);
            return;
        }
        logger.error(err);
        next(err);
    }
});

/**
 * Delete the authenticated user's own selection of a design - the only
 * user-facing "delete", and a soft one (see DesignService.deleteSelection).
 * 409 while a paid paint is in progress.
 */
router.delete("/:designId/select", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const current = await designService.getSelection(req.user!.id, req.params.designId as string);

        if (!current) {
            const response: iResponse = { status: 404, success: false, error: "You haven't selected this design." };
            res.status(404).json(response);
            return;
        }

        const { designDeleted } = await designService.deleteSelection(req.user!.id, req.params.designId as string);
        const response: iResponse = { status: 200, success: true, data: [{ design_deleted: designDeleted }] };
        res.status(200).json(response);

    } catch(err) {
        if (isDesignLocked(err)) {
            sendLocked(res, err);
            return;
        }
        logger.error(err);
        next(err);
    }
});

export default router;

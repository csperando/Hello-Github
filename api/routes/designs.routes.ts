import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { DesignService } from "../services/designs.service";
import { UserService } from "../services/users.service";
import { requireAuth } from "../middleware/auth.middleware";
import { extractDesignCreateInput, extractDesignUpdateInput } from "../services/designs.validation";
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

/**
 * Create a design owned by the authenticated user.
 */
router.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractDesignCreateInput(req.body ?? {});

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const design = await designService.createDesign(req.user!.id, input!);
        const response: iResponse = { status: 200, success: true, data: [design] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * List the authenticated user's own designs.
 */
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const designs = await designService.getDesignsByUserId(req.user!.id);
        const response: iResponse = { status: 200, success: true, data: designs };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Get a single design - the owner, an admin, or anyone if it's public.
 */
router.get("/:designId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const design = await designService.getDesignById((req.params.designId as string));

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

        const response: iResponse = { status: 200, success: true, data: [design] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Update a design - owner or admin only.
 */
router.patch("/:designId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
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

        const { input, error } = extractDesignUpdateInput(req.body ?? {}, design);

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const updated = await designService.updateDesign((req.params.designId as string), input!);
        const response: iResponse = { status: 200, success: true, data: [updated] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Delete a design - owner or admin only.
 */
router.delete("/:designId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
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

        await designService.deleteDesign((req.params.designId as string));
        const response: iResponse = { status: 200, success: true };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

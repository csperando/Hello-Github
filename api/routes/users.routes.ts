import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { UserService } from "../services/users.service";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { iProfileUpdateInput } from "../models/users";
import { logger } from "../config/logger";

const router = Router();
let userService: UserService;

/**
 * Picks only the known profile fields out of a PATCH body (silently ignoring
 * anything else, e.g. role/is_active, so they can't be mass-assigned), and
 * validates the type of whichever of those fields are actually present.
 */
function extractProfileInput(body: Record<string, unknown>): { input: iProfileUpdateInput; error?: string } {
    const input: iProfileUpdateInput = {};

    if ("display_name" in body) {
        if (typeof body.display_name !== "string") {
            return { input, error: "display_name must be a string." };
        }
        input.display_name = body.display_name;
    }

    if ("default_charity" in body) {
        if (typeof body.default_charity !== "string") {
            return { input, error: "default_charity must be a string." };
        }
        input.default_charity = body.default_charity;
    }

    if ("public_opt_in" in body) {
        if (typeof body.public_opt_in !== "boolean") {
            return { input, error: "public_opt_in must be a boolean." };
        }
        input.public_opt_in = body.public_opt_in;
    }

    return { input };
}

function isActiveAdmin(user: any): boolean {
    return !!user && !Array.isArray(user) && user.role === "admin" && user.is_active !== false;
}

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    userService = new UserService();
    next();
});

/**
 * Get all users
 */
router.get("/", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const users = await userService.getAllUsers();
        const response: iResponse = { success: true, status: 200, data: users };
        res.status(200).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Get user by id
 */
router.get("/:userId", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.params.userId) as string || "0";
        const users = await userService.getUserById(userId);

        const response: iResponse = {
            status: 200,
            success: true,
            data: users,
        }

        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Get user by id
 */
router.get("/gh/:ghId", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ghId = (req.params.ghId) as string || "0";
        const users = await userService.getUserByGitHubId(parseInt(ghId));

        const response: iResponse = {
            status: 200,
            success: true,
            data: users,
        }

        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Create new user
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const response: iResponse = { success: false, status: 403 };
        res.status(403).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Update the authenticated user's own profile (display name, default
 * charity, public gallery opt-in), or - for an admin - another user's.
 */
router.patch("/:userId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const targetUserId = req.params.userId as string;
        const requestingUserId = req.user!.id;

        if (requestingUserId !== targetUserId) {
            const requester = await userService.getUserById(requestingUserId);

            if (!isActiveAdmin(requester)) {
                const response: iResponse = { status: 403, success: false, error: "Forbidden." };
                res.status(403).json(response);
                return;
            }

            const targetUser = await userService.getUserById(targetUserId);
            const targetExists = targetUser && !(Array.isArray(targetUser) && targetUser.length === 0);

            if (!targetExists) {
                const response: iResponse = { status: 404, success: false, error: "User not found." };
                res.status(404).json(response);
                return;
            }
        }

        const { input, error } = extractProfileInput(req.body ?? {});

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const user = await userService.updateProfile(targetUserId, input);
        const response: iResponse = { status: 200, success: true, data: [user] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Delete an existing user by id
 */
router.delete("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const response: iResponse = { success: false, status: 403 };
        res.status(403).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

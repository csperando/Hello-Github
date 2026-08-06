import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { UserService } from "../services/users.service";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { extractProfileInput, toPublicUser } from "../models/users";
import * as vUser from "../middleware/validators/users";
import { logger } from "../config/logger";

const router = Router();
let userService: UserService;

function isActiveAdmin(user: any): boolean {
    return !!user && !Array.isArray(user) && user.role === "admin" && user.is_active !== false;
}

router.all("/{*splat}", [requireAuth], async (req: Request, res: Response, next: NextFunction) => {
    userService = new UserService();
    next();
});

/**
 * Get all users
 */
router.get("/", [requireRole("admin")], async (req: Request, res: Response, next: NextFunction) => {
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
router.get("/:userId", [requireRole("admin")], async (req: Request, res: Response, next: NextFunction) => {
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
 * Get user by github username
 */
router.get("/gh/:ghUsername", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ghUsername = (req.params.ghUsername) as string || "0";
        const users = await userService.getUserByGitHubUsername(ghUsername);

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
        const response: iResponse = { success: false, status: 405 };
        res.status(405).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Update the authenticated user's own profile (display name, default
 * charity, public gallery opt-in), or - for an admin - another user's.
 */
router.patch("/:userId", [vUser.patchUserReq], async (req: Request, res: Response, next: NextFunction) => {
    try {
        const targetUserId = req.params.userId as string;
        const requestingUserId = req.user!.id;
        const isSelfService = requestingUserId === targetUserId;

        if (!isSelfService) {
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

        const input = extractProfileInput(req.body ?? {});

        const user = await userService.updateProfile(targetUserId, input);
        const responseData = isSelfService ? toPublicUser(user) : user;
        const response: iResponse = { status: 200, success: true, data: [responseData] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Delete an existing user by id
 */
router.delete("/:userId", [requireRole("admin")], async (req: Request, res: Response, next: NextFunction) => {
    try {
        const response: iResponse = { success: false, status: 405 };
        res.status(405).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

export const userRouter = router;

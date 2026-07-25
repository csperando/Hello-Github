import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { UserService } from "../services/users.service";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { logger } from "../config/logger";

const router = Router();
let userService: UserService;

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
 * Edit an existing user by id
 */
router.patch("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const response: iResponse = { success: false, status: 403 };
        res.status(403).json(response);
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

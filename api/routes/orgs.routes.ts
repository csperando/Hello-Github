import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { OrgsService } from "../services/orgs.service";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { logger } from "../config/logger";

const router = Router();
let orgsService: OrgsService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    orgsService = new OrgsService();
    next();
});

/**
 * Get all organizations
 */
router.get("/", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgs = await orgsService.getAllOrgs();
        const response: iResponse = { success: true, status: 200, data: orgs };
        res.status(200).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { OrgsService } from "../services/orgs.service";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { logger } from "../config/logger";

const router = Router();
let orgsService: OrgsService;

router.all("/{*splat}", [requireAuth], async (req: Request, res: Response, next: NextFunction) => {
    orgsService = new OrgsService();
    next();
});

/**
 * Get all organizations
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        // filters
        const filters = {
            state: req.query.state,
        };

        console.log(filters);
        
        const orgs = await orgsService.getAllOrgs();
        const response: iResponse = { success: true, status: 200, data: orgs };
        res.status(200).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

router.get("/:orgId", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.orgId as string);
        const orgs = await orgsService.getOrgById(id);
        const response: iResponse = { success: true, status: 200, data: orgs };
        res.status(200).json(response);
    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

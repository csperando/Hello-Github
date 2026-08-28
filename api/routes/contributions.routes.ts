import { Router, Request, Response, NextFunction } from "express";
import { iResponse } from "../models/response";
import { ContributionRefreshService } from "../services/contributionRefresh.service";
import { requireApiKey } from "../middleware/apiKey.middleware";
import { logger } from "../config/logger";

const router = Router();

/**
 * Triggers a refresh of every active user's stored q/commit_counts from
 * their real GitHub contribution data - called once daily by
 * actions/refresh-contributions.yml, separate from the hourly paint.yml
 * scheduler. Same shared-secret auth as the scheduler endpoints, since this
 * is also a machine-to-machine call with no user session.
 */
router.post("/refresh", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await new ContributionRefreshService().refreshAll();
        const response: iResponse = { status: 200, success: true, data: result };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

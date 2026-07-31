import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { SchedulerService } from "../services/scheduler.service";
import { requireApiKey } from "../middleware/apiKey.middleware";
import { extractCompletionReports } from "../services/scheduler.validation";
import { logger } from "../config/logger";

const router = Router();
let schedulerService: SchedulerService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    schedulerService = new SchedulerService();
    next();
});

/**
 * Who's due right now, and what to commit for them - called by the canvas-
 * repo workflow. No email or other PII beyond what's already public on
 * GitHub (github_id/github_username) and the commit author email it needs
 * to build the commits.
 */
router.get("/due", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const commits = await schedulerService.getDueCommits();
        const data = commits.map((c) => ({
            user_id: c.userId,
            github_id: c.githubId,
            github_username: c.githubUsername,
            design_id: c.designId,
            target_date: c.targetDate,
            commit_count: c.commitCount,
            commit_author_email: c.authorEmail,
            commit_timestamp: c.commitTimestamp,
        }));
        const response: iResponse = { status: 200, success: true, data };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * The workflow reports back per-user results after pushing; each is
 * recorded in run_log, relying on its UNIQUE(user_id, target_date) as the
 * dedupe safety net for a late/duplicate run.
 */
router.post("/due/complete", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractCompletionReports(req.body ?? []);

        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const recorded = [];
        for (const report of input!) {
            recorded.push(await schedulerService.recordCompletion(report));
        }

        const response: iResponse = { status: 200, success: true, data: recorded };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

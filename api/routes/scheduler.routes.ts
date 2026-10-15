import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { SchedulerService } from "../services/scheduler.service";
import { BackfillService } from "../services/backfill.service";
import { requireApiKey } from "../middleware/apiKey.middleware";
import { extractCompletionReports, extractBackfillCompletions } from "../services/scheduler.validation";
import { logger } from "../config/logger";

const router = Router();
let schedulerService: SchedulerService;
let backfillService: BackfillService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    schedulerService = new SchedulerService();
    backfillService = new BackfillService();
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

/**
 * Claims every ready backfill job (ready -> painting) and returns one entry
 * per painted day - called by the backfill workflow. A POST, not a GET:
 * claiming changes job state, so a retried or prefetched GET mustn't do it.
 */
router.post("/backfill/claim", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await backfillService.claimPaintCommits();

        const response: iResponse = { status: 200, success: true, data };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * The backfill workflow reports each claimed job's outcome after pushing.
 * A job left in painting (the run died before reporting) is retried by
 * setting it back to ready by hand.
 */
router.post("/backfill/complete", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractBackfillCompletions(req.body ?? []);
        if (error) {
            const response: iResponse = { status: 400, success: false, error };
            res.status(400).json(response);
            return;
        }

        const data = await backfillService.completeJobs(input!);

        const response: iResponse = { status: 200, success: true, data };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

export default router;

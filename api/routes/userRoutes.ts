import { Router, NextFunction, Request, Response } from "express";

import { iResponse } from "../models/response";

const router = Router();

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    next();
});

/**
 * Create new user
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const response: iResponse = {
            success: false,
            status: 403,
        }

        res.status(403).json(response);

    } catch(err) {
        next(err);
    }
});

/**
 * Get all users
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const response: iResponse = {
            success: false,
            status: 403,
        }

        res.status(403).json(response);

    } catch(err) {
        next(err);
    }
});

export default router;

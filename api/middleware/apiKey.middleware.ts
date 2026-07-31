import { Request, Response, NextFunction } from "express";
import { iResponse } from "../models/response";
import { config } from "../config/config";

/**
 * Machine-to-machine auth for the scheduler endpoints - the canvas-repo
 * workflow calls these with no user session, just a shared secret header.
 * Separate from the cookie-based requireAuth used everywhere else.
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
    const providedKey = req.header("X-API-Key");

    if (!providedKey || providedKey !== config.SCHEDULER_API_KEY) {
        const response: iResponse = { status: 401, success: false, error: "Invalid or missing API key." };
        res.status(401).json(response);
        return;
    }

    next();
};

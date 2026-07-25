import { Request, Response, NextFunction } from "express";
import { iResponse } from "../models/response";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const userId = req.signedCookies?.sid;

    if (!userId) {
        const response: iResponse = { status: 401, success: false, error: "Not authenticated." };
        res.status(401).json(response);
        return;
    }

    req.user = { id: userId };
    next();
};

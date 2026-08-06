import { Request, Response, NextFunction } from "express";
import { iResponse } from "../../models/response";
import { validateProfileInput } from "../../models/users";
import { UserService } from "../../services/users.service";
import { logger } from "../../config/logger";

export function patchUserReq(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        const response: iResponse = { status: 401, success: false, error: "Not authenticated." };
        res.status(401).json(response);
        return;
    }

    const errors = validateProfileInput(req.body ?? {});
    if (errors.length) {
        const response: iResponse = { status: 400, success: false, errors };
        res.status(400).json(response);
        return;
    }

    next();
}

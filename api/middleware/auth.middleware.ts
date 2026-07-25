import { Request, Response, NextFunction } from "express";
import { iResponse } from "../models/response";
import { Role } from "../models/users";
import { UserService } from "../services/users.service";
import { logger } from "../config/logger";

const userService = new UserService();

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

/**
 * Must run after requireAuth. Looks up the requesting user's role/is_active
 * on every call (not cached on req.user by requireAuth) so it always
 * reflects the current DB state.
 */
export const requireRole = (...allowedRoles: Role[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user?.id) {
            const response: iResponse = { status: 401, success: false, error: "Not authenticated." };
            res.status(401).json(response);
            return;
        }

        try {
            const user = await userService.getUserById(req.user.id);

            if (!allowedRoles.includes(user.role) || user.is_active === false) {
                const response: iResponse = { status: 403, success: false, error: "Forbidden." };
                res.status(403).json(response);
                return;
            }

            req.user.role = user.role;
            next();

        } catch (err) {
            logger.error(err);
            next(err);
        }
    };
};

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { iResponse } from "../models/response";
import { logger } from "../config/logger";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Final catch for anything a route passed to next(err). The full error is
 * logged server-side under a short ref; the client only ever gets a generic
 * message plus that ref - never the error object itself, which for Stripe
 * and pg errors carries account ids, headers, table/constraint names and
 * row values.
 *
 * The one exception is an http-errors style error that marks itself safe
 * (expose: true with a 4xx status) - e.g. body-parser's malformed-JSON 400 -
 * whose own message is meant for the client.
 */
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    const status = Number(err?.status ?? err?.statusCode);

    if (err?.expose === true && status >= 400 && status < 500) {
        const response: iResponse = { status, success: false, error: String(err.message) };
        res.status(status).json(response);
        return;
    }

    const ref = crypto.randomBytes(4).toString("hex");
    logger.error({ ref, method: req.method, path: req.path, err }, `unhandled error [${ref}]`);

    const response: iResponse = { status: 500, success: false, error: `${GENERIC_ERROR} (ref: ${ref})` };
    res.status(500).json(response);
};

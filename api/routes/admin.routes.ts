import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { toAdminPayment, toAdminJob, toAdminUserSummary, toAdminUserDetail } from "../models/admin";
import { AdminService, AdminActionError } from "../services/admin.service";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
    isUuid,
    extractAdminPaymentFilters,
    extractJobFilter,
    extractUserSearch,
} from "../services/admin.validation";
import { logger } from "../config/logger";

/**
 * The admin console's API. Every route: a signed-in, active admin -
 * requireRole re-reads the requester's role/is_active on each call.
 */
const router = Router();
let adminService: AdminService;

router.use(requireAuth, requireRole("admin"));

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    adminService = new AdminService();
    next();
});

function send(res: Response, status: number, body: Omit<iResponse, "status" | "success"> & { success?: boolean }) {
    res.status(status).json({ status, success: status < 400, ...body } as iResponse);
}

// AdminActionError carries its own status; anything else is unexpected.
function fail(res: Response, next: NextFunction, err: unknown) {
    if (err instanceof AdminActionError) {
        send(res, err.status, { error: err.message });
        return;
    }
    logger.error(err);
    next(err);
}

// ids go to uuid columns - a malformed one is simply not found
function requireUuidParams(...names: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (names.every((name) => isUuid(req.params[name]))) {
            next();
            return;
        }
        send(res, 404, { error: "Not found." });
    };
}

// ---- payments ---------------------------------------------------------------

router.get("/payments", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractAdminPaymentFilters(req.query as Record<string, unknown>);
        if (error) {
            send(res, 400, { error });
            return;
        }
        const payments = await adminService.listPayments(input!);
        send(res, 200, { data: payments.map(toAdminPayment) });

    } catch (err) {
        fail(res, next, err);
    }
});

/** Record a refund made in Stripe - moves no money. */
router.patch("/payments/:paymentId", requireUuidParams("paymentId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payment = await adminService.recordRefund(req.user!.id, req.params.paymentId as string, req.body ?? {});
        send(res, 200, { data: [toAdminPayment(payment)] });

    } catch (err) {
        fail(res, next, err);
    }
});

router.get("/payments/:paymentId/history", requireUuidParams("paymentId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const history = await adminService.paymentHistory(req.params.paymentId as string);
        send(res, 200, { data: history });

    } catch (err) {
        fail(res, next, err);
    }
});

// ---- paint jobs -------------------------------------------------------------

/** data[0]: { jobs, counts } - counts per filter, for the filter tabs. */
router.get("/jobs", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { filter, error } = extractJobFilter(req.query as Record<string, unknown>);
        if (error) {
            send(res, 400, { error });
            return;
        }
        const { jobs, counts } = await adminService.listJobs(filter!);
        send(res, 200, { data: [{ jobs: jobs.map(toAdminJob), counts }] });

    } catch (err) {
        fail(res, next, err);
    }
});

/** A failed paint back in the queue, repainting its same copy - no new payment. */
router.post("/jobs/:jobId/retry", requireUuidParams("jobId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const job = await adminService.retryJob(req.user!.id, req.params.jobId as string);
        send(res, 200, { data: [toAdminJob(job)] });

    } catch (err) {
        fail(res, next, err);
    }
});

router.post("/jobs/:jobId/cancel", requireUuidParams("jobId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const job = await adminService.cancelJob(req.user!.id, req.params.jobId as string);
        send(res, 200, { data: [toAdminJob(job)] });

    } catch (err) {
        fail(res, next, err);
    }
});

router.get("/jobs/:jobId/history", requireUuidParams("jobId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const history = await adminService.jobHistory(req.params.jobId as string);
        send(res, 200, { data: history });

    } catch (err) {
        fail(res, next, err);
    }
});

// ---- users ------------------------------------------------------------------

router.get("/users", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { search, error } = extractUserSearch(req.query as Record<string, unknown>);
        if (error) {
            send(res, 400, { error });
            return;
        }
        const users = await adminService.listUsers(search!);
        send(res, 200, { data: users.map(toAdminUserSummary) });

    } catch (err) {
        fail(res, next, err);
    }
});

router.get("/users/:userId", requireUuidParams("userId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const detail = await adminService.getUser(req.params.userId as string);
        send(res, 200, { data: [toAdminUserDetail(detail)] });

    } catch (err) {
        fail(res, next, err);
    }
});

router.patch("/users/:userId", requireUuidParams("userId"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const detail = await adminService.updateUser(req.user!.id, req.params.userId as string, req.body ?? {});
        send(res, 200, { data: [toAdminUserDetail(detail)] });

    } catch (err) {
        fail(res, next, err);
    }
});

router.post(
    "/users/:userId/designs/:designId/restore",
    requireUuidParams("userId", "designId"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const detail = await adminService.restoreDesign(
                req.user!.id,
                req.params.userId as string,
                req.params.designId as string,
            );
            send(res, 200, { data: [toAdminUserDetail(detail)] });

        } catch (err) {
            fail(res, next, err);
        }
    },
);

export default router;

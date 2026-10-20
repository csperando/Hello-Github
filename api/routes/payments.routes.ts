import { Router, NextFunction, Request, Response } from "express";
import { iResponse } from "../models/response";
import { toPublicPayment, toPublicPaintStatus } from "../models/payments";
import { PaymentsService } from "../services/payments.service";
import { extractCheckoutInput, extractSubscriptionPatch } from "../services/payments.validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requireApiKey } from "../middleware/apiKey.middleware";
import { logger } from "../config/logger";

const router = Router();
let paymentsService: PaymentsService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    paymentsService = new PaymentsService();
    next();
});

/**
 * Start a checkout for one design (plus optional donation). Returns a
 * Stripe client secret for the frontend Payment Element to confirm.
 * Nothing is granted here - a verified webhook creates the design's
 * backfill job.
 */
router.post("/checkout", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractCheckoutInput(req.body ?? {});
        if (error) {
            res.status(400).json({ status: 400, success: false, error } as iResponse);
            return;
        }

        const result = await paymentsService.createCheckout({
            userId: req.user!.id,
            designId: input!.designId,
            charityEinId: input!.charityEinId ?? null,
            totalCents: input!.totalCents,
            platformCents: input!.platformCents,
            attemptId: input!.attemptId,
        });

        if (result.error) {
            const status = result.locked ? 409 : 400;
            res.status(status).json({ status, success: false, error: result.error } as iResponse);
            return;
        }

        res.status(200).json({
            status: 200,
            success: true,
            data: [{ client_secret: result.clientSecret, ...result.amounts }],
        } as iResponse);

    } catch (err) {
        logger.error(err);
        next(err);
    }
});

/** The authenticated user's own payment history, newest first. */
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payments = await paymentsService.listPayments(req.user!.id);
        res.status(200).json({ status: 200, success: true, data: payments.map(toPublicPayment) } as iResponse);

    } catch (err) {
        logger.error(err);
        next(err);
    }
});

/**
 * The authenticated user's design's paint status and latest paint job.
 * Checkout uses it to warn about buying an already-painted design, refuse
 * one that's mid-paint, and wait for the payment webhook to move a just-paid
 * job out of pending_payment.
 */
router.get("/paint-status/:designId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status = await paymentsService.getPaintStatus(req.user!.id, req.params.designId as string);
        if (!status) {
            res.status(404).json({ status: 404, success: false, error: "You haven't selected that design." } as iResponse);
            return;
        }
        res.status(200).json({ status: 200, success: true, data: [toPublicPaintStatus(status)] } as iResponse);

    } catch (err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Turn auto-renew on (enableAutoRenew) or off (cancelSubscription) for the
 * authenticated user.
 */
router.patch("/subscription", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { input, error } = extractSubscriptionPatch(req.body ?? {});
        if (error) {
            res.status(400).json({ status: 400, success: false, error } as iResponse);
            return;
        }

        const result = input!.auto_renew
            ? await paymentsService.enableAutoRenew(req.user!.id)
            : await paymentsService.cancelSubscription(req.user!.id);

        if (result.error) {
            res.status(400).json({ status: 400, success: false, error: result.error } as iResponse);
            return;
        }

        res.status(200).json({ status: 200, success: true, data: [{ auto_renew: input!.auto_renew }] } as iResponse);

    } catch (err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Deactivate the active selection of every user whose paid period has
 * lapsed - called daily by actions/refresh-contributions.yml. Machine-to-
 * machine, shared-secret auth like the scheduler endpoints.
 */
router.post("/reconcile", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await paymentsService.reconcileLapsedUsers();
        res.status(200).json({ status: 200, success: true, data: [result] } as iResponse);

    } catch (err) {
        logger.error(err);
        next(err);
    }
});

export default router;

import express, { Request, Response } from "express";
import type Stripe from "stripe";
import stripe from "../config/stripe";
import { config } from "../config/config";
import { PaymentsService } from "../services/payments.service";
import { logger } from "../config/logger";

/**
 * Stripe webhook receiver. Mounted directly on the app *before* the global
 * bodyParser.json() (see app.ts) because signature verification needs the
 * exact raw request bytes. Verified events are the only thing that grants
 * or revokes a user's paid period.
 *
 * - 400 on a bad/missing signature (Stripe won't retry - the payload is junk)
 * - 200 once dispatched (even for an event type we ignore)
 * - 500 on a transient internal failure, so Stripe redelivers
 *
 * nginx proxies every path to the API already, so no nginx change is needed
 * for `/payments/webhook`.
 */
export const stripeWebhookRawParser = express.raw({ type: "application/json" });

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
    const signature = req.header("stripe-signature") ?? "";

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, config.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
        logger.error(`stripe webhook signature verification failed: ${err?.message}`);
        res.status(400).json({ received: false, error: "invalid signature" });
        return;
    }

    try {
        const result = await new PaymentsService().handleWebhookEvent(event);
        logger.info(
            `stripe webhook ${event.id} ${event.type}: ${result.handled ? "handled" : "ignored"}` +
                (result.note ? ` (${result.note})` : ""),
        );
        res.status(200).json({ received: true });
    } catch (err: any) {
        // non-2xx so Stripe retries; don't echo internals
        logger.error(`stripe webhook ${event.id} ${event.type} failed: ${err?.message}`);
        res.status(500).json({ received: false });
    }
}

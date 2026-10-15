import type Stripe from "stripe";
import stripe from "../config/stripe";
import { withTransaction } from "../config/db";
import UserBillingRepository from "../repository/userBilling.repo";
import PaymentsRepository from "../repository/payments.repo";
import DesignSelectionsRepository from "../repository/designSelections.repo";
import UserRepository from "../repository/users.repo";
import BackfillJobsRepository from "../repository/backfillJobs.repo";
import { designYear } from "./designs.schedule";
import { isUniqueViolationOn } from "../repository/dbErrors";
import { logger } from "../config/logger";

const PAYMENTS_STRIPE_EVENT_ID_UNIQUE = "payments_stripe_event_id_unique";

export interface iProposedAmounts {
    // integer cents, as sent by the client - never trusted, always revalidated here
    totalCents: number;
    platformCents: number;
}

export interface iAuthoritativeAmounts {
    amount_total_cents: number;
    amount_platform_cents: number;
    amount_charity_cents: number;
}

// Stripe rejects a charge below 50 cents (USD).
const STRIPE_MIN_CHARGE_CENTS = 50;

/**
 * The server-authoritative amount for a checkout. Takes the client's
 * proposed total and platform cut, rejects anything malformed or out of
 * range (the platform cut may be zero), and returns the split with the charity portion derived
 * (total - platform) rather than trusting a client-sent charity figure.
 * Currency is USD-only for now.
 */
export function computeAuthoritativeAmounts(
    proposed: iProposedAmounts,
): { amounts?: iAuthoritativeAmounts; error?: string } {
    const { totalCents, platformCents } = proposed;

    if (!Number.isInteger(totalCents) || !Number.isInteger(platformCents)) {
        return { error: "Amounts must be whole numbers of cents." };
    }

    if (totalCents < STRIPE_MIN_CHARGE_CENTS) {
        return { error: `The total must be at least $${(STRIPE_MIN_CHARGE_CENTS / 100).toFixed(2)}.` };
    }

    if (platformCents < 0) {
        return { error: "The platform amount cannot be negative." };
    }

    if (platformCents > totalCents) {
        return { error: "The platform amount cannot exceed the total." };
    }

    return {
        amounts: {
            amount_total_cents: totalCents,
            amount_platform_cents: platformCents,
            amount_charity_cents: totalCents - platformCents,
        },
    };
}

export interface iCreateCheckoutInput {
    userId: string;
    // the design being bought - its backfill job is created once payment settles
    designId: string;
    charityEinId?: number | null;
    totalCents: number;
    platformCents: number;
    // the annual-subscription path is kept but unused: checkout never sets this
    autoRenew?: boolean;
    // one per checkout visit: retries within it reuse the same PI/subscription,
    // a later purchase gets a fresh one instead of Stripe's cached (paid) response
    attemptId: string;
}

export interface iCreateCheckoutResult {
    clientSecret?: string;
    amounts?: iAuthoritativeAmounts;
    error?: string;
}

const YEAR_PRODUCT_NAME = "Commits for Good - one year of automated commits";
// stable marker so the single reusable Stripe Product is found again rather
// than recreated - keeps checkout zero-setup (no dashboard artifact needed)
const YEAR_PRODUCT_KEY = "cfg_annual_plan";

// The amount is pay-what-you-want so there is no fixed Price, but a Stripe
// subscription item still needs a Product to hang its inline price_data on.
// Look it up once by marker, create it if this is the very first
// subscription ever, and memo the id for the life of the process.
let cachedYearProductId: string | null = null;
async function getYearProductId(): Promise<string> {
    if (cachedYearProductId) return cachedYearProductId;

    const found = await stripe.products.search({ query: `metadata['key']:'${YEAR_PRODUCT_KEY}'`, limit: 1 });
    if (found.data[0]) {
        cachedYearProductId = found.data[0].id;
        return cachedYearProductId;
    }

    const product = await stripe.products.create({
        name: YEAR_PRODUCT_NAME,
        metadata: { key: YEAR_PRODUCT_KEY },
    });
    cachedYearProductId = product.id;
    return cachedYearProductId;
}

/** Test hook: clears the in-process Product-id memo between cases. */
export function __resetYearProductCacheForTests(): void {
    cachedYearProductId = null;
}

/**
 * Whether Stripe still has this customer under the current key. False for a
 * deleted customer or a resource_missing (including a test-mode id read with
 * a live key, or vice versa); any other failure is rethrown, not treated as
 * missing - a Stripe outage must never mint replacement customers.
 */
async function stripeCustomerExists(customerId: string): Promise<boolean> {
    try {
        const customer = await stripe.customers.retrieve(customerId);
        return !customer.deleted;
    } catch (err: any) {
        if (err?.code === "resource_missing") return false;
        throw err;
    }
}

export class PaymentsService {
    public billingRepo: any;
    public paymentsRepo: any;
    public selectionsRepo: any;
    public usersRepo: any;
    public backfillJobsRepo: any;

    constructor() {
        this.billingRepo = UserBillingRepository.repo();
        this.paymentsRepo = PaymentsRepository.repo();
        this.selectionsRepo = DesignSelectionsRepository.repo();
        this.usersRepo = UserRepository.repo();
        this.backfillJobsRepo = BackfillJobsRepository.repo();
    }

    /** The caller's backfill job for a design they bought, or undefined. */
    public async getBackfillJob(userId: string, designId: string): Promise<any> {
        try {
            return await this.backfillJobsRepo.getByUserAndDesign(userId, designId);
        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /** The user's payment history, newest first. */
    public async listPayments(userId: string): Promise<any[]> {
        try {
            return await this.paymentsRepo.listForUser(userId);
        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /** True when the user has a paid period that has not yet elapsed. */
    public async isCovered(userId: string): Promise<boolean> {
        const billing = await this.billingRepo.getByUserId(userId);
        return !!billing?.paid_until && new Date(billing.paid_until).getTime() > Date.now();
    }

    /**
     * The user's Stripe customer id, creating (and persisting) one on first
     * use. One customer per user - a new one is only made to replace a
     * stored id Stripe no longer has (deleted, or created under the other
     * test/live mode), and that replacement clears the stale subscription.
     */
    public async getOrCreateStripeCustomer(userId: string): Promise<string> {
        try {
            const existing = await this.billingRepo.getByUserId(userId);
            const storedId: string | null = existing?.stripe_customer_id ?? null;

            if (storedId) {
                if (await stripeCustomerExists(storedId)) return storedId;
                logger.warn(`user ${userId}'s stored Stripe customer ${storedId} is missing or deleted - replacing it`);
            }

            const user = await this.usersRepo.getUserById(userId);
            const customer = await stripe.customers.create({
                email: user?.email ?? user?.github_email ?? undefined,
                metadata: { user_id: userId, github_username: user?.github_username ?? "" },
            });

            if (storedId) {
                await this.billingRepo.replaceCustomerId(userId, customer.id);
            } else {
                await this.billingRepo.upsertCustomerId(userId, customer.id);
            }
            return customer.id;

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Starts a checkout for one design: validates the amount split
     * server-side, refuses a design that isn't one of the user's
     * selections, then creates a one-time PaymentIntent or (autoRenew) an
     * annual Subscription whose first invoice is paid through the same
     * Payment Element. Returns the client secret for the frontend to
     * confirm. Nothing is granted here - a verified webhook does that.
     */
    public async createCheckout(input: iCreateCheckoutInput): Promise<iCreateCheckoutResult> {
        try {
            const { amounts, error } = computeAuthoritativeAmounts({
                totalCents: input.totalCents,
                platformCents: input.platformCents,
            });
            if (error || !amounts) return { error: error ?? "Invalid amount." };

            // buying the same design again is allowed (the frontend warns
            // first) - it's a donation; the webhook leaves the existing job be
            const selection = await this.selectionsRepo.getByUserAndDesign(input.userId, input.designId);
            if (!selection) return { error: "That design isn't one of your selections." };

            const customerId = await this.getOrCreateStripeCustomer(input.userId);

            const metadata: Record<string, string> = {
                user_id: input.userId,
                design_id: input.designId,
                charity_ein_id: input.charityEinId != null ? String(input.charityEinId) : "",
                amount_total_cents: String(amounts.amount_total_cents),
                amount_platform_cents: String(amounts.amount_platform_cents),
                amount_charity_cents: String(amounts.amount_charity_cents),
            };

            const keyParts = [
                input.userId,
                amounts.amount_total_cents,
                amounts.amount_platform_cents,
                input.designId,
                input.autoRenew ? "sub" : "onetime",
                input.attemptId,
            ].join("-");

            if (input.autoRenew) {
                const subscription = await stripe.subscriptions.create(
                    {
                        customer: customerId,
                        items: [
                            {
                                price_data: {
                                    currency: "usd",
                                    product: await getYearProductId(),
                                    unit_amount: amounts.amount_total_cents,
                                    recurring: { interval: "year" },
                                },
                            },
                        ],
                        payment_behavior: "default_incomplete",
                        payment_settings: { save_default_payment_method: "on_subscription" },
                        // dahlia API: the first invoice's client secret lives on
                        // confirmation_secret, not the removed payment_intent field
                        expand: ["latest_invoice.confirmation_secret"],
                        metadata,
                    },
                    { idempotencyKey: `checkout-sub-${keyParts}` },
                );

                const invoice = subscription.latest_invoice as Stripe.Invoice | null;
                const clientSecret = invoice?.confirmation_secret?.client_secret;
                if (!clientSecret) {
                    logger.error(
                        `createCheckout: subscription ${subscription.id} has no latest_invoice.confirmation_secret client secret`,
                    );
                    return { error: "Could not start checkout. Please try again." };
                }
                return { amounts, clientSecret };
            }

            const paymentIntent = await stripe.paymentIntents.create(
                {
                    customer: customerId,
                    amount: amounts.amount_total_cents,
                    currency: "usd",
                    automatic_payment_methods: { enabled: true },
                    // marks this as our one-time checkout PI so the
                    // payment_intent.succeeded handler can tell it apart from
                    // a subscription invoice's PI (which it ignores in favour
                    // of invoice.paid)
                    metadata: { ...metadata, kind: "checkout_one_time" },
                },
                { idempotencyKey: `checkout-onetime-${keyParts}` },
            );

            if (!paymentIntent.client_secret) {
                logger.error(`createCheckout: payment intent ${paymentIntent.id} has no client secret`);
                return { error: "Could not start checkout. Please try again." };
            }
            return { amounts, clientSecret: paymentIntent.client_secret };

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    // ---- webhook dispatch -------------------------------------------------

    /**
     * Route a verified Stripe event to its handler. Anything that grants or
     * revokes coverage happens here, never from a client callback. Throwing
     * makes the webhook route answer non-2xx so Stripe redelivers.
     */
    public async handleWebhookEvent(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
        switch (event.type) {
            case "payment_intent.succeeded":
                return this.onPaymentIntentSucceeded(event);
            case "invoice.paid":
                return this.onInvoicePaid(event);
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                return this.onSubscriptionChanged(event);
            case "charge.refunded":
            case "charge.dispute.created":
                return this.onChargeReversed(event);
            default:
                return { handled: false, note: `ignored ${event.type}` };
        }
    }

    private async resolveUserId(
        metadataUserId: string | undefined,
        customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
    ): Promise<string | null> {
        const customerId = typeof customer === "string" ? customer : customer?.id;
        if (customerId) {
            const billing = await this.billingRepo.getByStripeCustomerId(customerId);
            if (billing?.user_id) return billing.user_id;
        }
        return metadataUserId || null;
    }

    private parseCharityId(raw: string | undefined | null): number | null {
        const n = Number(raw);
        return Number.isInteger(n) && n > 0 ? n : null;
    }

    // The authoritative split we stamped into metadata at checkout; falls
    // back to "all platform" only if that metadata is somehow absent.
    private splitFromMetadata(metadata: Stripe.Metadata | null | undefined, fallbackTotal: number) {
        const total = Number(metadata?.amount_total_cents);
        const platform = Number(metadata?.amount_platform_cents);
        const charity = Number(metadata?.amount_charity_cents);
        if (
            Number.isInteger(total) && Number.isInteger(platform) && Number.isInteger(charity) &&
            platform >= 0 && charity >= 0 && platform + charity === total
        ) {
            return { amount_total_cents: total, amount_platform_cents: platform, amount_charity_cents: charity };
        }
        return { amount_total_cents: fallbackTotal, amount_platform_cents: fallbackTotal, amount_charity_cents: 0 };
    }

    // Activate the design the user paid for. A missing/again-unselected
    // design is logged, not thrown - the payment itself still succeeded and
    // the user can activate from the dashboard.
    private async maybeActivateDesign(userId: string, designId: string | undefined | null): Promise<void> {
        if (!designId) return;
        const selection = await this.selectionsRepo.getByUserAndDesign(userId, designId);
        if (!selection) {
            logger.error(`webhook: user ${userId} has no selection for design ${designId} to activate`);
            return;
        }
        await this.selectionsRepo.setActiveExclusive(userId, designId);
    }

    private async onPaymentIntentSucceeded(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
        const pi = event.data.object as Stripe.PaymentIntent;
        // a subscription's first/renewal payment also fires this - that path
        // is driven by invoice.paid instead (for the exact period end), so
        // only our explicitly-marked one-time checkout PIs are handled here
        if (pi.metadata?.kind !== "checkout_one_time") {
            return { handled: false, note: "not a one-time checkout payment - handled via invoice.paid" };
        }
        // Fast-path only: skips the DB round trip below on Stripe's ordinary
        // post-200 redelivery of an event already fully processed. It cannot
        // by itself close the race between two truly concurrent deliveries -
        // the transaction + unique-violation catch below is what guarantees
        // at most one credit even then.
        if (await this.paymentsRepo.existsByStripeEventId(event.id)) return { handled: true, note: "duplicate" };

        const userId = await this.resolveUserId(pi.metadata?.user_id, pi.customer);
        if (!userId) throw new Error(`payment_intent.succeeded ${pi.id}: cannot resolve user`);

        const split = this.splitFromMetadata(pi.metadata, pi.amount_received ?? pi.amount);

        // The design's selection says which year to paint. Without one the
        // payment is still recorded (the money arrived), but there is no job
        // to create - logged for a manual follow-up.
        const designId = pi.metadata?.design_id;
        const selection = designId ? await this.selectionsRepo.getByUserAndDesign(userId, designId) : undefined;
        if (!selection) {
            logger.error(`payment_intent.succeeded ${pi.id}: user ${userId} has no selection for design ${designId} - no backfill job created`);
        }

        // The ledger insert and the job commit or roll back together: if a
        // concurrent duplicate delivery wins the insert first, this one's job
        // is rolled back with it. A repeat purchase of the same design is a
        // donation - the job create is a no-op returning the existing row.
        try {
            await withTransaction(async (client) => {
                await this.paymentsRepo.create({
                    user_id: userId,
                    stripe_event_id: event.id,
                    stripe_object_id: pi.id,
                    kind: "one_time",
                    status: "succeeded",
                    ...split,
                    charity_ein_id: this.parseCharityId(pi.metadata?.charity_ein_id),
                    // a purchase buys one design, not a period of time
                    period_start: null,
                    period_end: null,
                }, client);
                if (selection) {
                    await this.backfillJobsRepo.create(userId, designId, designYear(selection.start_date), client);
                }
            });
        } catch (err: any) {
            if (isUniqueViolationOn(err, PAYMENTS_STRIPE_EVENT_ID_UNIQUE)) {
                logger.info(`payment_intent.succeeded ${event.id}: lost the race to a concurrent duplicate delivery`);
                return { handled: true, note: "duplicate" };
            }
            throw err;
        }

        return { handled: true };
    }

    private async onInvoicePaid(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
        const invoice = event.data.object as Stripe.Invoice;
        const subDetails = invoice.parent?.subscription_details;
        const subRef = subDetails?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subId) return { handled: false, note: "non-subscription invoice" };
        // Fast-path only, same as onPaymentIntentSucceeded's - the catch on
        // the ledger insert below is what actually guarantees a losing
        // concurrent delivery resolves cleanly rather than throwing.
        if (await this.paymentsRepo.existsByStripeEventId(event.id)) return { handled: true, note: "duplicate" };

        const userId = await this.resolveUserId(undefined, invoice.customer);
        if (!userId) throw new Error(`invoice.paid ${invoice.id}: cannot resolve user`);

        const subscription = await stripe.subscriptions.retrieve(subId);
        const periodEndUnix = subscription.items.data[0]?.current_period_end ?? 0;
        const paidUntilIso = new Date(periodEndUnix * 1000).toISOString();

        await this.billingRepo.setPaidUntil(userId, paidUntilIso);
        await this.billingRepo.updateSubscription(userId, {
            stripe_subscription_id: subId,
            subscription_status: subscription.status,
            auto_renew: !subscription.cancel_at_period_end,
        });

        const metadata = subscription.metadata ?? subDetails?.metadata;
        const split = this.splitFromMetadata(metadata, invoice.amount_paid);

        // Unlike the one-time path, `setPaidUntil` above is already an
        // idempotent absolute set, so a losing race here can't double-credit
        // - it only needs to not blow up with an unhandled exception, so no
        // withTransaction is needed, just a catch on the insert itself.
        try {
            await this.paymentsRepo.create({
                user_id: userId,
                stripe_event_id: event.id,
                stripe_object_id: invoice.id,
                kind: "subscription",
                status: "paid",
                ...split,
                charity_ein_id: this.parseCharityId(metadata?.charity_ein_id),
                period_start: new Date((invoice.period_start ?? 0) * 1000).toISOString(),
                period_end: paidUntilIso,
            });
        } catch (err: any) {
            if (isUniqueViolationOn(err, PAYMENTS_STRIPE_EVENT_ID_UNIQUE)) {
                logger.info(`invoice.paid ${event.id}: lost the race to a concurrent duplicate delivery`);
                return { handled: true, note: "duplicate" };
            }
            throw err;
        }

        await this.maybeActivateDesign(userId, metadata?.design_id);
        return { handled: true };
    }

    private async onSubscriptionChanged(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
        const sub = event.data.object as Stripe.Subscription;
        const billing = await this.billingRepo.getByStripeCustomerId(
            typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        );
        if (!billing?.user_id) return { handled: false, note: "no billing row for customer" };

        const stillRenewing = (sub.status === "active" || sub.status === "trialing") && !sub.cancel_at_period_end;
        await this.billingRepo.updateSubscription(billing.user_id, {
            subscription_status: sub.status,
            auto_renew: stillRenewing,
        });
        // paid_until is left as-is: a canceled/unpaid subscription simply
        // stops renewing and the user lapses when the current period ends
        // (the daily reconcile then deactivates their selection).
        return { handled: true, note: `subscription ${sub.status}` };
    }

    private async onChargeReversed(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
        let customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined;
        let objectId: string;

        if (event.type === "charge.refunded") {
            const charge = event.data.object as Stripe.Charge;
            customer = charge.customer;
            objectId = charge.id;
        } else {
            const dispute = event.data.object as Stripe.Dispute;
            objectId = dispute.id;
            const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
            const charge = await stripe.charges.retrieve(chargeId);
            customer = charge.customer;
        }

        const userId = await this.resolveUserId(undefined, customer);
        if (!userId) return { handled: false, note: `${event.type} ${objectId}: cannot resolve user` };

        await this.billingRepo.setPaidUntil(userId, new Date().toISOString());
        const deactivated = await this.selectionsRepo.deactivateActiveForUser(userId);
        return { handled: true, note: `${event.type}: expired, deactivated ${deactivated.length}` };
    }

    // ---- subscription lifecycle & lapse sweep ---------------------------

    /** Turn off auto-renew: the current paid period runs out, then stops. */
    public async cancelSubscription(userId: string): Promise<{ ok?: boolean; error?: string }> {
        try {
            const billing = await this.billingRepo.getByUserId(userId);
            if (!billing?.stripe_subscription_id) {
                return { error: "You don't have an auto-renewing subscription." };
            }

            await stripe.subscriptions.update(billing.stripe_subscription_id, { cancel_at_period_end: true });
            await this.billingRepo.updateSubscription(userId, { auto_renew: false });
            return { ok: true };

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Turn auto-renew on for a user who paid one-time and is still covered:
     * create an annual subscription that only starts charging when the
     * current paid period ends (trial_end), reusing the amount/charity split
     * from their most recent payment and the card saved at that checkout.
     */
    public async enableAutoRenew(userId: string): Promise<{ ok?: boolean; error?: string }> {
        try {
            const billing = await this.billingRepo.getByUserId(userId);
            const paidUntilMs = billing?.paid_until ? new Date(billing.paid_until).getTime() : 0;
            if (paidUntilMs <= Date.now()) {
                return { error: "You don't have an active paid period to renew." };
            }
            if (
                billing.stripe_subscription_id &&
                (billing.subscription_status === "active" || billing.subscription_status === "trialing")
            ) {
                return { error: "Auto-renew is already on." };
            }

            const latest = await this.paymentsRepo.getLatestForUser(userId);
            if (!latest) return { error: "No previous payment to base a renewal on." };

            const customerId = await this.getOrCreateStripeCustomer(userId);

            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [
                    {
                        price_data: {
                            currency: "usd",
                            product: await getYearProductId(),
                            unit_amount: latest.amount_total_cents,
                            recurring: { interval: "year" },
                        },
                    },
                ],
                trial_end: Math.floor(paidUntilMs / 1000),
                payment_settings: { save_default_payment_method: "on_subscription" },
                metadata: {
                    user_id: userId,
                    design_id: "",
                    charity_ein_id: latest.charity_ein_id != null ? String(latest.charity_ein_id) : "",
                    amount_total_cents: String(latest.amount_total_cents),
                    amount_platform_cents: String(latest.amount_platform_cents),
                    amount_charity_cents: String(latest.amount_charity_cents),
                },
            });

            await this.billingRepo.updateSubscription(userId, {
                stripe_subscription_id: subscription.id,
                subscription_status: subscription.status,
                auto_renew: true,
            });
            return { ok: true };

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Deactivate the active selection of every user whose paid period has
     * lapsed - the catch-all for expired one-time payments (no webhook
     * fires) and any selection left active from before payments existed.
     */
    public async reconcileLapsedUsers(): Promise<{ deactivated: number }> {
        try {
            const lapsed: Array<{ user_id: string }> = await this.billingRepo.listLapsedActiveUsers();
            const seen = new Set<string>();
            let deactivated = 0;

            for (const { user_id } of lapsed) {
                if (seen.has(user_id)) continue;
                seen.add(user_id);
                const rows = await this.selectionsRepo.deactivateActiveForUser(user_id);
                deactivated += rows.length;
            }

            return { deactivated };

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }
}

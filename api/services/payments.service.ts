import type Stripe from "stripe";
import stripe from "../config/stripe";
import UserBillingRepository from "../repository/userBilling.repo";
import PaymentsRepository from "../repository/payments.repo";
import DesignSelectionsRepository from "../repository/designSelections.repo";
import UserRepository from "../repository/users.repo";
import { config } from "../config/config";
import { logger } from "../config/logger";

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

// Stripe rejects a charge below 50 cents (USD). PLATFORM_MIN_CENTS is
// asserted >= 50 in config, so a valid platform cut already clears this,
// but the check is kept explicit.
const STRIPE_MIN_CHARGE_CENTS = 50;

/**
 * The server-authoritative amount for a checkout. Takes the client's
 * proposed total and platform cut, rejects anything malformed or below the
 * platform floor, and returns the split with the charity portion derived
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

    if (platformCents < config.PLATFORM_MIN_CENTS) {
        return { error: `The platform amount must be at least $${(config.PLATFORM_MIN_CENTS / 100).toFixed(2)}.` };
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
    // the design whose selection should go active once payment settles;
    // omitted for a standalone "buy a year" purchase (activates nothing)
    designIdToActivate?: string | null;
    charityEinId?: number | null;
    totalCents: number;
    platformCents: number;
    autoRenew: boolean;
}

export interface iCreateCheckoutResult {
    clientSecret?: string;
    amounts?: iAuthoritativeAmounts;
    alreadyCovered?: boolean;
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

export class PaymentsService {
    public billingRepo: any;
    public paymentsRepo: any;
    public selectionsRepo: any;
    public usersRepo: any;

    constructor() {
        this.billingRepo = UserBillingRepository.repo();
        this.paymentsRepo = PaymentsRepository.repo();
        this.selectionsRepo = DesignSelectionsRepository.repo();
        this.usersRepo = UserRepository.repo();
    }

    /** True when the user has a paid period that has not yet elapsed. */
    public async isCovered(userId: string): Promise<boolean> {
        const billing = await this.billingRepo.getByUserId(userId);
        return !!billing?.paid_until && new Date(billing.paid_until).getTime() > Date.now();
    }

    /**
     * The user's Stripe customer id, creating (and persisting) one on first
     * use. One customer per user - never create a second.
     */
    public async getOrCreateStripeCustomer(userId: string): Promise<string> {
        try {
            const existing = await this.billingRepo.getByUserId(userId);
            if (existing?.stripe_customer_id) return existing.stripe_customer_id;

            const user = await this.usersRepo.getUserById(userId);
            const customer = await stripe.customers.create({
                email: user?.email ?? user?.github_email ?? undefined,
                metadata: { user_id: userId, github_username: user?.github_username ?? "" },
            });

            await this.billingRepo.upsertCustomerId(userId, customer.id);
            return customer.id;

        } catch (err: any) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Starts a checkout: validates the amount split server-side, refuses
     * when the user is already covered or the design-to-activate isn't
     * theirs, then creates a one-time PaymentIntent or (autoRenew) an
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

            if (await this.isCovered(input.userId)) return { alreadyCovered: true };

            if (input.designIdToActivate) {
                const selection = await this.selectionsRepo.getByUserAndDesign(input.userId, input.designIdToActivate);
                if (!selection) return { error: "That design isn't one of your selections." };
            }

            const customerId = await this.getOrCreateStripeCustomer(input.userId);

            const metadata: Record<string, string> = {
                user_id: input.userId,
                design_id: input.designIdToActivate ?? "",
                charity_ein_id: input.charityEinId != null ? String(input.charityEinId) : "",
                amount_total_cents: String(amounts.amount_total_cents),
                amount_platform_cents: String(amounts.amount_platform_cents),
                amount_charity_cents: String(amounts.amount_charity_cents),
            };

            const keyParts = [
                input.userId,
                amounts.amount_total_cents,
                amounts.amount_platform_cents,
                input.designIdToActivate ?? "none",
                input.autoRenew ? "sub" : "onetime",
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
                        expand: ["latest_invoice.payment_intent"],
                        metadata,
                    },
                    { idempotencyKey: `checkout-sub-${keyParts}` },
                );

                const paymentIntent = (subscription.latest_invoice as any)?.payment_intent;
                const result: iCreateCheckoutResult = { amounts };
                if (paymentIntent?.client_secret) result.clientSecret = paymentIntent.client_secret;
                return result;
            }

            const paymentIntent = await stripe.paymentIntents.create(
                {
                    customer: customerId,
                    amount: amounts.amount_total_cents,
                    currency: "usd",
                    automatic_payment_methods: { enabled: true },
                    // keep the card on file so a later "turn on auto-renew"
                    // from settings has something to charge at renewal
                    setup_future_usage: "off_session",
                    // marks this as our one-time checkout PI so the
                    // payment_intent.succeeded handler can tell it apart from
                    // a subscription invoice's PI (which it ignores in favour
                    // of invoice.paid)
                    metadata: { ...metadata, kind: "checkout_one_time" },
                },
                { idempotencyKey: `checkout-onetime-${keyParts}` },
            );

            const result: iCreateCheckoutResult = { amounts };
            if (paymentIntent.client_secret) result.clientSecret = paymentIntent.client_secret;
            return result;

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
        if (await this.paymentsRepo.existsByStripeEventId(event.id)) return { handled: true, note: "duplicate" };

        const userId = await this.resolveUserId(pi.metadata?.user_id, pi.customer);
        if (!userId) throw new Error(`payment_intent.succeeded ${pi.id}: cannot resolve user`);

        const billing = await this.billingRepo.bumpPaidUntilOneYear(userId);
        const split = this.splitFromMetadata(pi.metadata, pi.amount_received ?? pi.amount);

        await this.paymentsRepo.create({
            user_id: userId,
            stripe_event_id: event.id,
            stripe_object_id: pi.id,
            kind: "one_time",
            status: "succeeded",
            ...split,
            charity_ein_id: this.parseCharityId(pi.metadata?.charity_ein_id),
            period_start: new Date().toISOString(),
            period_end: billing.paid_until,
        });

        await this.maybeActivateDesign(userId, pi.metadata?.design_id);

        // remember the card as the customer's default so a future
        // auto-renew subscription can charge it without re-prompting
        const paymentMethod = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
        const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
        if (paymentMethod && customerId) {
            try {
                await stripe.customers.update(customerId, {
                    invoice_settings: { default_payment_method: paymentMethod },
                });
            } catch (err: any) {
                logger.error(err); // non-fatal: the payment already succeeded
            }
        }

        return { handled: true };
    }

    private async onInvoicePaid(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
        const invoice = event.data.object as Stripe.Invoice;
        const subDetails = invoice.parent?.subscription_details;
        const subRef = subDetails?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subId) return { handled: false, note: "non-subscription invoice" };
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

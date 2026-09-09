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
                    metadata,
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
}

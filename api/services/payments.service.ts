import { config } from "../config/config";

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

export interface iCheckoutInput {
    totalCents: number;
    platformCents: number;
    autoRenew: boolean;
    designId?: string;
    charityEinId?: number;
}

/**
 * Shape/type check for POST /payments/checkout. The business rules on the
 * amount (platform floor, split, Stripe minimum) live in
 * computeAuthoritativeAmounts, which createCheckout runs next - this only
 * rejects a malformed body.
 */
export function extractCheckoutInput(body: Record<string, unknown>): { input?: iCheckoutInput; error?: string } {
    const { totalCents, platformCents, autoRenew, designId, charityEinId } = body ?? {};

    if (!Number.isInteger(totalCents) || (totalCents as number) <= 0) {
        return { error: "totalCents must be a positive integer number of cents." };
    }
    if (!Number.isInteger(platformCents) || (platformCents as number) < 0) {
        return { error: "platformCents must be a non-negative integer number of cents." };
    }
    if (typeof autoRenew !== "boolean") {
        return { error: "autoRenew must be a boolean." };
    }
    if (designId !== undefined && (typeof designId !== "string" || designId.length === 0)) {
        return { error: "designId must be a non-empty string when provided." };
    }
    if (charityEinId !== undefined && (!Number.isInteger(charityEinId) || (charityEinId as number) <= 0)) {
        return { error: "charityEinId must be a positive integer id when provided." };
    }

    const input: iCheckoutInput = {
        totalCents: totalCents as number,
        platformCents: platformCents as number,
        autoRenew,
    };
    if (designId !== undefined) input.designId = designId as string;
    if (charityEinId !== undefined) input.charityEinId = charityEinId as number;
    return { input };
}

/** Body check for PATCH /payments/subscription. */
export function extractSubscriptionPatch(
    body: Record<string, unknown>,
): { input?: { auto_renew: boolean }; error?: string } {
    const { auto_renew } = body ?? {};
    if (typeof auto_renew !== "boolean") {
        return { error: "auto_renew must be a boolean." };
    }
    return { input: { auto_renew } };
}

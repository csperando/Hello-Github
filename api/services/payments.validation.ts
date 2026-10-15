export interface iCheckoutInput {
    totalCents: number;
    platformCents: number;
    autoRenew: boolean;
    designId?: string;
    charityEinId?: number;
    // client-generated per checkout visit; scopes the Stripe idempotency key
    attemptId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape/type check for POST /payments/checkout. The business rules on the
 * amount (platform floor, split, Stripe minimum) live in
 * computeAuthoritativeAmounts, which createCheckout runs next - this only
 * rejects a malformed body.
 */
export function extractCheckoutInput(body: Record<string, unknown>): { input?: iCheckoutInput; error?: string } {
    const { totalCents, platformCents, autoRenew, designId, charityEinId, attemptId } = body ?? {};

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
    if (typeof attemptId !== "string" || !UUID_RE.test(attemptId)) {
        return { error: "attemptId must be a UUID." };
    }

    const input: iCheckoutInput = {
        totalCents: totalCents as number,
        platformCents: platformCents as number,
        autoRenew,
        attemptId,
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

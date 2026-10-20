<script setup lang="ts">
    import { computed, nextTick, onMounted, ref, watch } from "vue"
    import { useRoute, useRouter } from "vue-router"
    import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import StepProgress from "@/components/ui/StepProgress.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import CharityPicker from "@/components/ui/CharityPicker.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"
    import { getOrgById, githubPaintUrl } from "@/services/api"
    import { errorMessage } from "@/services/errors"
    import type { iOrg } from "@/services/api"
    import { getDesign, type iDesign } from "@/services/designs"
    import { createCheckout, getBackfillJob, type iBackfillJob } from "@/services/payments"
    import { useAuthStore } from "@/stores/auth"

    // suggested platform share; the user can slide it down to $0
    const PLATFORM_SUGGESTED_CENTS = 99
    const TOTAL_MIN_CENTS = 99
    const PRESETS_CENTS = [500, 1000, 2500, 5000]
    const MAX_TOTAL_CENTS = 50000

    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()

    // the design being bought - required; without one onMounted sends the
    // user back to the editor
    const designId = computed(() => (typeof route.query.designId === "string" ? route.query.designId : null))
    // the year it paints, passed along by the editor - display only
    const designYear = computed(() => (typeof route.query.year === "string" ? route.query.year : null))
    const design = ref<iDesign | null>(null)

    const step = ref(1)
    // within step 2: "amount" collects the total/split, "card" mounts the
    // Stripe Payment Element against a created PaymentIntent
    const paymentPhase = ref<"amount" | "card">("amount")
    const preparingPayment = ref(false)
    const paying = ref(false)
    const payError = ref("")
    // shown instead of the flow when this design was already bought: paying
    // again is a donation, so the user confirms before continuing
    const showRepurchaseWarning = ref(false)
    // one per visit: a retry or "edit amount" round-trip reuses it, so the API
    // doesn't double-create; a later visit gets a new one and a fresh PaymentIntent
    const attemptId = crypto.randomUUID()

    // ----- charity -----------------------------------------------------------
    const selectedCharity = ref<iOrg | null>(null)

    function selectCharity(org: iOrg) {
        selectedCharity.value = org
    }
    function clearCharity() {
        selectedCharity.value = null
    }

    const hasCharity = computed(() => selectedCharity.value !== null)

    // ----- amount + split ---------------------------------------------------
    const totalCents = ref(1000)
    // the platform's cut; with a charity the user slides this between $0
    // and the total, without one the whole total is the platform's
    const platformCents = ref(PLATFORM_SUGGESTED_CENTS)

    watch([totalCents, hasCharity], () => {
        const max = hasCharity.value ? totalCents.value : totalCents.value
        platformCents.value = Math.min(Math.max(platformCents.value, 0), max)
    })

    const effectivePlatformCents = computed(() =>
        hasCharity.value ? Math.min(platformCents.value, totalCents.value) : totalCents.value,
    )
    const effectiveCharityCents = computed(() => Math.max(0, totalCents.value - effectivePlatformCents.value))

    function setTotal(cents: number) {
        totalCents.value = Math.min(Math.max(cents, TOTAL_MIN_CENTS), MAX_TOTAL_CENTS)
    }
    function onTotalInput(e: Event) {
        const dollars = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(dollars)) setTotal(Math.round(dollars * 100))
    }

    // ----- formatting / derived -----------------------------------------------
    function formatCents(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`
    }

    const graphLabel = computed(() => (designYear.value ? `your ${designYear.value} contribution graph` : "your contribution graph"))
    const paintConsentUrl = computed(() => (designId.value ? githubPaintUrl(designId.value) : ""))

    const previewCells = computed(() =>
        (design.value?.pattern ?? []).map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })),
    )
    const previewWeeks = computed(() => (design.value ? design.value.pattern.length / 7 : 24))

    // ----- Stripe Payment Element ------------------------------------------
    let stripe: Stripe | null = null
    let elements: StripeElements | null = null
    const elementReady = ref(false)

    async function getStripe(): Promise<Stripe | null> {
        if (!stripe) stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
        return stripe
    }

    async function continueToPayment() {
        if (!designId.value) return
        payError.value = ""
        preparingPayment.value = true
        try {
            const res = await createCheckout({
                totalCents: totalCents.value,
                platformCents: effectivePlatformCents.value,
                designId: designId.value,
                attemptId,
                ...(selectedCharity.value ? { charityEinId: selectedCharity.value.id } : {}),
            })
            const body = await res.json().catch(() => ({}))

            if (!res.ok) {
                payError.value = errorMessage(body, "Could not start checkout. Please try again.")
                return
            }

            const clientSecret: string | undefined = body.data?.[0]?.client_secret
            if (!clientSecret) {
                payError.value = "Could not start checkout. Please try again."
                return
            }

            const s = await getStripe()
            if (!s) {
                payError.value = "Payments are unavailable right now."
                return
            }

            elements = s.elements({ clientSecret })
            const paymentElement = elements.create("payment")
            paymentElement.on("ready", () => {
                elementReady.value = true
            })
            paymentPhase.value = "card"
            await nextTick()
            paymentElement.mount("#payment-element")
        } finally {
            preparingPayment.value = false
        }
    }

    function editAmount() {
        paymentPhase.value = "amount"
        elements = null
        elementReady.value = false
    }

    async function pay() {
        payError.value = ""
        if (!stripe || !elements) return
        paying.value = true
        try {
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                // carry the design through a 3DS/redirect round trip
                confirmParams: {
                    return_url: `${window.location.origin}/checkout?designId=${encodeURIComponent(designId.value ?? "")}&paid=1`,
                },
                redirect: "if_required",
            })

            if (error) {
                // card declined, validation, 3DS failure, network - all land here
                payError.value = error.message ?? "Payment failed. Please try another card."
                return
            }
            if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
                step.value = 3
            }
        } finally {
            paying.value = false
        }
    }

    async function fetchBackfillJob(): Promise<iBackfillJob | null> {
        if (!designId.value) return null
        try {
            const res = await getBackfillJob(designId.value)
            if (!res.ok) return null
            const body = await res.json()
            return body.data?.[0] ?? null
        } catch {
            return null
        }
    }

    // ----- step 3: wait for the webhook to create the backfill job ----------
    const POLL_ATTEMPTS = 10
    const POLL_INTERVAL_MS = 2000
    // "consent": a new job is waiting on the user's one-off GitHub consent;
    // "active": the job was already past that (a repeat purchase / donation)
    const activationState = ref<"pending" | "consent" | "active" | "timeout">("pending")

    async function pollForBackfillJob() {
        activationState.value = "pending"
        for (let i = 0; i < POLL_ATTEMPTS; i++) {
            const job = await fetchBackfillJob()
            if (job) {
                activationState.value = job.status === "awaiting_issue" ? "consent" : "active"
                return
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }
        activationState.value = "timeout"
    }

    watch(step, (value) => {
        if (value === 3) pollForBackfillJob()
    })

    onMounted(async () => {
        if (!designId.value) {
            router.replace("/editor")
            return
        }

        // returning from a 3DS/redirect payment method - the job found here
        // is the one just paid for, so no repeat-purchase warning
        if (route.query.paid || route.query.redirect_status === "succeeded") {
            step.value = 3
        } else if (await fetchBackfillJob()) {
            showRepurchaseWarning.value = true
        }

        const charityId = authStore.user?.default_charity
        if (charityId) {
            try {
                const res = await getOrgById(charityId)
                if (res.ok) {
                    const body = await res.json()
                    // getOrgById returns the org object when found, [] when not
                    const org = Array.isArray(body.data) ? undefined : body.data
                    if (org) selectedCharity.value = org
                }
            } catch {
                // non-fatal - the picker just starts empty
            }
        }

        try {
            const res = await getDesign(designId.value)
            if (res.ok) {
                const body = await res.json()
                design.value = body.data?.[0] ?? null
            }
        } catch {
            // non-fatal - the summary just omits the design preview
        }
    })
</script>

<template>
    <div class="page">
        <AppNavbar sticky />

        <main class="main">
            <!-- Buying a design again won't paint it twice - it's a donation, so confirm first -->
            <BaseCard v-if="showRepurchaseWarning" padding="clamp(24px,3vw,36px)" class="repurchase-card">
                <h1 class="step-title">You've already bought this design</h1>
                <p class="step-subtitle">
                    <strong v-if="design">{{ design.name }}</strong><span v-else>This design</span> is already activated
                    on {{ graphLabel }}. Paying again won't paint it a second time — it goes entirely to the platform
                    and your chosen charity as a donation. Are you sure you want to donate again?
                </p>
                <div class="actions-between">
                    <RouterLink to="/dashboard">
                        <BaseButton variant="secondary" class="secondary-btn">back to dashboard</BaseButton>
                    </RouterLink>
                    <BaseButton data-testid="donate-again" class="continue-btn" @click="showRepurchaseWarning = false">
                        donate again →
                    </BaseButton>
                </div>
            </BaseCard>

            <template v-else>
                <StepProgress :steps="['charity', 'payment', 'done']" :current="step" line-width="32px" />

                <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] items-start gap-8">
                    <BaseCard padding="clamp(24px,3vw,36px)" class="step-card">
                        <!-- STEP 1: CHARITY -->
                        <div v-if="step === 1">
                            <h1 class="step-title">Choose a charity</h1>
                            <p class="step-subtitle">
                                Optional. Whatever you don't send to a charity supports Commits for Good directly.
                            </p>

                            <CharityPicker :selected="selectedCharity" @select="selectCharity">
                                <div class="charity-actions">
                                    <p v-if="!selectedCharity" class="no-charity-note">
                                        No charity selected — your whole contribution will support the platform.
                                    </p>
                                    <button v-else type="button" class="text-btn" @click="clearCharity">
                                        remove charity
                                    </button>
                                </div>
                            </CharityPicker>

                            <div class="actions-end">
                                <BaseButton @click="step = 2" class="continue-btn">continue →</BaseButton>
                            </div>
                        </div>

                        <!-- STEP 2: AMOUNT then CARD -->
                        <div v-else-if="step === 2 && paymentPhase === 'amount'">
                            <h1 class="step-title">Set your contribution</h1>
                            <p class="amount-subtitle">
                                One payment paints this design on {{ graphLabel }}<span v-if="selectedCharity">
                                and a donation to <span class="charity-name-accent">{{ selectedCharity.name }}</span></span>.
                            </p>

                            <div class="preset-row">
                                <button
                                    v-for="preset in PRESETS_CENTS"
                                    :key="preset"
                                    type="button"
                                    class="preset-btn"
                                    :class="{ 'preset-btn--active': preset === totalCents }"
                                    @click="setTotal(preset)"
                                >{{ formatCents(preset) }}</button>
                            </div>

                            <label class="field-label" for="checkout-total">total</label>
                            <input
                                id="checkout-total"
                                type="number"
                                min="0.99"
                                step="0.01"
                                :value="(totalCents / 100).toFixed(2)"
                                class="amount-input"
                                @input="onTotalInput"
                            />

                            <div v-if="selectedCharity" class="split-block">
                                <label class="field-label" for="checkout-split">
                                    platform share — {{ formatCents(effectivePlatformCents) }}
                                </label>
                                <input
                                    id="checkout-split"
                                    type="range"
                                    min="0"
                                    :max="totalCents"
                                    step="1"
                                    v-model.number="platformCents"
                                    class="split-range"
                                />
                                <p class="split-hint">
                                    drag left to send more to {{ selectedCharity.name }}
                                </p>
                            </div>

                            <div class="fee-box">
                                <div class="fee-row">
                                    <span class="fee-label">supports Commits for Good</span>
                                    <span>{{ formatCents(effectivePlatformCents) }}</span>
                                </div>
                                <div v-if="selectedCharity" class="fee-row fee-row-last">
                                    <span class="fee-label">donation to {{ selectedCharity.name }}</span>
                                    <span class="fee-value-accent">{{ formatCents(effectiveCharityCents) }}</span>
                                </div>
                            </div>

                            <div v-if="payError" class="pay-error">{{ payError }}</div>

                            <div class="actions-between">
                                <BaseButton variant="secondary" @click="step = 1" class="secondary-btn">back</BaseButton>
                                <BaseButton
                                    @click="continueToPayment"
                                    :disabled="preparingPayment"
                                    :loading="preparingPayment"
                                    class="continue-btn pay-btn"
                                >
                                    <span v-if="preparingPayment">preparing…</span>
                                    <span v-else>continue to payment →</span>
                                </BaseButton>
                            </div>
                        </div>

                        <!-- STEP 2 (card phase): Stripe Payment Element -->
                        <div v-else-if="step === 2 && paymentPhase === 'card'">
                            <h1 class="step-title">Payment</h1>
                            <div class="card-amount-summary">
                                <span>paying <strong>{{ formatCents(totalCents) }}</strong></span>
                                <button type="button" class="text-btn" @click="editAmount">edit</button>
                            </div>

                            <form @submit.prevent="pay">
                                <div id="payment-element" class="payment-element"></div>

                                <div v-if="payError" class="pay-error">{{ payError }}</div>

                                <div class="actions-between">
                                    <BaseButton variant="secondary" type="button" @click="editAmount" class="secondary-btn">back</BaseButton>
                                    <BaseButton
                                        type="submit"
                                        :disabled="paying || !elementReady"
                                        :loading="paying"
                                        class="continue-btn pay-btn"
                                    >
                                        <span v-if="paying">processing…</span>
                                        <span v-else>pay {{ formatCents(totalCents) }} →</span>
                                    </BaseButton>
                                </div>
                            </form>
                            <p class="secure-note">🔒 card details go straight to Stripe — they never touch our servers.</p>
                        </div>

                        <!-- STEP 3: CONFIRMATION -->
                        <div v-else class="receipt-step">
                            <template v-if="activationState === 'pending'">
                                <div class="pulse-dot" aria-hidden="true"></div>
                                <h1 class="receipt-title">Payment received.</h1>
                                <p class="receipt-message">Activating your commits — this can take a moment.</p>
                            </template>

                            <template v-else-if="activationState === 'consent'">
                                <div class="check-circle"><span class="check-mark">✓</span></div>
                                <h1 class="receipt-title">One more step.</h1>
                                <p class="receipt-message">
                                    GitHub only counts commits from repos you've interacted with. Let us open an issue
                                    as you on our canvas repo, and we'll paint
                                    <strong v-if="design">{{ design.name }}</strong><span v-else>your design</span>
                                    on {{ graphLabel }}.
                                </p>
                                <div class="receipt-actions">
                                    <a :href="paintConsentUrl" data-testid="paint-consent" class="flex-1">
                                        <BaseButton class="receipt-primary-btn">connect GitHub →</BaseButton>
                                    </a>
                                </div>
                            </template>

                            <template v-else-if="activationState === 'active'">
                                <div class="check-circle"><span class="check-mark">✓</span></div>
                                <h1 class="receipt-title">You're all set.</h1>
                                <p class="receipt-message">
                                    Thank you — <strong v-if="design">{{ design.name }}</strong><span v-else>this design</span>
                                    was already bought, so this payment is a donation.
                                </p>
                                <div class="receipt-actions">
                                    <RouterLink to="/dashboard" class="flex-1">
                                        <BaseButton class="receipt-primary-btn">go to dashboard →</BaseButton>
                                    </RouterLink>
                                </div>
                            </template>

                            <template v-else>
                                <div class="check-circle"><span class="check-mark">✓</span></div>
                                <h1 class="receipt-title">Payment received.</h1>
                                <p class="receipt-message">
                                    Your receipt is on its way. Your commits will activate shortly — refresh the dashboard
                                    in a minute.
                                </p>
                                <div class="receipt-actions">
                                    <RouterLink to="/dashboard" class="flex-1">
                                        <BaseButton class="receipt-primary-btn">go to dashboard →</BaseButton>
                                    </RouterLink>
                                </div>
                            </template>
                        </div>
                    </BaseCard>

                    <!-- ORDER SUMMARY -->
                    <aside class="lg:sticky lg:top-24">
                        <BaseCard padding="22px">
                            <div class="summary-label">your order</div>
                            <div v-if="design" class="preview-box">
                                <ContributionGridPreview :cells="previewCells" :weeks="previewWeeks" height="90px" />
                            </div>
                            <div class="summary-design-name">{{ design ? design.name : "your design" }}</div>
                            <div class="design-meta">
                                <span v-if="design">{{ previewCells.filter((c) => c.bg !== LEVEL_COLORS[0]).length }} squares · </span>
                                {{ designYear ? `${designYear} · ` : "" }}one-time
                            </div>

                            <div class="summary-divider">
                                <div class="summary-row">
                                    <span>charity</span>
                                    <span class="summary-value">{{ selectedCharity ? selectedCharity.name : "none" }}</span>
                                </div>
                                <div class="summary-row summary-row-last">
                                    <span>total</span>
                                    <span class="summary-value-strong">{{ formatCents(totalCents) }}</span>
                                </div>
                            </div>
                        </BaseCard>
                    </aside>
                </div>
            </template>
        </main>
    </div>
</template>

<style scoped>
    .page {
        font-family: var(--font-sans);
        background: var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
    }

    .main {
        max-width: 1140px;
        margin: 0 auto;
        padding: clamp(28px, 4vw, 48px) clamp(20px, 4vw, 32px) 80px;
    }

    .step-card,
    .repurchase-card {
        min-width: 0;
    }

    .repurchase-card {
        max-width: 560px;
        margin: 0 auto;
    }

    .step-title {
        font-family: var(--font-mono);
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 6px;
    }

    .step-subtitle,
    .amount-subtitle {
        font-size: 14px;
        color: var(--color-text-muted-3);
        margin: 0 0 22px;
        line-height: 1.6;
    }

    .inline-link {
        color: var(--color-accent-bright);
    }

    .no-charity-note {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-4);
        margin: 0 0 8px;
    }

    .text-btn {
        background: none;
        border: none;
        padding: 0;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-3);
        cursor: pointer;
        text-decoration: underline;
    }

    .charity-actions {
        margin-bottom: 18px;
    }

    .charity-name-accent {
        color: var(--color-accent-bright);
    }

    .actions-end {
        display: flex;
        justify-content: flex-end;
    }

    .actions-between {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
    }

    .continue-btn {
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 22px;
    }

    .pay-btn {
        display: flex;
        align-items: center;
        gap: 9px;
    }

    .preset-row {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
        flex-wrap: wrap;
    }

    .preset-btn {
        font-family: var(--font-mono);
        font-weight: 600;
        font-size: 13.5px;
        border-radius: 8px;
        padding: 10px 16px;
        cursor: pointer;
        background: var(--color-bg-inset);
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-mid);
    }

    .preset-btn--active {
        background: var(--color-accent);
        color: var(--color-accent-on);
        border-color: transparent;
    }

    .field-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-3);
        margin-bottom: 7px;
    }

    .amount-input {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 700;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        padding: 12px 14px;
        margin-bottom: 22px;
    }

    .amount-input:focus {
        outline: none;
        border-color: var(--color-accent);
    }

    .split-block {
        margin-bottom: 22px;
    }

    .split-range {
        width: 100%;
        margin-bottom: 8px;
    }

    .split-hint {
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--color-text-muted-5);
        margin: 0;
    }

    .fee-box {
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 20px;
    }

    .fee-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 13px;
        margin-bottom: 8px;
    }

    .fee-row-last {
        margin-bottom: 0;
    }

    .fee-label {
        color: var(--color-text-muted-4);
    }

    .fee-value-accent {
        color: var(--color-accent-bright);
        font-weight: 600;
    }

    .pay-error {
        font-size: 13px;
        color: var(--color-danger);
        margin-bottom: 14px;
    }

    .card-amount-summary {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        font-family: var(--font-mono);
        font-size: 13.5px;
        margin-bottom: 20px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--color-border);
    }

    .payment-element {
        min-height: 40px;
        margin-bottom: 20px;
    }

    .secure-note {
        font-size: 11.5px;
        color: var(--color-text-muted-5);
        margin: 16px 0 0;
    }

    .secondary-btn {
        font-weight: 500;
        font-size: 14px;
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-strong);
        border-radius: 8px;
        padding: 13px 18px;
    }

    .flex-1 {
        flex: 1;
    }

    .receipt-step {
        text-align: center;
        padding: 12px 0 4px;
    }

    .check-circle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 22px;
    }

    .check-mark {
        font-family: var(--font-mono);
        font-size: 24px;
        color: var(--color-accent-brighter);
    }

    .pulse-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--color-accent);
        margin: 12px auto 26px;
        animation: pulse 1.2s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.35; transform: scale(0.85); }
        50% { opacity: 1; transform: scale(1); }
    }

    .receipt-title {
        font-family: var(--font-mono);
        font-size: 21px;
        font-weight: 700;
        margin: 0 0 8px;
    }

    .receipt-message {
        font-size: 14px;
        line-height: 1.6;
        color: var(--color-text-muted-3);
        max-width: 400px;
        margin: 0 auto 28px;
    }

    .receipt-actions {
        display: flex;
        gap: 12px;
    }

    .receipt-primary-btn {
        width: 100%;
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 18px;
    }

    .summary-label {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-5);
        letter-spacing: 0.04em;
        margin-bottom: 12px;
    }

    .preview-box {
        background: var(--color-bg-inset);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .summary-design-name {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
        margin-bottom: 4px;
    }

    .design-meta {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-5);
        margin-bottom: 20px;
    }

    .summary-divider {
        border-top: 1px solid var(--color-border);
        padding-top: 16px;
    }

    .summary-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-5);
        margin-bottom: 8px;
    }

    .summary-row-last {
        margin-bottom: 0;
    }

    .summary-value {
        color: var(--color-text);
    }

    .summary-value-strong {
        color: var(--color-text);
        font-weight: 600;
    }
</style>

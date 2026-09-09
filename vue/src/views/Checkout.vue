<script setup lang="ts">
    import { computed, nextTick, onMounted, ref, watch } from "vue"
    import { useRoute } from "vue-router"
    import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import StepProgress from "@/components/ui/StepProgress.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import CharitySearchInput from "@/components/ui/CharitySearchInput.vue"
    import CharityResultsList from "@/components/ui/CharityResultsList.vue"
    import SelectedCharitySummary from "@/components/ui/SelectedCharitySummary.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"
    import { getOrgById } from "@/services/api"
    import type { iOrg } from "@/services/api"
    import { getDesign, type iDesign } from "@/services/designs"
    import { createCheckout } from "@/services/payments"
    import { useCharitySearch } from "@/composables/useCharitySearch"
    import { useAuthStore } from "@/stores/auth"

    const PLATFORM_MIN_CENTS = 99
    const PRESETS_CENTS = [500, 1000, 2500, 5000]
    const MAX_TOTAL_CENTS = 50000

    const route = useRoute()
    const authStore = useAuthStore()

    // the design this checkout will activate on success; absent for a
    // standalone "buy a year" purchase from the dashboard
    const designId = computed(() => (typeof route.query.designId === "string" ? route.query.designId : null))
    const design = ref<iDesign | null>(null)

    const step = ref(1)
    // within step 2: "amount" collects the total/split, "card" mounts the
    // Stripe Payment Element against a created PaymentIntent
    const paymentPhase = ref<"amount" | "card">("amount")
    const preparingPayment = ref(false)
    const paying = ref(false)
    const payError = ref("")
    // set true if the checkout API reports the user is already covered (a
    // race against the auth-store check)
    const forcedCovered = ref(false)

    // ----- charity -----------------------------------------------------------
    const selectedCharity = ref<iOrg | null>(null)
    const {
        searchResults,
        searchLoading,
        searchError,
        searchQuery,
        handleSearch: handleCharitySearch,
        handleCleared: handleCharitySearchCleared,
    } = useCharitySearch()

    function selectCharity(org: iOrg) {
        selectedCharity.value = org
    }
    function clearCharity() {
        selectedCharity.value = null
    }

    const hasCharity = computed(() => selectedCharity.value !== null)

    // ----- amount + split ---------------------------------------------------
    const totalCents = ref(1000)
    // the platform's cut; with a charity the user slides this between the
    // floor and the total, without one the whole total is the platform's
    const platformCents = ref(PLATFORM_MIN_CENTS)

    watch([totalCents, hasCharity], () => {
        const max = hasCharity.value ? totalCents.value : totalCents.value
        platformCents.value = Math.min(Math.max(platformCents.value, PLATFORM_MIN_CENTS), max)
    })

    const effectivePlatformCents = computed(() =>
        hasCharity.value ? Math.min(platformCents.value, totalCents.value) : totalCents.value,
    )
    const effectiveCharityCents = computed(() => Math.max(0, totalCents.value - effectivePlatformCents.value))

    function setTotal(cents: number) {
        totalCents.value = Math.min(Math.max(cents, PLATFORM_MIN_CENTS), MAX_TOTAL_CENTS)
    }
    function onTotalInput(e: Event) {
        const dollars = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(dollars)) setTotal(Math.round(dollars * 100))
    }

    // ----- auto-renew -----------------------------------------------------
    const autoRenew = ref(true)

    // ----- formatting / derived -----------------------------------------------
    function formatCents(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`
    }
    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    }

    // show the "already covered" panel only before a payment completes here -
    // once we reach the confirmation step the user is expected to be covered
    const alreadyCovered = computed(() => (authStore.isCovered || forcedCovered.value) && step.value < 3)
    const coveredUntilLabel = computed(() =>
        authStore.user?.paid_until ? formatDate(authStore.user.paid_until) : "",
    )

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
        payError.value = ""
        preparingPayment.value = true
        try {
            const res = await createCheckout({
                totalCents: totalCents.value,
                platformCents: effectivePlatformCents.value,
                autoRenew: autoRenew.value,
                ...(designId.value ? { designId: designId.value } : {}),
                ...(selectedCharity.value ? { charityEinId: selectedCharity.value.id } : {}),
            })
            const body = await res.json().catch(() => ({}))

            if (res.status === 409) {
                forcedCovered.value = true
                return
            }
            if (!res.ok) {
                payError.value = body.error ?? "Could not start checkout. Please try again."
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
                confirmParams: { return_url: `${window.location.origin}/checkout?paid=1` },
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

    // ----- step 3: wait for the webhook to open the paid period ------------
    const POLL_ATTEMPTS = 10
    const POLL_INTERVAL_MS = 2000
    const activationState = ref<"pending" | "active" | "timeout">("pending")

    async function pollForCoverage() {
        activationState.value = "pending"
        for (let i = 0; i < POLL_ATTEMPTS; i++) {
            await authStore.refreshMe()
            if (authStore.isCovered) {
                activationState.value = "active"
                return
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }
        activationState.value = authStore.isCovered ? "active" : "timeout"
    }

    watch(step, (value) => {
        if (value === 3) pollForCoverage()
    })

    onMounted(async () => {
        // returning from a 3DS/redirect payment method
        if (route.query.paid || route.query.redirect_status === "succeeded") {
            step.value = 3
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

        if (designId.value) {
            try {
                const res = await getDesign(designId.value)
                if (res.ok) {
                    const body = await res.json()
                    design.value = body.data?.[0] ?? null
                }
            } catch {
                // non-fatal - the summary just omits the design preview
            }
        }
    })
</script>

<template>
    <div class="page">
        <AppNavbar sticky />

        <main class="main">
            <!-- A user who's already covered can't buy a second year -->
            <BaseCard v-if="alreadyCovered" padding="clamp(24px,3vw,36px)" class="covered-card">
                <h1 class="step-title">You're already covered</h1>
                <p class="step-subtitle">
                    Your commits are automated through <strong>{{ coveredUntilLabel }}</strong>. There's nothing to pay
                    right now — manage your plan or auto-renew from
                    <RouterLink to="/settings" class="inline-link">settings</RouterLink>.
                </p>
                <div class="actions-end">
                    <RouterLink to="/dashboard"><BaseButton class="continue-btn">back to dashboard →</BaseButton></RouterLink>
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

                            <SelectedCharitySummary v-if="selectedCharity" :charity="selectedCharity" />
                            <p v-else class="no-charity-note">
                                No charity selected — your whole contribution will support the platform.
                            </p>

                            <button v-if="selectedCharity" type="button" class="text-btn" @click="clearCharity">
                                remove charity
                            </button>

                            <div class="search-wrap">
                                <CharitySearchInput @search="handleCharitySearch" @cleared="handleCharitySearchCleared" />
                                <CharityResultsList
                                    :results="searchResults"
                                    :loading="searchLoading"
                                    :error="searchError"
                                    :query="searchQuery"
                                    :selected-id="selectedCharity?.id ?? null"
                                    @select="selectCharity"
                                />
                            </div>

                            <div class="actions-end">
                                <BaseButton @click="step = 2" class="continue-btn">continue →</BaseButton>
                            </div>
                        </div>

                        <!-- STEP 2: AMOUNT then CARD -->
                        <div v-else-if="step === 2 && paymentPhase === 'amount'">
                            <h1 class="step-title">Set your contribution</h1>
                            <p class="amount-subtitle">
                                One payment covers a year of automated commits<span v-if="selectedCharity">
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
                                    :min="PLATFORM_MIN_CENTS"
                                    :max="totalCents"
                                    step="1"
                                    v-model.number="platformCents"
                                    class="split-range"
                                />
                                <p class="split-hint">
                                    drag left to send more to {{ selectedCharity.name }} (minimum platform share is
                                    {{ formatCents(PLATFORM_MIN_CENTS) }})
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

                            <label class="renew-row">
                                <div>
                                    <div class="renew-title">auto-renew every year</div>
                                    <div class="renew-sub">
                                        we'll charge this again each year so your design keeps painting. cancel anytime in
                                        settings.
                                    </div>
                                </div>
                                <ToggleSwitch data-testid="auto-renew-toggle" :checked="autoRenew" @click="autoRenew = !autoRenew" />
                            </label>

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
                                <span>paying <strong>{{ formatCents(totalCents) }}</strong>{{ autoRenew ? " / year" : "" }}</span>
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

                            <template v-else-if="activationState === 'active'">
                                <div class="check-circle"><span class="check-mark">✓</span></div>
                                <h1 class="receipt-title">You're all set.</h1>
                                <p v-if="design" class="receipt-message">
                                    <strong>{{ design.name }}</strong> is now painting on your contribution graph. It can
                                    take a few minutes to show up.
                                </p>
                                <p v-else class="receipt-message">
                                    Your year is active — now pick a design so your paid time isn't going to waste.
                                </p>
                                <div class="receipt-actions">
                                    <RouterLink v-if="!design" to="/editor" class="flex-1">
                                        <BaseButton class="receipt-primary-btn">create a design →</BaseButton>
                                    </RouterLink>
                                    <RouterLink to="/dashboard" class="flex-1">
                                        <BaseButton
                                            :variant="design ? undefined : 'secondary'"
                                            class="receipt-primary-btn"
                                            :class="{ 'secondary-btn': !design }"
                                        >go to dashboard{{ design ? " →" : "" }}</BaseButton>
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
                            <div class="summary-design-name">{{ design ? design.name : "1 year of automated commits" }}</div>
                            <div class="design-meta">
                                <span v-if="design">{{ previewCells.filter((c) => c.bg !== LEVEL_COLORS[0]).length }} squares · </span>
                                1 year{{ autoRenew ? " · auto-renews" : "" }}
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
    .covered-card {
        min-width: 0;
    }

    .covered-card {
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

    .search-wrap {
        margin: 18px 0 24px;
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

    .renew-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px;
        border-radius: 10px;
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border);
        margin-bottom: 20px;
        cursor: pointer;
    }

    .renew-title {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 2px;
    }

    .renew-sub {
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--color-text-muted-5);
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
